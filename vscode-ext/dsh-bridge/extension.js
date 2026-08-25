// dsh-bridge — connects this code-server instance to a DeepSeek Harness host.
// Transport: SSE (host -> extension) + HTTP POST (extension -> host).
// Message shapes are modeled on ACP session/update semantics:
//   host -> ext:  hello | follow | edit | lock | unlock | reveal
//   ext  -> host: ready | opened | log
const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
// Debug log is opt-in: set DSH_BRIDGE_DEBUG to a non-empty value to append
// traces to /tmp/dsh-bridge-debug.log.
const DEBUG = !!process.env.DSH_BRIDGE_DEBUG;
function dbg(msg) {
  if (!DEBUG) return;
  try { fs.appendFileSync('/tmp/dsh-bridge-debug.log', new Date().toISOString() + ' [pid ' + process.pid + '] ' + msg + '\n'); } catch (e) {}
}

const state = {
  follow: true,
  locked: new Set(),
  connected: false,
  sseReq: null,
  reconnectTimer: null,
  lastKnown: new Map(), // fsPath -> last authoritative text (disk / DSH edit)
  reverting: new Set(),
  statusBar: null,
};

function bridgeUrl() { return process.env.DSH_BRIDGE_URL || ''; }
function eventsUrl() { return process.env.DSH_BRIDGE_EVENTS || (bridgeUrl() + '/__dsh-editor/events'); }
function rpcUrl() { return process.env.DSH_BRIDGE_RPC || (bridgeUrl() + '/__dsh-editor/rpc'); }
function token() { return process.env.DSH_BRIDGE_TOKEN || ''; }
function log(msg) {
  console.log('[dsh-bridge] ' + msg);
  post({ type: 'log', message: String(msg) });
}

// ---------- extension -> host ----------
function post(msg) {
  try {
    const u = new URL(rpcUrl());
    if (u.protocol.indexOf('http') !== 0) return;
    u.search = (u.search ? u.search + '&' : '?') + 'token=' + encodeURIComponent(token());
    const body = JSON.stringify(msg);
    const req = http.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => { res.resume(); });
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.end(body);
  } catch (e) { /* never throw from telemetry */ }
}

// ---------- snapshot (diff left side) ----------
class SnapshotProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChange = this._emitter.event;
    this._contents = new Map(); // key(fsPath) -> oldText
  }
  set(fsPath, text) {
    this._contents.set(fsPath, text);
    this._emitter.fire(snapUri(fsPath));
  }
  provideTextDocumentContent(uri) {
    const key = decodeURIComponent(uri.query || '');
    dbg('provider called, key=' + key + ' hit=' + this._contents.has(key));
    return this._contents.get(key) ?? '';
  }
}
function snapUri(fsPath) {
  return vscode.Uri.parse('dsh-snap://snapshot' + encodePath(fsPath) + '?' + encodeURIComponent(fsPath));
}
function encodePath(p) { return '/' + p.split('/').map(encodeURIComponent).join('/'); }
const snapshots = new SnapshotProvider();

// ---------- host -> ext message handlers ----------
async function onEdit(msg) {
  const fsPath = msg.path;
  dbg('onEdit start, follow=' + state.follow);
  snapshots.set(fsPath, typeof msg.oldText === 'string' ? msg.oldText : '');
  state.lastKnown.set(fsPath, typeof msg.newText === 'string' ? msg.newText : state.lastKnown.get(fsPath));
  if (!state.follow) { post({ type: 'ack', kind: 'edit', path: fsPath, follow: false }); return; }
  try {
    const left = snapUri(fsPath);
    const right = vscode.Uri.file(fsPath);
    const base = fsPath.split('/').pop() || fsPath;
    dbg('calling vscode.diff, windowFocused=' + vscode.window.state.focused + ' visibleEditors=' + vscode.window.visibleTextEditors.length);
    const diffDone = vscode.commands.executeCommand('vscode.diff', left, right, 'DSH: ' + base + ' ⟵ 修改前 | 当前 ⟶');
    const raced = await Promise.race([
      diffDone.then((r) => ({ ok: true, r: r })).catch((e) => ({ ok: false, e: e })),
      new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), 6000)),
    ]);
    if (raced && raced.timeout) { dbg('diff TIMEOUT after 6s (promise still pending) for ' + base); }
    else if (raced && raced.ok) { dbg('diff opened for ' + base); }
    else { dbg('diff REJECTED for ' + base + ': ' + (raced && raced.e && raced.e.message)); throw raced.e; }
    diffDone.catch(() => {});
    setTimeout(() => {
      const ed = vscode.window.activeTextEditor;
      if (ed && typeof msg.firstLine === 'number' && msg.firstLine >= 0) {
        const line = Math.min(msg.firstLine, Math.max(0, ed.document.lineCount - 1));
        const pos = new vscode.Position(line, 0);
        try {
          ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          ed.selection = new vscode.Selection(pos, pos);
        } catch (e) {}
      }
    }, 450);
    post({ type: 'ack', kind: 'edit', path: fsPath, follow: true });
  } catch (e) {
    dbg('diff FAILED for ' + fsPath + ': ' + (e && e.message) + ' ' + (e && e.stack));
    log('diff failed for ' + fsPath + ': ' + (e && e.message));
    post({ type: 'ack', kind: 'edit-error', path: fsPath, error: String(e && e.message) });
  }
}

async function onReveal(msg) {
  dbg('onReveal start: ' + msg.path);
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.path));
    const ed = await vscode.window.showTextDocument(doc, { preview: true });
    if (typeof msg.line === 'number' && msg.line >= 0) {
      const line = Math.min(msg.line, Math.max(0, doc.lineCount - 1));
      const pos = new vscode.Position(line, 0);
      ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      ed.selection = new vscode.Selection(pos, pos);
    }
  } catch (e) {
    log('reveal failed: ' + (e && e.message));
  }
}

function handleMessage(msg) {
  if (!msg || typeof msg.type !== 'string') return;
  dbg('recv: ' + msg.type + (msg.path ? ' ' + msg.path : ''));
  switch (msg.type) {
    case 'hello':
      state.follow = !!msg.follow;
      state.locked = new Set(Array.isArray(msg.locked) ? msg.locked : []);
      updateStatus();
      break;
    case 'follow':
      state.follow = !!msg.enabled;
      updateStatus();
      break;
    case 'lock':
      if (msg.path) state.locked.add(msg.path);
      break;
    case 'unlock':
      if (msg.path) state.locked.delete(msg.path);
      break;
    case 'edit':
      onEdit(msg);
      break;
    case 'reveal':
      onReveal(msg);
      break;
  }
}

// ---------- SSE client ----------
function connectSSE() {
  const target = eventsUrl();
  if (!bridgeUrl() && !process.env.DSH_BRIDGE_EVENTS) { setStatus(false, 'no bridge env'); return; }
  if (state.sseReq) { try { state.sseReq.destroy(); } catch (e) {} state.sseReq = null; }
  const u = new URL(target);
  u.search = (u.search ? u.search + '&' : '?') + 'token=' + encodeURIComponent(token());
  const req = http.get({
    hostname: u.hostname,
    port: u.port,
    path: u.pathname + u.search,
    headers: { accept: 'text/event-stream' },
  }, (res) => {
    if (res.statusCode !== 200) {
      setStatus(false, 'HTTP ' + res.statusCode);
      res.resume();
      scheduleReconnect();
      return;
    }
    state.connected = true;
    updateStatus();
    dbg('SSE connected to ' + target);
    post({ type: 'ready', version: '0.1.0' });
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of frame.split('\n')) {
          if (line.startsWith('data:')) {
            try { handleMessage(JSON.parse(line.slice(5).trim())); } catch (e) {}
          }
        }
      }
    });
    res.on('end', () => { state.connected = false; updateStatus(); scheduleReconnect(); });
    res.on('error', () => { state.connected = false; updateStatus(); scheduleReconnect(); });
  });
  req.on('error', () => { state.connected = false; updateStatus(); scheduleReconnect(); });
  state.sseReq = req;
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectSSE();
  }, 2500);
}

// ---------- status ----------
function setStatus(connected, note) {
  state.connected = connected;
  updateStatus(note);
}
function updateStatus(note) {
  if (!state.statusBar) return;
  const conn = state.connected ? '$(plug) DSH' : '$(debug-disconnect) DSH';
  const mode = state.follow ? '跟随' : '编辑';
  state.statusBar.text = conn + ' · ' + mode + (note ? ' · ' + note : '');
  state.statusBar.tooltip = state.connected
    ? 'DSH Bridge 已连接（' + (state.follow ? '跟随模式：只读+diff' : '编辑模式：锁定 DSH 占用文件') + '）'
    : 'DSH Bridge 未连接，点击重连';
}

// ---------- edit protection ----------
function isProtected(fsPath) {
  return state.follow || state.locked.has(fsPath);
}
function revertDocument(doc) {
  const fsPath = doc.uri.fsPath;
  if (state.reverting.has(fsPath)) return;
  const known = state.lastKnown.get(fsPath);
  if (typeof known !== 'string') return;
  if (doc.getText() === known) return;
  state.reverting.add(fsPath);
  const full = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  const we = new vscode.WorkspaceEdit();
  we.replace(doc.uri, full, known);
  vscode.workspace.applyEdit(we).then((ok) => {
    state.reverting.delete(fsPath);
    if (ok) {
      vscode.window.setStatusBarMessage(
        state.follow ? 'DSH 跟随模式为只读：你的修改已回退（在 DSH 面板关闭跟随后可编辑）'
                     : '该文件正在被 DSH 编辑：你的修改已回退', 4000);
    }
  });
}

function activate(context) {
  dbg('activate, bridge=' + (process.env.DSH_BRIDGE_EVENTS || '(none)'));
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('dsh-snap', snapshots)
  );

  state.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  state.statusBar.command = 'dsh-bridge.reconnect';
  state.statusBar.show();
  context.subscriptions.push(state.statusBar);

  context.subscriptions.push(vscode.commands.registerCommand('dsh-bridge.reconnect', () => {
    connectSSE();
  }));

  // Track authoritative content; revert edits on protected docs.
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((doc) => {
    if (doc.uri.scheme === 'file') state.lastKnown.set(doc.uri.fsPath, doc.getText());
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.uri.scheme === 'file') state.lastKnown.set(doc.uri.fsPath, doc.getText());
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
    const doc = e.document;
    if (doc.uri.scheme !== 'file' || !e.contentChanges.length) return;
    if (state.reverting.has(doc.uri.fsPath)) return;
    if (isProtected(doc.uri.fsPath)) {
      revertDocument(doc);
    } else {
      state.lastKnown.set(doc.uri.fsPath, doc.getText());
    }
  }));

  updateStatus();
  connectSSE();
}

function deactivate() {
  if (state.sseReq) { try { state.sseReq.destroy(); } catch (e) {} }
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
}

module.exports = { activate, deactivate };
