/* dsh-vsceditor — Client half (web boot bundle, hand-written in the
 * window.__ModuleLoader__ format that dsh-client-modules serves).
 * Registers a conversation view tab (对话 / 轨迹 / 编辑器) hosting the
 * code-server iframe; talks to the host half over /__dsh-vsceditor/*.
 */
window.__ModuleLoader__.load({
  id: 'dsh-vsceditor',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var STATE_URL = '/__dsh-vsceditor/state'
    var ACTION_URL = '/__dsh-vsceditor/action'

    var CSS =
      '.dsh-vsced-view{display:flex;flex-direction:column;height:100%;min-height:0;background:#1b1b1e;color:#ddd}' +
      '.dsh-vsced-toolbar{display:flex;align-items:center;gap:8px;padding:6px 10px;font-size:12px;border-bottom:1px solid rgba(128,128,128,.25);flex:none}' +
      '.dsh-vsced-toolbar .sp{flex:1}' +
      '.dsh-vsced-toolbar label{display:flex;align-items:center;gap:4px;cursor:pointer}' +
      '.dsh-vsced-btn{padding:3px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font-size:12px;cursor:pointer;text-decoration:none;display:inline-block}' +
      '.dsh-vsced-btn:hover{background:rgba(128,128,128,.15)}' +
      '.dsh-vsced-frame{flex:1;border:0;width:100%;min-height:0;background:#1e1e1e}' +
      '.dsh-vsced-anchor{flex:1;min-height:0;position:relative}' +
      '.dsh-vsced-frame-float{position:fixed;z-index:50;border:0;background:#1e1e1e}' +
      // 设置页卡片：对齐官方 PluginCard 的折叠样式（边框/圆角/hover/箭头旋转），
      // 主题变量来自 shell，括号内是兜底值。
      '.dsh-vsced-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-3,transparent);border-radius:12px;font-size:13px;color:inherit;transition:border-color .16s,background .16s}' +
      '.dsh-vsced-card:hover{border-color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.5))}' +
      '.dsh-vsced-card-open{background:var(--dsw-alias-bg-layer-2,transparent);border-color:var(--dsw-alias-label-dimmed,rgba(128,128,128,.5))}' +
      '.dsh-vsced-cardhead{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
      '.dsh-vsced-cardhead:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d8fff);outline-offset:-2px}' +
      '.dsh-vsced-headtext{display:flex;flex-direction:column;flex:1;gap:4px;min-width:0}' +
      '.dsh-vsced-name{font-size:15px;font-weight:600;line-height:1.4;display:flex;align-items:center;gap:8px}' +
      '.dsh-vsced-desc{color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:1.5}' +
      '.dsh-vsced-status{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;flex:none}' +
      '.dsh-vsced-chevron{color:var(--dsw-alias-label-tertiary,#999);flex:none;transition:transform .16s;display:inline-flex}' +
      '.dsh-vsced-chevron-open{transform:rotate(180deg)}' +
      '.dsh-vsced-cardbody{border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));margin:0 16px;padding:12px 0 8px;display:flex;flex-direction:column;gap:10px}' +
      '.dsh-vsced-card .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.dsh-vsced-card .hint{color:var(--dsw-alias-label-tertiary,#999);font-size:12px}' +
      '.dsh-vsced-card input[type=text],.dsh-vsced-card input[type=number]{background:rgba(128,128,128,.12);border:1px solid rgba(128,128,128,.3);border-radius:6px;color:inherit;padding:4px 8px;font-size:12px}' +
      '.dsh-vsced-view .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:720px}' +
      '.dsh-vsced-view .hint{color:#999;font-size:12px;max-width:720px}' +
      // 本机 VS Code 连接向导（命令式弹窗，挂在 body 上，切标签页不销毁）
      '.dsh-vsced-wiz-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center}' +
      '.dsh-vsced-wiz{background:var(--dsw-alias-bg-layer-2,#2a2a2e);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:12px;width:480px;max-width:92vw;padding:18px 20px;color:var(--dsw-alias-label-primary,inherit);font-size:13px;box-shadow:0 12px 40px rgba(0,0,0,.4)}' +
      '.dsh-vsced-wiz-title{font-size:15px;font-weight:600;margin-bottom:10px}' +
      '.dsh-vsced-wiz-step{display:flex;gap:8px;padding:6px 0;align-items:flex-start}' +
      '.dsh-vsced-wiz-icon{flex:none;width:16px;text-align:center;line-height:1.5}' +
      '.dsh-vsced-wiz-detail{color:var(--dsw-alias-label-tertiary,#999);font-size:12px;margin-top:2px;word-break:break-all}' +
      '.dsh-vsced-wiz-log{margin-top:10px;font-size:12px;color:var(--dsw-alias-label-tertiary,#999);line-height:1.7}' +
      '.dsh-vsced-wiz-log code{user-select:all;background:rgba(128,128,128,.15);padding:1px 5px;border-radius:4px}' +
      '.dsh-vsced-wiz-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}' +
      '@keyframes dsh-vsced-spin{to{transform:rotate(360deg)}}' +
      '.dsh-vsced-spin{display:inline-block;animation:dsh-vsced-spin 1s linear infinite}' +
      '.dsh-vsced-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-size:13px;color:#999;padding:24px;text-align:center}' +
      '.dsh-vsced-dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none}' +
      '.dsh-vsced-tab{display:inline-flex;align-items:center;gap:5px}' +
      '.dsh-vsced-tab .dsh-vsced-dot{width:7px;height:7px}' +
      'body.dsh-vsced-active [data-composer-seat]{display:none!important}'

    function fetchState() {
      return fetch(STATE_URL, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status)
        return r.json()
      })
    }
    function postAction(body) {
      return fetch(ACTION_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json() }).catch(function () { return null })
    }
    function useEditorState() {
      var st = React.useState(null)
      React.useEffect(function () {
        var alive = true
        var tick = function () { fetchState().then(function (s) { if (alive) st[1](s) }).catch(function () { if (alive) st[1]({ failed: true }) }) }
        tick()
        var id = setInterval(tick, 2500)
        return function () { alive = false; clearInterval(id) }
      }, [])
      return st[0]
    }

    function dot(color) {
      return React.createElement('span', { className: 'dsh-vsced-dot', style: { background: color } })
    }
    function statusOf(st) {
      if (!st) return { color: '#888', text: '加载中' }
      if (st.failed) return { color: '#f85149', text: '桥接未挂载' }
      if (st.backend === 'local' || (st.config && st.config.editorBackend === 'local')) {
        if (st.extConnected) {
          if (st.extReady && st.extReady.trusted === false) return { color: '#d29922', text: '等待信任工作区' }
          return { color: '#3fb950', text: '本机 VS Code 已连接' }
        }
        if (st.desktop && st.desktop.extInstalled) return { color: '#d29922', text: '等待扩展连接' }
        if (st.desktop && st.desktop.cli) return { color: '#f85149', text: '扩展未安装' }
        return { color: '#f85149', text: '未检测到 VS Code' }
      }
      if (st.extConnected) return { color: '#3fb950', text: '扩展已连接' }
      if (st.install && st.install.phase === 'running') return { color: '#d29922', text: '安装 code-server 中' }
      if (st.running) return { color: '#d29922', text: '等待扩展连接' }
      if (st.lastError && st.lastError.indexOf('未找到 code-server') >= 0) return { color: '#f85149', text: '未安装 code-server' }
      return { color: '#f85149', text: '未运行' }
    }

    // ---- persistent code-server iframe (survives tab switches) ----
    // The shell unmounts inactive tab views, and a detached iframe loses its
    // browsing context — that was the "new session on every click" bug. So the
    // plugin owns the iframe: it stays attached to <body> forever and is only
    // hidden/shown + positioned over a placeholder the view renders.
    var frame = null
    var frameUrl = ''
    var anchorEl = null
    var anchorOn = false

    function ensureFrame(url) {
      if (!frame) {
        frame = document.createElement('iframe')
        frame.className = 'dsh-vsced-frame-float'
        frame.style.display = 'none'
        document.body.appendChild(frame)
      }
      if (url && url !== frameUrl) { frameUrl = url; frame.src = url }
    }
    function syncFrame() {
      if (!frame) return
      if (!anchorOn || !anchorEl || !frameUrl || !document.body.contains(anchorEl)) {
        if (frame.style.display !== 'none') frame.style.display = 'none'
        return
      }
      var r = anchorEl.getBoundingClientRect()
      if (r.width < 20 || r.height < 20) { frame.style.display = 'none'; return }
      if (frame.style.display !== 'block') frame.style.display = 'block'
      var css = r.top + 'px,' + r.left + 'px,' + r.width + 'px,' + r.height + 'px'
      if (frame.__lastCss !== css) {
        frame.__lastCss = css
        frame.style.top = r.top + 'px'
        frame.style.left = r.left + 'px'
        frame.style.width = r.width + 'px'
        frame.style.height = r.height + 'px'
      }
    }

    // ---- 本机 VS Code 连接向导 ----
    // 与常驻 iframe 同理：shell 会卸载非激活标签页的 React 树，弹窗放里面
    // 会被销毁，所以向导用命令式 DOM 挂在 body 上，切标签页也不中断。
    // 流程：探测 VS Code → 检查/安装桥扩展 → 等待扩展连接（最长 120s）。
    // 失败时给出扩展日志文件位置（~/.dsh-editor/bridge-ext.log）方便排查。
    var wizardEl = null

    function openWizard() {
      if (wizardEl) return
      var steps = [
        { label: '探测本机 VS Code', status: 'pending', detail: '' },
        { label: '检查 / 安装桥扩展', status: 'pending', detail: '' },
        { label: '等待扩展连接', status: 'pending', detail: '' },
      ]
      var phase = 'running' // running | ok | fail
      var failInfo = ''

      var backdrop = document.createElement('div')
      backdrop.className = 'dsh-vsced-wiz-backdrop'
      var panel = document.createElement('div')
      panel.className = 'dsh-vsced-wiz'
      backdrop.appendChild(panel)
      document.body.appendChild(backdrop)
      wizardEl = backdrop

      function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;') }
      function icon(st) {
        if (st === 'running') return '<span class="dsh-vsced-spin">◌</span>'
        if (st === 'ok') return '<span style="color:#3fb950">✓</span>'
        if (st === 'fail') return '<span style="color:#f85149">✗</span>'
        return '<span style="color:#666">○</span>'
      }
      function render() {
        var html = '<div class="dsh-vsced-wiz-title">连接本机 VS Code</div>'
        for (var i = 0; i < steps.length; i++) {
          var s = steps[i]
          html += '<div class="dsh-vsced-wiz-step"><span class="dsh-vsced-wiz-icon">' + icon(s.status) + '</span><div><div>' +
            esc(s.label) + '</div>' +
            (s.detail ? '<div class="dsh-vsced-wiz-detail">' + esc(s.detail) + '</div>' : '') + '</div></div>'
        }
        if (phase === 'fail') {
          html += '<div class="dsh-vsced-wiz-log">调试日志（可拷贝给开发者排查）：<br>扩展侧 <code>~/.dsh-editor/bridge-ext.log</code>' +
            (failInfo ? '<br>错误：' + esc(failInfo) : '') + '</div>'
        }
        html += '<div class="dsh-vsced-wiz-btns">'
        if (phase === 'running') html += '<button class="dsh-vsced-btn" data-act="close">取消</button>'
        else if (phase === 'ok') html += '<button class="dsh-vsced-btn" data-act="close">确定</button>'
        else html += '<button class="dsh-vsced-btn" data-act="retry">重试</button><button class="dsh-vsced-btn" data-act="close">关闭</button>'
        html += '</div>'
        panel.innerHTML = html
      }
      function close() { if (wizardEl) { wizardEl.remove(); wizardEl = null } }
      backdrop.addEventListener('click', function (e) {
        var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act')
        if (act === 'close') close()
        else if (act === 'retry') {
          phase = 'running'
          failInfo = ''
          for (var i = 0; i < steps.length; i++) { steps[i].status = 'pending'; steps[i].detail = '' }
          render()
          run()
        } else if (e.target === backdrop && phase !== 'running') close()
      })
      function setStep(i, status, detail) {
        steps[i].status = status
        if (detail !== undefined) steps[i].detail = detail
        if (wizardEl) render()
      }

      async function run() {
        // 1. 探测本机 VS Code
        setStep(0, 'running')
        var r = await postAction({ action: 'detect-vscode' })
        var d = r && r.desktop
        if (!d || !d.cli) {
          phase = 'fail'
          failInfo = (r && r.error) || '未检测到本机 VS Code'
          setStep(0, 'fail', '未检测到 VS Code：请在「设置 → 插件配置」里手动指定 VS Code 路径后重试')
          return
        }
        setStep(0, 'ok', d.cli + (d.version ? '（' + d.version + '）' : ''))
        // 2. 检查 / 安装桥扩展
        if (d.extInstalled && d.extUpToDate) {
          setStep(1, 'ok', '已安装 v' + d.extVersion)
        } else {
          setStep(1, 'running', d.extInstalled ? '发现旧版本 v' + d.extVersion + '，正在更新…' : '未安装，正在安装…')
          var ir = await postAction({ action: 'install-extension' })
          if (!ir || !ir.ok) {
            phase = 'fail'
            failInfo = (ir && ir.error) || '未知错误'
            setStep(1, 'fail', ir && ir.manual
              ? '自动安装失败，可手动拷贝：' + ir.manual.from + ' → ' + ir.manual.to
              : '安装失败：' + failInfo)
            return
          }
          setStep(1, 'ok', '已安装 v' + ir.version + '（若 VS Code 已打开，请 Reload Window）')
        }
        // 3. 等待扩展连接（轮询，最长 120s）
        setStep(2, 'running', '请在 VS Code 中打开 DSH 当前工作区并【信任】它；刚装/更新过扩展需 Reload Window')
        var deadline = Date.now() + 120000
        while (Date.now() < deadline) {
          if (!wizardEl) return // 用户取消
          var st = await fetchState().catch(function () { return null })
          if (st && st.extConnected && !(st.extReady && st.extReady.trusted === false)) {
            phase = 'ok'
            var w = st.extReady && st.extReady.workspace
            setStep(2, 'ok', w ? '已连接窗口：' + w : '已连接')
            return
          }
          if (st && st.extConnected && st.extReady && st.extReady.trusted === false) {
            setStep(2, 'running', '已连接，但 VS Code 处于受限模式：请在 VS Code 的信任弹窗中信任该工作区（或命令面板 → 管理工作区信任），信任后自动继续')
          } else if (st && st.workspace) {
            setStep(2, 'running', '等待扩展连接… 请确认 VS Code 已打开工作区 ' + st.workspace + ' 并已【信任】它（必要时 Reload Window）')
          }
          await new Promise(function (res) { setTimeout(res, 1500) })
        }
        phase = 'fail'
        failInfo = '120 秒内未收到扩展连接'
        setStep(2, 'fail', '扩展未连接：请确认扩展已启用、窗口已 Reload、工作区已打开并信任')
      }
      render()
      run()
    }

    // ---- code-server 一键安装向导 ----
    // 与连接向导同款弹窗：host 端后台跑 scripts/install-code-server.*，
    // 这里每 1.5s 轮询 state.install 渲染进度。失败时给出手动命令兜底。
    var installWizEl = null

    function openInstallWizard() {
      if (installWizEl) return
      var steps = [
        { label: '下载并安装 code-server（自动匹配系统架构，约 80MB）', status: 'pending', detail: '' },
        { label: '启动内嵌编辑器', status: 'pending', detail: '' },
        { label: '等待桥扩展连接', status: 'pending', detail: '' },
      ]
      var phase = 'running' // running | ok | fail
      var failInfo = ''
      var failLog = []
      var pkgRoot = ''
      var started = false

      var backdrop = document.createElement('div')
      backdrop.className = 'dsh-vsced-wiz-backdrop'
      var panel = document.createElement('div')
      panel.className = 'dsh-vsced-wiz'
      backdrop.appendChild(panel)
      document.body.appendChild(backdrop)
      installWizEl = backdrop

      function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;') }
      function icon(st) {
        if (st === 'running') return '<span class="dsh-vsced-spin">◌</span>'
        if (st === 'ok') return '<span style="color:#3fb950">✓</span>'
        if (st === 'fail') return '<span style="color:#f85149">✗</span>'
        return '<span style="color:#666">○</span>'
      }
      function render() {
        var html = '<div class="dsh-vsced-wiz-title">安装 code-server</div>'
        for (var i = 0; i < steps.length; i++) {
          var s = steps[i]
          html += '<div class="dsh-vsced-wiz-step"><span class="dsh-vsced-wiz-icon">' + icon(s.status) + '</span><div><div>' +
            esc(s.label) + '</div>' +
            (s.detail ? '<div class="dsh-vsced-wiz-detail">' + esc(s.detail) + '</div>' : '') + '</div></div>'
        }
        if (phase === 'fail') {
          html += '<div class="dsh-vsced-wiz-log">'
          if (failInfo) html += '错误：' + esc(failInfo) + '<br>'
          if (failLog.length) html += '安装日志尾部：<br>' + failLog.map(esc).join('<br>') + '<br>'
          if (pkgRoot) {
            html += '可改用命令行手动安装：<br><code>sh "' + esc(pkgRoot) + '/scripts/install-code-server.sh" ~/.dsh-editor</code>' +
              '<br>（Windows 用 PowerShell 运行同目录的 install-code-server.ps1）'
          }
          html += '</div>'
        }
        if (phase === 'ok') {
          html += '<div class="dsh-vsced-wiz-log">安装完成，编辑器已就绪。此弹窗可直接关闭。</div>'
        }
        html += '<div class="dsh-vsced-wiz-btns">'
        if (phase === 'running') html += '<button class="dsh-vsced-btn" data-act="close">后台继续</button>'
        else if (phase === 'ok') html += '<button class="dsh-vsced-btn" data-act="close">完成</button>'
        else html += '<button class="dsh-vsced-btn" data-act="retry">重试</button><button class="dsh-vsced-btn" data-act="close">关闭</button>'
        html += '</div>'
        panel.innerHTML = html
      }
      function close() { if (installWizEl) { installWizEl.remove(); installWizEl = null } }
      backdrop.addEventListener('click', function (e) {
        var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act')
        if (act === 'close') close()
        else if (act === 'retry') {
          phase = 'running'
          failInfo = ''
          failLog = []
          started = false
          for (var i = 0; i < steps.length; i++) { steps[i].status = 'pending'; steps[i].detail = '' }
          render()
          run()
        } else if (e.target === backdrop && phase !== 'running') close()
      })
      function setStep(i, status, detail) {
        steps[i].status = status
        if (detail !== undefined) steps[i].detail = detail
        if (installWizEl) render()
      }
      function sleep(ms) { return new Promise(function (res) { setTimeout(res, ms) }) }

      async function run() {
        if (!started) {
          started = true
          setStep(0, 'running', '正在启动安装…')
          await postAction({ action: 'install-codeserver' })
        }
        var deadline = Date.now() + 15 * 60 * 1000 // 下载可能很慢，给 15 分钟
        while (Date.now() < deadline) {
          if (!installWizEl) return // 用户关了弹窗（安装在 host 后台继续）
          var st = await fetchState().catch(function () { return null })
          if (!st || st.failed) { await sleep(1500); continue }
          if (st.pkgRoot) pkgRoot = st.pkgRoot
          var ins = st.install
          if (!ins || ins.phase === 'running') {
            var last = ins && ins.log && ins.log.length ? ins.log[ins.log.length - 1] : ''
            setStep(0, 'running', last || '下载中（网络慢时可能需要几分钟）…')
          } else if (ins.phase === 'error') {
            phase = 'fail'
            failInfo = ins.error || '安装脚本失败'
            failLog = ins.log || []
            setStep(0, 'fail', ins.error || '安装失败')
            return
          } else if (ins.phase === 'done') {
            setStep(0, 'ok', '已安装到 ~/.dsh-editor')
            if (st.running) {
              setStep(1, 'ok', st.url || '已启动')
              if (st.extConnected) {
                phase = 'ok'
                setStep(2, 'ok', '编辑器已就绪')
                return
              }
              setStep(2, 'running', 'code-server 已启动，等待扩展握手…')
            } else if (st.lastError) {
              phase = 'fail'
              failInfo = st.lastError
              setStep(1, 'fail', '启动失败，详见下方错误')
              return
            } else {
              setStep(1, 'running', '正在启动…')
            }
          }
          await sleep(1500)
        }
        phase = 'fail'
        failInfo = '等待超时（15 分钟）'
        setStep(2, 'fail', '超时：安装可能仍在后台进行，可稍后回到编辑器标签页查看状态')
      }
      render()
      run()
    }

    // Tab label: resolveSlotLabel passes the label function's return value
    // straight into the tab button's children, so returning a React element
    // gives the tab a real (colored, self-updating) status dot instead of
    // text glyphs. The tab strip is always mounted, so this component is
    // also the always-on poller for editor state.
    function TabLabel() {
      var st = useEditorState()
      var status = statusOf(st)
      return React.createElement('span', { className: 'dsh-vsced-tab', title: '内嵌编辑器 · ' + status.text },
        '编辑器',
        dot(status.color)
      )
    }

    // 本机 VS Code 模式：编辑器标签页没有 iframe 可嵌，换成状态卡片——
    // 连接状态、VS Code 探测结果、扩展安装/更新入口、排错与手动兜底指引。
    function LocalPanel(props) {
      var st = props.st
      var d = (st && st.desktop) || {}
      var status = statusOf(st)
      var msgState = React.useState('')
      var msg = msgState[0]
      var setMsg = msgState[1]
      function row(label, value) {
        return React.createElement('div', { className: 'row', key: label },
          React.createElement('span', { style: { color: '#999', minWidth: '88px' } }, label),
          React.createElement('span', null, value)
        )
      }
      var children = []
      children.push(React.createElement('div', { className: 'row', key: 'st' }, dot(status.color), React.createElement('strong', null, status.text)))
      children.push(row('VS Code', d.cli ? (d.cli + (d.version ? '（' + d.version + '）' : '')) : '未检测到（可在设置里手动指定路径）'))
      children.push(row('DSH 扩展', d.extInstalled
        ? '已安装 v' + d.extVersion + (d.extUpToDate ? '（最新）' : '（有新版本 v' + d.bundledExtVersion + '）')
        : '未安装'))
      children.push(row('工作区', (st && st.workspace) || '等待会话'))
      if (st && st.extReady && st.extReady.mode === 'desktop') {
        children.push(row('已连接窗口', (st.extReady.workspace || '-') + ' · 扩展 v' + (st.extReady.version || '?')))
      }
      if (st && st.extConnected && st.extReady && st.extReady.trusted === false) {
        children.push(React.createElement('div', { className: 'hint', key: 'trust', style: { color: '#d29922' } },
          '⚠️ VS Code 处于受限模式：请在 VS Code 中信任该工作区（命令面板 → 管理工作区信任），信任后才会同步编辑'))
      }
      var btns = []
      if (d.cli && (!d.extInstalled || !d.extUpToDate)) {
        btns.push(React.createElement('button', {
          className: 'dsh-vsced-btn', key: 'ins',
          onClick: function () {
            postAction({ action: 'install-extension' }).then(function (r) {
              if (r && r.ok) setMsg('安装完成：请在 VS Code 中 Reload Window（或重启 VS Code）使扩展生效')
              else if (r && r.manual) setMsg('自动安装失败：' + (r.error || '') + '。可手动拷贝 ' + r.manual.from + ' 到 ' + r.manual.to)
              else setMsg('安装失败：' + ((r && r.error) || '未知错误'))
            })
          },
        }, d.extInstalled ? '更新扩展' : '安装扩展到本机 VS Code'))
      }
      btns.push(React.createElement('button', {
        className: 'dsh-vsced-btn', key: 'det',
        onClick: function () { postAction({ action: 'detect-vscode' }) },
      }, '重新检测'))
      btns.push(React.createElement('button', {
        className: 'dsh-vsced-btn', key: 'wiz',
        onClick: function () { openWizard() },
      }, '连接向导'))
      children.push(React.createElement('div', { className: 'row', key: 'btns' }, btns))
      if (msg) children.push(React.createElement('div', { className: 'hint', key: 'msg', style: { color: '#d29922' } }, msg))
      if (st && st.notice) children.push(React.createElement('div', { className: 'hint', key: 'nt', style: { color: '#d29922' } }, st.notice))
      if (st && st.lastError) children.push(React.createElement('pre', { key: 'err', style: { maxWidth: '100%', overflow: 'auto', fontSize: 11, color: '#f85149', whiteSpace: 'pre-wrap', margin: 0 } }, st.lastError))
      children.push(React.createElement('div', { className: 'hint', key: 'hint' },
        '本机模式下请在桌面 VS Code 中打开当前工作区（' + ((st && st.workspace) || '…') + '），扩展会自动与 DSH 握手。'))
      return React.createElement('div', { className: 'dsh-vsced-empty', style: { alignItems: 'flex-start', textAlign: 'left', gap: '8px' } }, children)
    }

    function EditorView() {
      var st = useEditorState()
      // cover=true 时遮住下方对话框（全屏看代码）；关掉就能边聊边看编辑器。
      var coverState = React.useState(true)
      var cover = coverState[0]
      var setCover = coverState[1]
      React.useEffect(function () {
        if (cover) document.body.classList.add('dsh-vsced-active')
        else document.body.classList.remove('dsh-vsced-active')
        return function () { document.body.classList.remove('dsh-vsced-active') }
      }, [cover])
      var running = !!(st && st.running)
      var url = st && st.url
      var status = statusOf(st)
      var isLocal = !!(st && (st.backend === 'local' || (st.config && st.config.editorBackend === 'local')))
      // code-server 未安装：除了一键安装引导，也保留本机 VS Code 替代路径。
      var missingCs = !!(st && st.lastError && st.lastError.indexOf('未找到 code-server') >= 0)
      var installing = !!(st && st.install && st.install.phase === 'running')

      // The placeholder the persistent frame overlays. Ref + unmount cleanup
      // are what hide the frame when this tab view disappears.
      function anchorRef(el) {
        anchorEl = el
        anchorOn = !!el
        syncFrame()
      }
      React.useEffect(function () {
        return function () { anchorOn = false; anchorEl = null; syncFrame() }
      }, [])
      React.useEffect(function () {
        if (running && url) ensureFrame(url)
        syncFrame()
      })

      var children = []
      children.push(React.createElement('div', { className: 'dsh-vsced-toolbar', key: 'tb' },
        dot(status.color),
        React.createElement('strong', null, isLocal ? '本机 VS Code' : '内嵌编辑器'),
        React.createElement('span', { style: { color: '#999' } }, status.text),
        React.createElement('span', { className: 'sp' }),
        React.createElement('button', {
          className: 'dsh-vsced-btn',
          title: '切换编辑器是否遮住下方对话框（关掉后可以和 AI 边聊边看编辑器）',
          onClick: function () { setCover(!cover) },
        }, cover ? '💬 显示对话框' : '💬 隐藏对话框'),
        React.createElement('label', { title: '跟随模式：只读，自动定位并显示 DSH 修改的红绿 diff；关闭后可编辑（DSH 占用文件仍锁定）' },
          React.createElement('input', {
            type: 'checkbox',
            checked: !!(st && st.follow),
            onChange: function (e) { postAction({ action: 'set-follow', enabled: e.target.checked }) },
          }),
          '跟随 DSH 编辑'
        ),
        !isLocal && url ? React.createElement('a', { className: 'dsh-vsced-btn', href: url, target: '_blank', rel: 'noreferrer' }, '新窗口打开') : null,
        !isLocal ? React.createElement('button', { className: 'dsh-vsced-btn', onClick: function () { postAction({ action: 'restart' }) } }, '重启') : null
      ))
      if (isLocal) {
        children.push(React.createElement(LocalPanel, { st: st, key: 'lp' }))
      } else if (running && url) {
        children.push(React.createElement('div', { className: 'dsh-vsced-anchor', key: 'fr', ref: anchorRef }))
      } else {
        children.push(React.createElement('div', { className: 'dsh-vsced-empty', key: 'em' },
          React.createElement('div', null, st && st.failed ? '编辑器桥接未挂载：插件被禁用，或 DSH 尚未带插件重启' : running ? 'code-server 已启动但尚未就绪' : 'code-server 未运行'),
          st && st.notice ? React.createElement('div', { style: { color: '#d29922' } }, st.notice) : null,
          st && st.lastError ? React.createElement('pre', { style: { maxWidth: '100%', overflow: 'auto', fontSize: 11, color: '#f85149', whiteSpace: 'pre-wrap' } }, st.lastError) : null,
          missingCs || installing ? React.createElement('button', {
            className: 'dsh-vsced-btn',
            style: { fontWeight: 600 },
            onClick: function () { openInstallWizard() },
          }, installing ? '⏳ 正在安装 code-server…（查看进度）' : '⬇ 一键安装 code-server') : null,
          missingCs ? React.createElement('div', { className: 'hint' }, '自动从 code-server 官方 release 下载并安装到 ~/.dsh-editor（约 80MB，仅首次需要）') : null,
          missingCs ? React.createElement('div', { className: 'hint' }, '没装 code-server 也能用：切到「本机 VS Code」模式，跟随/文件锁定体验一致。') : null,
          missingCs ? React.createElement('button', {
            className: 'dsh-vsced-btn',
            onClick: function () { postAction({ action: 'set-backend', backend: 'local' }).then(function () { openWizard() }) },
          }, '改用本机 VS Code →') : null,
          st && st.failed ? null : React.createElement('button', { className: 'dsh-vsced-btn', onClick: function () { postAction({ action: 'start' }) } }, '尝试启动')
        ))
      }
      return React.createElement('div', { className: 'dsh-vsced-view' }, children)
    }

    function enterBlur(e) { if (e.key === 'Enter') e.target.blur() }

    // 设置 → 插件 → 插件配置 里的插件卡片。读写都走自己的 /__dsh-vsceditor/*
    // 端点；host 端写入 settings 命名空间持久化（设置服务缺席时仅本次运行有效）。
    // 结构对齐官方 PluginCard：默认折叠的头部按钮（标题+描述+状态+箭头），
    // 展开后才渲染配置项。
    function chevron(open) {
      return React.createElement('span', { className: 'dsh-vsced-chevron' + (open ? ' dsh-vsced-chevron-open' : ''), 'aria-hidden': 'true' },
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
          React.createElement('path', { d: 'M3.5 5.25L7 8.75L10.5 5.25', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' })
        )
      )
    }

    function SettingsCard() {
      var st = useEditorState()
      var openState = React.useState(false)
      var open = openState[0]
      var setOpen = openState[1]
      var cfg = (st && st.config) || {}
      var status = statusOf(st)
      function save(patch) { postAction({ action: 'set-config', patch: patch }) }
      function savePort(ev) {
        var n = parseInt(ev.target.value, 10)
        if (!(n >= 0 && n <= 65535)) { ev.target.value = String(cfg.port != null ? cfg.port : 0); return }
        if (n !== cfg.port) save({ port: n })
      }
      function saveHome(ev) {
        var v = ev.target.value.trim()
        if (v !== (cfg.codeServerHome || '')) save({ codeServerHome: v })
      }
      return React.createElement('li', { className: 'dsh-vsced-card' + (open ? ' dsh-vsced-card-open' : '') },
        React.createElement('button', {
          type: 'button',
          className: 'dsh-vsced-cardhead',
          'aria-expanded': open,
          'aria-label': (open ? '收起设置' : '展开设置') + '：内嵌 VSCode 编辑器',
          onClick: function () { setOpen(!open) },
        },
          React.createElement('span', { className: 'dsh-vsced-headtext' },
            React.createElement('span', { className: 'dsh-vsced-name' }, dot(status.color), '内嵌 VSCode 编辑器'),
            React.createElement('span', { className: 'dsh-vsced-desc' }, 'code-server 内嵌编辑器：跟随编辑、自动启动、端口与工作区。')
          ),
          React.createElement('span', { className: 'dsh-vsced-status' }, status.text),
          chevron(open)
        ),
        !open ? null : React.createElement('div', { className: 'dsh-vsced-cardbody' },
          React.createElement('div', { className: 'row' },
            React.createElement('span', null, '编辑器后端'),
            React.createElement('label', { className: 'row', style: { gap: '4px' } },
              React.createElement('input', {
                type: 'radio', name: 'dsh-vsced-backend',
                checked: (cfg.editorBackend || 'embedded') === 'embedded',
                onChange: function () { save({ editorBackend: 'embedded' }) },
              }),
              '内嵌 code-server'
            ),
            React.createElement('label', { className: 'row', style: { gap: '4px' } },
              React.createElement('input', {
                type: 'radio', name: 'dsh-vsced-backend',
                checked: cfg.editorBackend === 'local',
                onChange: function () { save({ editorBackend: 'local' }); openWizard() },
              }),
              '本机 VS Code'
            )
          ),
          cfg.editorBackend === 'local' ? React.createElement('div', { className: 'row' },
            React.createElement('span', null, 'VS Code 路径'),
            React.createElement('input', {
              key: 'v' + (cfg.vscodePath || ''),
              type: 'text',
              defaultValue: cfg.vscodePath || '',
              placeholder: '留空 = 自动探测（常见路径 → which/where/mdfind）',
              style: { flex: 1, minWidth: '220px' },
              onBlur: function (ev) { var v = ev.target.value.trim(); if (v !== (cfg.vscodePath || '')) save({ vscodePath: v }) },
              onKeyDown: enterBlur,
            })
          ) : null,
          cfg.editorBackend === 'local' && st && st.desktop ? React.createElement('div', { className: 'hint' },
            st.desktop.cli
              ? '检测到：' + st.desktop.cli + (st.desktop.version ? '（' + st.desktop.version + '）' : '') + (st.desktop.extInstalled ? ' · 扩展 v' + st.desktop.extVersion + (st.desktop.extUpToDate ? '（最新）' : '（可更新到 v' + st.desktop.bundledExtVersion + '）') : ' · 扩展未安装')
              : '未检测到本机 VS Code'
          ) : null,
          React.createElement('label', { className: 'row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!cfg.follow,
              onChange: function (e) { save({ follow: e.target.checked }) },
            }),
            '跟随 DSH 编辑',
            React.createElement('span', { className: 'hint' }, '改文件时自动弹出红绿 diff 并定位到改动行')
          ),
          React.createElement('label', { className: 'row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!cfg.followWorkspaceOnly,
              onChange: function (e) { save({ followWorkspaceOnly: e.target.checked }) },
            }),
            '仅跟随工作区内文件',
            React.createElement('span', { className: 'hint' }, '开启后，工作区外的改动只记录到最近列表，不弹 diff')
          ),
          cfg.editorBackend === 'local' ? null : React.createElement('label', { className: 'row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!cfg.autoStart,
              onChange: function (e) { save({ autoStart: e.target.checked }) },
            }),
            '自动启动 code-server',
            React.createElement('span', { className: 'hint' }, '关闭后需在「编辑器」标签页手动启动')
          ),
          cfg.editorBackend === 'local' ? null : React.createElement('div', { className: 'row' },
            React.createElement('span', null, '端口'),
            React.createElement('input', {
              key: 'p' + String(cfg.port),
              type: 'number', min: 0, max: 65535,
              defaultValue: String(cfg.port != null ? cfg.port : 0),
              style: { width: '90px' },
              onBlur: savePort, onKeyDown: enterBlur,
            }),
            React.createElement('span', { className: 'hint' }, '0 = 随机（18200–18900）；改动会自动重启编辑器')
          ),
          cfg.editorBackend === 'local' ? null : React.createElement('div', { className: 'row' },
            React.createElement('span', null, 'code-server 目录'),
            React.createElement('input', {
              key: 'h' + (cfg.codeServerHome || ''),
              type: 'text',
              defaultValue: cfg.codeServerHome || '',
              placeholder: '留空 = 自动查找（$DSH_VSCEDITOR_HOME → 工作区/.dsh-editor → ~/.dsh-editor）',
              style: { flex: 1, minWidth: '220px' },
              onBlur: saveHome, onKeyDown: enterBlur,
            })
          ),
          cfg.editorBackend === 'local' ? null : (st && (st.install && st.install.phase === 'running' || st.lastError && st.lastError.indexOf('未找到 code-server') >= 0))
            ? React.createElement('div', { className: 'row' },
              React.createElement('button', {
                className: 'dsh-vsced-btn',
                onClick: function () { openInstallWizard() },
              }, st.install && st.install.phase === 'running' ? '⏳ 正在安装…（查看进度）' : '⬇ 一键安装 code-server'),
              React.createElement('span', { className: 'hint' }, '自动下载官方 code-server 到 ~/.dsh-editor（约 80MB）')
            )
            : null,
          st && st.running && st.url
            ? React.createElement('div', { className: 'hint' }, '当前实例：' + st.url + ' · 工作区：' + (st.workspace || '-'))
            : null,
          st && st.settingsAvailable === false
            ? React.createElement('div', { className: 'hint' }, '⚠️ 设置服务不可用，以上改动仅本次运行有效')
            : null,
          st && st.lastError
            ? React.createElement('div', { className: 'hint', style: { color: '#f85149' } }, st.lastError)
            : null
        )
      )
    }

    function apply(ctx) {
      ctx.effect(function () {
        var el = document.createElement('style')
        el.textContent = CSS
        document.head.appendChild(el)
        return function () { el.remove() }
      }, 'dsh-vsceditor: styles')

      ctx.effect(function () {
        var id = setInterval(syncFrame, 400)
        window.addEventListener('resize', syncFrame)
        return function () {
          clearInterval(id)
          window.removeEventListener('resize', syncFrame)
          if (frame) { frame.remove(); frame = null }
          if (wizardEl) { wizardEl.remove(); wizardEl = null }
          if (installWizEl) { installWizEl.remove(); installWizEl = null }
        }
      }, 'dsh-vsceditor: frame')

      ctx.slots.inject('conversation.view', function () {
        ctx.slots.register(
          { name: 'conversation.view', id: 'dsh-vsceditor', label: function () { return React.createElement(TabLabel) }, order: 100 },
          function () { return React.createElement(EditorView) }
        )
      })

      // 设置 → 插件 → 插件配置 卡片：key 必须与 host 端注册的 settings
      // 命名空间一致，配置区只会派发 host 实际 serve 的命名空间。
      ctx.slots.inject('settings.plugin.item', function () {
        ctx.slots.register(
          { name: 'settings.plugin.item', id: 'dsh-vsceditor', key: 'dsh-vsceditor', order: 100, label: '内嵌 VSCode 编辑器' },
          function () { return React.createElement(SettingsCard) }
        )
      })
    }

    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  }
})
