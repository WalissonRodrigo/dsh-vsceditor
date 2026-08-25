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
      if (st.extConnected) return { color: '#3fb950', text: '扩展已连接' }
      if (st.running) return { color: '#d29922', text: '等待扩展连接' }
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
        React.createElement('strong', null, '内嵌编辑器'),
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
        url ? React.createElement('a', { className: 'dsh-vsced-btn', href: url, target: '_blank', rel: 'noreferrer' }, '新窗口打开') : null,
        React.createElement('button', { className: 'dsh-vsced-btn', onClick: function () { postAction({ action: 'restart' }) } }, '重启')
      ))
      if (running && url) {
        children.push(React.createElement('div', { className: 'dsh-vsced-anchor', key: 'fr', ref: anchorRef }))
      } else {
        children.push(React.createElement('div', { className: 'dsh-vsced-empty', key: 'em' },
          React.createElement('div', null, st && st.failed ? '编辑器桥接未挂载：插件被禁用，或 DSH 尚未带插件重启' : running ? 'code-server 已启动但尚未就绪' : 'code-server 未运行'),
          st && st.notice ? React.createElement('div', { style: { color: '#d29922' } }, st.notice) : null,
          st && st.lastError ? React.createElement('pre', { style: { maxWidth: '100%', overflow: 'auto', fontSize: 11, color: '#f85149', whiteSpace: 'pre-wrap' } }, st.lastError) : null,
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
              checked: !!cfg.autoStart,
              onChange: function (e) { save({ autoStart: e.target.checked }) },
            }),
            '自动启动 code-server',
            React.createElement('span', { className: 'hint' }, '关闭后需在「编辑器」标签页手动启动')
          ),
          React.createElement('div', { className: 'row' },
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
          React.createElement('div', { className: 'row' },
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
