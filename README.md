# dsh-vsceditor

**DeepSeek Harness 内嵌 VSCode 编辑器插件** —— 在 DSH Web 界面里嵌入一个完整的 code-server（完整版 VSCode），agent 每次写文件/改文件时自动在编辑器里弹出红绿 diff 并定位到改动行，所见即所得地"看着 AI 干活"。

## 特性

- **完整 VSCode，不是玩具编辑器** —— 内嵌的是 code-server 4.x（完整 VSCode 内核），扩展、主题、快捷键、Git 面板全部可用
- **跟随模式（follow）** —— agent 调用 `write`/`edit` 工具改文件时，编辑器自动打开该文件的红绿 diff 视图并滚动到首个改动行；DSH 侧还同时内置一个只读 diff 标签页，两边都能看
- **文件锁定** —— agent 正在写某个文件期间，编辑器里该文件被锁定（防止你和 AI 同时改一个文件互相覆盖），写完自动解锁
- **工作区自动跟随会话** —— 一个 DSH 进程只跑一个 code-server；当前活跃会话的工作区变化时，编辑器自动切换到对应目录（必要时自动重启 code-server）
- **iframe 常驻不重建** —— 编辑器页面固定在 `<body>` 上、切换标签页只是隐藏/显示，不会每次点进去都新开一个 VSCode 会话
- **设置页集成** —— 「设置 → 插件 → 插件配置」里有本插件的折叠卡片：跟随开关、自动启动、端口、code-server 目录，全部即时生效并持久化（`~/.dsh/settings.yaml`）
- **零依赖** —— host/client 两端都是手写原生 JS，不依赖任何 npm 包；settings schema 用手写的 schemastery 兼容外形，不需要 `@deepseek-ai/schemastery`

## 工作原理

```
┌─ DSH 进程 ─────────────────────────────────────────────┐
│  host.js（host 层 cordis 插件，进程级单例）              │
│   · 监听所有会话的 tools/pre-execute、tools/result 事件   │
│   · 捕获 write/edit 的目标路径，读出改前/改后文本          │
│   · 管理 code-server 子进程（spawn/重启/退出重试）         │
│   · 通过 webServer 暴露：                                 │
│       /__dsh-vsceditor/state|action   （控制面，页面用）   │
│       /__dsh-vsceditor-<rand>/events  （SSE → 扩展）      │
│       /__dsh-vsceditor-<rand>/rpc     （扩展 → host）     │
└───────┬──────────────────────────────▲─────────────────┘
        │ SSE: hello/follow/edit/lock/unlock/reveal
        │                              POST: ready/ack/log
┌───────▼──────────────────────────────┴─────────────────┐
│  code-server（独立进程，--auth none，仅 127.0.0.1）        │
│   └─ dsh-bridge 扩展（vscode-ext/dsh-bridge）            │
│        收到 edit 消息 → 打开红绿 diff 并定位改动行          │
│        收到 lock → 对应文件只读；unlock → 恢复             │
└────────────────────────────────────────────────────────┘
        ▲ iframe（client.js 注册到 conversation.view，
          标签页「编辑器」，常驻 body 不随切换销毁）
```

消息语义参考 ACP `session/update`：`edit {path, oldText, newText, firstLine}` 由 host 计算 diff 统计后推送，扩展负责呈现。host 以 unscoped 方式挂载，因此能看到所有会话的工具事件（scoped 事件会沿 scope 链向上流动）。

## 前置要求

- DeepSeek Harness（dsh）web profile（本插件是 profile bundle，挂在 host 层）
- macOS 或 Linux（Windows 未测试；code-server 官方不支持 Windows 直装）
- 一个 code-server 安装（见下文「安装 code-server」）

## 安装

### 方式 A：从 GitHub 安装（推荐）

```sh
dsh plugin --profile web add github:YOUR_GITHUB_USERNAME/dsh-vsceditor
```

`dsh plugin add` 会把包加进 `~/.dsh/profiles/web/package.json` 的依赖并自动登记到 `dsh.profile.bundles`（本插件通过 `cordis.patch.yml` 自挂载，无需手工编辑组合文件）。

### 方式 B：本地目录安装

```sh
git clone https://github.com/YOUR_GITHUB_USERNAME/dsh-vsceditor.git
dsh plugin --profile web add /path/to/dsh-vsceditor
```

### 安装 code-server

插件本体不带 code-server 运行时（约 100MB），首次使用前装一次：

```sh
cd <你的 DSH 工作区>   # 例如 ~/Documents/AI
sh ~/.dsh/profiles/web/node_modules/dsh-vsceditor/scripts/install-code-server.sh
```

脚本按平台（macOS arm64/x64、Linux x64/arm64/armhf）从 code-server 官方 release 下载并解压到 `<工作区>/.dsh-editor/code-server`。版本固定为 4.133.0，可用 `DSH_VSCEDITOR_VERSION` 环境变量覆盖。

手动安装也可以：把 code-server 解压到以下任一位置（按查找优先级）：

1. 设置卡片里填写的 `code-server 目录`（优先级最高）
2. 环境变量 `$DSH_VSCEDITOR_HOME`
3. `<工作区>/.dsh-editor`
4. `~/.dsh-editor`

目录下需存在 `code-server/bin/code-server`。

### 启动

```sh
dsh web
```

启动后顶栏出现「编辑器」标签页，点进去等待 code-server 就绪（首次约几秒）。标签文字旁有状态点：灰=加载中，绿=扩展已连接，黄=等待扩展连接，红=未运行/桥接未挂载。

## 使用

### 跟随模式

默认开启。agent 每次 `write`/`edit` 落地后：

- 编辑器自动切到该文件的 diff 视图（左旧右新），并滚动到首个改动行
- 编辑器标签页的工具栏可以随时关掉「跟随」勾选框；关掉后仍会记录最近改动（recent 列表），只是不主动弹窗

### 文件锁定

agent 开始写某文件时该文件在编辑器里变为只读（状态栏有提示），写完自动解锁。这是防冲突提示，不是安全边界。

### 设置卡片

「设置 → 插件 → 插件配置 → 内嵌 VSCode 编辑器」（默认折叠，点标题展开）：

| 配置项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `follow` | boolean | `true` | 跟随 DSH 编辑：改文件时自动弹出红绿 diff 并定位改动行 |
| `autoStart` | boolean | `true` | DSH 启动后自动拉起 code-server；关闭后需在「编辑器」标签页手动启动 |
| `port` | number | `0` | code-server 监听端口；`0` = 随机（18200–18900）；改动会自动重启编辑器 |
| `codeServerHome` | string | `""` | 手动指定 code-server 安装目录；留空按上面的优先级自动查找 |

写入即持久化到 `~/.dsh/settings.yaml` 的 `dsh-vsceditor` 节，重启后保留。也可以在 `~/.dsh/profiles/web/cordis.patch.yml` 的插件行加 `config:` 作为组合层 base（用户层覆盖 base 层）。

### 快捷键/命令

code-server 里 `Cmd/Ctrl+Shift+P` → `DSH Bridge: Reconnect` 可手动重连桥接（一般不需要，扩展会自动重连）。

## 故障排查

**「编辑器」标签页显示"未找到 code-server"**
没装 code-server 或不在查找路径上。运行安装脚本，或在设置卡片填 `code-server 目录`。

**一直"等待扩展连接"（黄点）**
扩展只在 code-server 窗口打开时才会启动扩展宿主。点进「编辑器」标签页等几秒；如果页面是旧的（code-server 重启过），刷新整个 DSH 页面。

**改动不弹 diff**
① 看标签页状态点是否绿色；② 看工具栏「跟随」是否勾选；③ 扩展日志：`DSH_BRIDGE_DEBUG=1` 重启 DSH 后看 `/tmp/dsh-bridge-debug.log`。

**端口被占用/想换端口**
设置卡片改端口，保存后编辑器自动重启到新端口。

**code-server 进程残留**
DSH 退出时不会强杀已脱离的子进程。手动清理：`pkill -f 'code-server.*--auth none'`。

**设置 → 插件 → 插件配置 整页空白**
这是本插件 0.1.x 时代踩过的坑：settings schema 缺 `toJSON` 会把整页拖挂。0.2.0 已修复；若仍出现请提 issue 并附 `~/.dsh/settings.yaml` 的 `dsh-vsceditor` 节。

## 卸载

```sh
dsh plugin --profile web remove dsh-vsceditor
```

再删掉运行数据（可选）：`<工作区>/.dsh-editor`、`~/.dsh/settings.yaml` 里的 `dsh-vsceditor` 节。

## 安全说明

- code-server 以 `--auth none` 启动，但**只监听 127.0.0.1**，不暴露到局域网；请勿改绑到 0.0.0.0
- 桥接端点（SSE/RPC）带每次启动随机生成的 token，扩展通过环境变量拿到
- 插件不收集、不上传任何数据；code-server 启动参数带 `--disable-telemetry --disable-update-check`

## 目录结构

```
dsh-vsceditor/
├── cordis.patch.yml              # profile bundle 自挂载补丁（host 层插件行）
├── package.json                  # dsh.bundle.patch / dsh.client 声明
├── lib/
│   ├── host.js                   # host 半：进程管理、事件桥、settings 命名空间
│   └── client.js                 # client 半：标签页 iframe、设置卡片（手写 bundle 格式）
├── scripts/
│   └── install-code-server.sh    # code-server 下载安装脚本
└── vscode-ext/
    └── dsh-bridge/               # 随 --extensions-dir 注入 code-server 的桥接扩展
        ├── package.json
        └── extension.js
```

`vscode-ext/extensions.json` 是 code-server 启动时按本机路径自动生成的运行态文件，已 gitignore。

## 开发

改 `lib/host.js` 后需要重启 DSH 生效；改 `lib/client.js` 只需刷新页面（bundle 路由按请求读盘）。校验组合是否仍能被 profile 正确装配：

```sh
dsh --profile web --dump-config
```

## License

[MIT](LICENSE)
