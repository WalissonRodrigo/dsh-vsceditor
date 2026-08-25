'use strict'
/**
 * dsh-vsceditor — Host half (host-plane composition plugin, mounted once per
 * process through the dsh profile bundle stack).
 *
 * Manages one code-server (full VSCode) process and bridges DSH file edits
 * into it over SSE + POST using ACP-session/update-style messages
 * (edit {path, oldText, newText, firstLine}, lock/unlock/follow/reveal). The
 * bundled dsh-bridge VSCode extension (vscode-ext/dsh-bridge) receives those
 * messages and opens native red/green diff views.
 *
 * Runs unscoped on purpose: scoped tool events admit unscoped listeners
 * (events flow up the scope chain), so one instance observes every session's
 * write/edit calls. The editor workspace follows whichever session's agent is
 * actively editing; a divergent workspace triggers a code-server restart on
 * the new folder.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PKG_ROOT = path.resolve(__dirname, '..')
const EXT_DIR = path.join(PKG_ROOT, 'vscode-ext')
const CONTROL_STATE = '/__dsh-vsceditor/state'
const CONTROL_ACTION = '/__dsh-vsceditor/action'

// ---------- configuration ----------
// Served as settings namespace "dsh-vsceditor" so 设置 → 插件 → 插件配置
// dispatches this plugin's card (the tab only dispatches namespaces the Host
// serves). The schema is a plain callable — schemastery-compatible in shape —
// so this plugin needs no @deepseek-ai/* dependency.
const SETTINGS_NS = 'dsh-vsceditor'
const CONFIG_DEFAULTS = { follow: true, autoStart: true, port: 0, codeServerHome: '' }

function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    follow: typeof c.follow === 'boolean' ? c.follow : CONFIG_DEFAULTS.follow,
    autoStart: typeof c.autoStart === 'boolean' ? c.autoStart : CONFIG_DEFAULTS.autoStart,
    port: Number.isInteger(c.port) && c.port >= 0 && c.port <= 65535 ? c.port : CONFIG_DEFAULTS.port,
    codeServerHome: typeof c.codeServerHome === 'string' ? c.codeServerHome : CONFIG_DEFAULTS.codeServerHome,
  }
}

// Callable settings schema: fn(value) -> resolved value, throwing on invalid.
// Strict on present-but-mistyped fields so bad writes through settings.update
// are rejected instead of silently coerced.
function configSchema(value) {
  if (value === undefined || value === null) return normalizeConfig({})
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('dsh-vsceditor 配置必须是对象')
  if (value.follow !== undefined && typeof value.follow !== 'boolean') throw new TypeError('follow 必须是布尔值')
  if (value.autoStart !== undefined && typeof value.autoStart !== 'boolean') throw new TypeError('autoStart 必须是布尔值')
  if (value.port !== undefined && !(Number.isInteger(value.port) && value.port >= 0 && value.port <= 65535)) throw new TypeError('port 必须是 0-65535 的整数（0 = 随机端口）')
  if (value.codeServerHome !== undefined && typeof value.codeServerHome !== 'string') throw new TypeError('codeServerHome 必须是字符串')
  return normalizeConfig(value)
}

// The settings registry needs more than a callable: describe() serializes
// schema.toJSON() for the browser mirror, and the secret-redaction walk reads
// type/dict/meta straight off the schema object. A bare function without
// these breaks describe() for EVERY namespace (the 插件配置 tab then renders
// blank), so keep this schemastery-compatible in shape.
configSchema.type = 'object'
configSchema.dict = {
  follow: { type: 'boolean', meta: { default: CONFIG_DEFAULTS.follow, description: '跟随 DSH 编辑：改文件时自动弹出 diff 并定位改动行' } },
  autoStart: { type: 'boolean', meta: { default: CONFIG_DEFAULTS.autoStart, description: 'DSH 启动后自动拉起 code-server' } },
  port: { type: 'number', meta: { default: CONFIG_DEFAULTS.port, description: '监听端口；0 = 随机（18200–18900）；改动自动重启编辑器' } },
  codeServerHome: { type: 'string', meta: { default: CONFIG_DEFAULTS.codeServerHome, description: '手动指定 code-server 安装目录；留空自动查找' } },
}
configSchema.meta = { description: '内嵌 VSCode 编辑器（code-server）' }
configSchema.toJSON = function () {
  return { type: configSchema.type, dict: configSchema.dict, meta: configSchema.meta }
}

function findCodeServer(cwd, home) {
  const candidates = [
    home || '',
    process.env.DSH_VSCEDITOR_HOME || '',
    cwd ? path.join(cwd, '.dsh-editor') : '',
    path.join(os.homedir(), '.dsh-editor'),
  ].filter(Boolean)
  for (const base of candidates) {
    const bin = path.join(base, 'code-server', 'bin', 'code-server')
    try {
      if (fs.statSync(bin).isFile()) return { bin, base }
    } catch (e) { /* keep looking */ }
  }
  return undefined
}

function readBody(req, limit, cb) {
  let body = ''
  req.on('data', (c) => {
    body += c
    if (body.length > limit) req.destroy()
  })
  req.on('end', () => cb(body))
}

function sendJson(res, value) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' })
  res.end(JSON.stringify(value))
}

function cwdOf(agent) {
  try {
    const session = agent && agent.session
    const header = session && session.header
    if (header && typeof header.cwd === 'string' && header.cwd) return header.cwd
    const meta = session && session.meta
    return meta && typeof meta.cwd === 'string' && meta.cwd ? meta.cwd : undefined
  } catch (e) {
    return undefined
  }
}

const plugin = {
  name: 'dsh-vsceditor',
  inject: ['webServer', 'subprocess', 'timer', 'agents'],
  apply(ctx, config) {
    const webServer = ctx.webServer
    const subprocess = ctx.subprocess

    const SFX = Math.random().toString(36).slice(2, 8)
    const EVENTS_PATH = '/__dsh-vsceditor-' + SFX + '/events'
    const RPC_PATH = '/__dsh-vsceditor-' + SFX + '/rpc'
    const token = 'vsced-' + Math.random().toString(36).slice(2) + Date.now().toString(36)

    const state = {
      workspaceRoot: '',
      proc: undefined,
      running: false,
      port: 0,
      follow: true,
      locked: Object.create(null),
      pendingBefore: Object.create(null),
      snapshots: Object.create(null),
      recent: [],
      sse: new Set(),
      lastEdit: undefined,
      lastError: '',
      notice: '',
      retries: 0,
      stopping: false,
      restartTimer: undefined,
    }

    const disposers = []

    // ---------- live configuration ----------
    // entryConfig is the composition-row base layer; once the settings service
    // accepts our namespace, the resolved section (base + user layer) becomes
    // authoritative and user edits apply live through the scope watcher.
    const entryConfig = normalizeConfig(config)
    let currentConfig = entryConfig
    let settingsScope
    const randomPort = 18200 + Math.floor(Math.random() * 700)
    function desiredPort() { return currentConfig.port > 0 ? currentConfig.port : randomPort }
    state.follow = currentConfig.follow

    function onConfigChanged(prev, next) {
      if (prev.follow !== next.follow) {
        state.follow = next.follow
        broadcast({ type: 'follow', enabled: next.follow })
      }
      const envChanged = prev.port !== next.port || prev.codeServerHome !== next.codeServerHome
      if (envChanged && state.running) restartServer()
      if (!prev.autoStart && next.autoStart && !state.running) { adoptFromExisting(); startServer() }
    }

    // One write path for every config source (settings card, panel checkbox).
    // With the settings service this persists to the user layer; without it
    // the change stays in memory for this run.
    function writeConfig(patch) {
      if (settingsScope) return settingsScope.update(patch)
      const prev = currentConfig
      currentConfig = configSchema(Object.assign({}, currentConfig, patch))
      onConfigChanged(prev, currentConfig)
      return Promise.resolve()
    }

    // ---------- shared helpers ----------
    function checkToken(req) {
      const m = /[?&]token=([^&]*)/.exec(req.url || '')
      return m !== null && decodeURIComponent(m[1]) === token
    }

    function broadcast(msg) {
      const frame = 'data: ' + JSON.stringify(msg) + '\n\n'
      for (const res of state.sse) {
        try { res.write(frame) } catch (e) {}
      }
    }

    function snapshot() {
      return {
        running: state.running,
        url: 'http://127.0.0.1:' + (state.port || desiredPort()) + '/',
        follow: state.follow,
        locked: Object.keys(state.locked),
        recent: state.recent.slice(0, 20),
        extConnected: state.sse.size > 0,
        lastError: state.lastError,
        notice: state.notice,
        workspace: state.workspaceRoot,
        config: currentConfig,
        settingsAvailable: settingsScope !== undefined,
      }
    }

    function diffStats(oldText, newText) {
      const a = oldText.split('\n')
      const b = newText.split('\n')
      const min = Math.min(a.length, b.length)
      let i = 0
      while (i < min && a[i] === b[i]) i++
      let j = 0
      while (j < min - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
      return { firstLine: i, added: Math.max(0, b.length - i - j), removed: Math.max(0, a.length - i - j) }
    }

    function editPathOf(exec) {
      if (!exec || (exec.name !== 'write' && exec.name !== 'edit')) return undefined
      const args = exec.arguments
      if (args && typeof args === 'object' && typeof args.file_path === 'string' && args.file_path.length > 0) return args.file_path
      return undefined
    }

    async function readFileSafe(p) {
      try { return await fs.promises.readFile(p, 'utf8') } catch (e) { return undefined }
    }

    function captureBefore(p) {
      readFileSafe(p).then((text) => {
        if (text !== undefined) state.pendingBefore[p] = text
      })
    }

    function handleEdited(p) {
      readFileSafe(p).then((newText) => {
        if (newText === undefined) return
        let oldText = ''
        if (Object.prototype.hasOwnProperty.call(state.pendingBefore, p)) oldText = state.pendingBefore[p]
        else if (Object.prototype.hasOwnProperty.call(state.snapshots, p)) oldText = state.snapshots[p]
        delete state.pendingBefore[p]
        if (newText === oldText) { state.snapshots[p] = newText; return }
        const st = diffStats(oldText, newText)
        state.snapshots[p] = newText
        state.recent.unshift({ path: p, at: Date.now(), added: st.added, removed: st.removed })
        if (state.recent.length > 50) state.recent.length = 50
        const msg = { type: 'edit', path: p, oldText, newText, firstLine: st.firstLine }
        state.lastEdit = msg
        broadcast(msg)
      })
    }

    // ---------- workspace follows the active editor agent ----------
    function adoptWorkspace(cwd) {
      if (!cwd || cwd === state.workspaceRoot) return
      const first = !state.workspaceRoot
      state.workspaceRoot = cwd
      if (first) {
        if (currentConfig.autoStart) startServer()
      } else {
        state.notice = '工作区已切换：' + cwd
        restartServer()
      }
    }

    // Boot-order race: sessions may resume before this plugin mounts, so
    // 'agent/created' can be missed entirely. Sweep the live agent registry
    // instead of relying on the event alone.
    function adoptFromExisting() {
      if (state.workspaceRoot) return
      try {
        const agents = ctx.agents
        if (!agents) return
        const running = []
        const rest = []
        for (const a of agents.list()) {
          try {
            if (a && a.status === 'running') running.push(a)
            else rest.push(a)
          } catch (e) { rest.push(a) }
        }
        for (const a of running.concat(rest)) {
          const cwd = cwdOf(a)
          if (cwd) { adoptWorkspace(cwd); return }
        }
      } catch (e) {}
    }

    // ---------- extension bridge routes (unique per boot) ----------
    disposers.push(webServer.register({
      kind: 'exact',
      path: EVENTS_PATH,
      handler(req, res) {
        if (!checkToken(req)) { res.statusCode = 403; res.end('forbidden'); return }
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' })
        res.write(': dsh-vsceditor\n\n')
        state.sse.add(res)
        try {
          res.write('data: ' + JSON.stringify({ type: 'hello', follow: state.follow, locked: Object.keys(state.locked), workspace: state.workspaceRoot }) + '\n\n')
          // Every code-server window is a fresh extension host (each click on
          // the editor tab spawns one), so replay the latest edit: the new
          // window immediately shows the most recent DSH change instead of an
          // empty workbench.
          if (state.lastEdit && state.follow) {
            res.write('data: ' + JSON.stringify(state.lastEdit) + '\n\n')
          }
        } catch (e) {}
        req.on('close', () => { state.sse.delete(res) })
      },
    }))

    disposers.push(webServer.register({
      kind: 'exact',
      path: RPC_PATH,
      handler(req, res) {
        if (!checkToken(req)) { res.statusCode = 403; res.end('forbidden'); return }
        readBody(req, 65536, (body) => {
          try {
            const msg = JSON.parse(body || '{}')
            if (msg && msg.type === 'log') console.log('[dsh-bridge-ext]', msg.message)
          } catch (e) {}
          res.statusCode = 204
          res.end()
        })
      },
    }))

    // ---------- control routes used by the web panel ----------
    disposers.push(webServer.register({
      kind: 'exact',
      path: CONTROL_STATE,
      handler(req, res) { adoptFromExisting(); sendJson(res, snapshot()) },
    }))
    disposers.push(webServer.register({
      kind: 'exact',
      path: CONTROL_ACTION,
      handler(req, res) {
        readBody(req, 65536, (body) => {
          try {
            const msg = JSON.parse(body || '{}')
            if (msg.action === 'set-follow') {
              writeConfig({ follow: !!msg.enabled })
                .then(() => sendJson(res, { ok: true, config: currentConfig, persisted: settingsScope !== undefined }))
                .catch((e) => sendJson(res, { ok: false, error: String(e && e.message ? e.message : e) }))
              return
            }
            if (msg.action === 'set-config' && msg.patch && typeof msg.patch === 'object' && !Array.isArray(msg.patch)) {
              writeConfig(msg.patch)
                .then(() => sendJson(res, { ok: true, config: currentConfig, persisted: settingsScope !== undefined }))
                .catch((e) => sendJson(res, { ok: false, error: String(e && e.message ? e.message : e) }))
              return
            }
            if (msg.action === 'reveal' && typeof msg.path === 'string') {
              broadcast({ type: 'reveal', path: msg.path, line: typeof msg.line === 'number' ? msg.line : 0 })
            } else if (msg.action === 'restart') {
              restartServer()
            } else if (msg.action === 'start') {
              adoptFromExisting()
              startServer()
            }
            sendJson(res, { ok: true })
          } catch (e) {
            sendJson(res, { ok: false, error: String(e && e.message ? e.message : e) })
          }
        })
      },
    }))

    // ---------- edit tracking across every session (unscoped listener) ----------
    ctx.on('agent/created', (payload) => {
      try {
        const cwd = cwdOf(payload && payload.agent)
        if (cwd) adoptWorkspace(cwd)
      } catch (e) {}
    })

    ctx.on('tools/pre-execute', (exec, next) => {
      try {
        adoptWorkspace(cwdOf(exec && exec.agent) || state.workspaceRoot)
        const p = editPathOf(exec)
        if (p !== undefined) {
          state.locked[p] = true
          broadcast({ type: 'lock', path: p })
          captureBefore(p)
        }
      } catch (e) {}
      return next()
    })

    ctx.on('tools/result', (exec, result) => {
      try {
        const p = editPathOf(exec)
        if (p === undefined) return
        delete state.locked[p]
        broadcast({ type: 'unlock', path: p })
        if (result && result.isError) return
        handleEdited(p)
      } catch (e) {}
    })

    // ---------- code-server process ----------
    function startServer() {
      if (state.proc !== undefined || state.stopping) return
      if (!state.workspaceRoot) {
        state.notice = '等待第一个会话以确定工作区…'
        return
      }
      const found = findCodeServer(state.workspaceRoot, currentConfig.codeServerHome)
      if (!found) {
        state.lastError = '未找到 code-server（查找过 配置的 codeServerHome、$DSH_VSCEDITOR_HOME、<工作区>/.dsh-editor、~/.dsh-editor）'
        return
      }
      const port = desiredPort()
      state.port = port
      const dataBase = path.join(state.workspaceRoot, '.dsh-editor')
      try {
        fs.mkdirSync(path.join(dataBase, 'user-data'), { recursive: true })
        fs.mkdirSync(path.join(dataBase, 'config'), { recursive: true })
      } catch (e) { /* code-server will surface its own error */ }
      try {
        const proc = subprocess.spawn({
          argv: [
            found.bin,
            '--bind-addr', '127.0.0.1:' + port,
            '--auth', 'none',
            '--disable-telemetry',
            '--disable-update-check',
            '--disable-workspace-trust',
            '--extensions-dir', EXT_DIR,
            '--user-data-dir', path.join(dataBase, 'user-data'),
            state.workspaceRoot,
          ],
          cwd: state.workspaceRoot,
          stdio: { stdin: 'ignore', stdout: { maxBytes: 65536 }, stderr: { maxBytes: 65536 } },
          graceMs: 3000,
          env: {
            XDG_CONFIG_HOME: path.join(dataBase, 'config'),
            XDG_DATA_HOME: path.join(dataBase, 'user-data'),
            DSH_BRIDGE_URL: 'http://127.0.0.1:' + webServer.port,
            DSH_BRIDGE_EVENTS: 'http://127.0.0.1:' + webServer.port + EVENTS_PATH,
            DSH_BRIDGE_RPC: 'http://127.0.0.1:' + webServer.port + RPC_PATH,
            DSH_BRIDGE_TOKEN: token,
          },
        })
        state.proc = proc
        state.running = true
        state.lastError = ''
        proc.done.then((out) => {
          state.running = false
          if (state.proc === proc) state.proc = undefined
          let tail = ''
          try { if (proc.collected && proc.collected.stderr) tail = proc.collected.stderr.readFrom(0).text } catch (e) {}
          try { if (!tail && proc.collected && proc.collected.stdout) tail = proc.collected.stdout.readFrom(0).text } catch (e) {}
          state.lastError = 'code-server exited: code=' + out.exitCode + ' signal=' + out.signal + (tail ? ' | ' + tail.slice(-600) : '')
          if (!state.stopping && state.retries < 4) {
            state.retries += 1
            ctx.timeout(() => startServer(), 2000)
          }
        }).catch((err) => {
          state.running = false
          if (state.proc === proc) state.proc = undefined
          state.lastError = String(err)
        })
      } catch (e) {
        state.lastError = 'spawn failed: ' + (e && e.message ? e.message : String(e))
      }
    }

    function restartServer() {
      state.retries = 0
      const p = state.proc
      state.proc = undefined
      state.running = false
      if (p) { try { p.terminate() } catch (e) {} }
      if (state.restartTimer !== undefined) return
      state.restartTimer = ctx.timeout(() => {
        state.restartTimer = undefined
        startServer()
      }, 1200)
    }

    // ---------- settings namespace (设置 → 插件 → 插件配置) ----------
    // Serve SETTINGS_NS so the configurable-plugins tab dispatches our card.
    // When the service is already up this runs synchronously, so the stored
    // user layer is applied before the auto-start below.
    ctx.inject(['settings'], (sctx) => {
      let scope
      try {
        scope = sctx.settings.register(SETTINGS_NS, configSchema, { base: entryConfig })
      } catch (e) {
        state.lastError = '设置命名空间注册失败：' + (e && e.message ? e.message : e)
        return
      }
      settingsScope = scope
      const prev = currentConfig
      currentConfig = scope.get()
      onConfigChanged(prev, currentConfig)
      scope.watch(() => {
        const p = currentConfig
        currentConfig = scope.get()
        onConfigChanged(p, currentConfig)
      })
    })

    // Adopt a workspace immediately from sessions that already exist (the
    // common case right after a DSH restart: sessions resume before/without
    // any 'agent/created' firing). Retry briefly while sessions finish
    // resuming so the editor comes up on its own.
    adoptFromExisting()
    ctx.timeout(() => adoptFromExisting(), 3000)
    ctx.timeout(() => adoptFromExisting(), 10000)

    // ---------- lifecycle ----------
    ctx.interval(() => {
      for (const res of state.sse) { try { res.write(': ping\n\n') } catch (e) {} }
    }, 25000)

    ctx.effect(() => {
      return () => {
        state.stopping = true
        for (const d of disposers) { try { d() } catch (e) {} }
        const p = state.proc
        state.proc = undefined
        state.running = false
        if (p) { try { p.terminate() } catch (e) {} }
      }
    }, 'dsh-vsceditor')
  },
}

module.exports = plugin
