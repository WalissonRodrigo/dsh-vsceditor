# install-code-server.ps1 — Windows 下为 dsh-vsceditor 安装 code-server
#
# code-server 官方不发布 Windows 构建（https://github.com/coder/code-server/issues/1397），
# 直接 npm install 会死在 postinstall.sh（git-bash 里调 cmd 内建命令 mklink）和
# argon2 原生模块编译上。本脚本的绕法（思路参考 naspenang/code-server-windows，MIT）：
#
#   1. 下载独立的 Windows 版 Node.js（仓库内自包含，不依赖系统 Node）
#   2. npm install --ignore-scripts code-server（跳过坏掉的 postinstall）
#   3. 手动补跑 lib/vscode 与 lib/vscode/extensions 里的依赖安装
#   4. 从【已安装的桌面版 VS Code】拷贝 resources/app/node_modules 原生模块
#      （argon2 等都是 N-API 模块，可直接复用；要求桌面版 VS Code 版本与
#      code-server 内置 VS Code 版本【完全一致】）
#
# 用法（PowerShell，在你的 DSH 工作区目录下执行）：
#   Set-ExecutionPolicy -Scope Process Bypass
#   & "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-vsceditor\scripts\install-code-server.ps1"
#
# 产物布局（dsh-vsceditor 的 host 端按此约定查找）：
#   <Dest>\code-server\node\node.exe
#   <Dest>\code-server\runtime\node_modules\code-server\out\node\entry.js
[CmdletBinding()]
param(
  [string]$Dest = (Join-Path (Get-Location) '.dsh-editor'),
  [string]$CodeServerVersion = '4.133.0',
  [string]$NodeVersion = '22.22.1',
  [switch]$SkipVSCodeVersionCheck
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

$root = Join-Path $Dest 'code-server'
$paths = [ordered]@{
  Root        = $root
  NodeDir     = Join-Path $root 'node'
  NodeZip     = Join-Path $root ("node-v{0}-win-x64.zip" -f $NodeVersion)
  NodeExe     = Join-Path $root 'node\node.exe'
  NpmCli      = Join-Path $root 'node\node_modules\npm\bin\npm-cli.js'
  Runtime     = Join-Path $root 'runtime'
  PackageDir  = Join-Path $root 'runtime\node_modules\code-server'
  EntryJs     = Join-Path $root 'runtime\node_modules\code-server\out\node\entry.js'
  VsCodeRoot  = Join-Path $root 'runtime\node_modules\code-server\lib\vscode'
}

if (Test-Path -LiteralPath $paths.EntryJs) {
  Write-Host "已存在: $($paths.EntryJs)"
  Write-Host "如需重装，请先删除 $($paths.Root)"
  exit 0
}

Write-Step "创建目录 $Dest"
Ensure-Dir $paths.NodeDir
Ensure-Dir $paths.Runtime

Write-Step "下载 Node.js v$NodeVersion (win-x64)"
if (-not (Test-Path -LiteralPath $paths.NodeExe)) {
  $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
  Invoke-WebRequest -Uri $nodeUrl -OutFile $paths.NodeZip
  $tmp = Join-Path $root 'node-extract'
  Expand-Archive -Path $paths.NodeZip -DestinationPath $tmp -Force
  Copy-Item -Path (Join-Path $tmp "node-v$NodeVersion-win-x64\*") -Destination $paths.NodeDir -Recurse -Force
  Remove-Item -Recurse -Force $tmp, $paths.NodeZip
}
if (-not (Test-Path -LiteralPath $paths.NodeExe)) {
  throw "Node.js 安装失败：未找到 $($paths.NodeExe)"
}

Write-Step "npm 安装 code-server@$CodeServerVersion（--ignore-scripts）"
& (Join-Path $paths.NodeDir 'npm.cmd') install --ignore-scripts --prefix $paths.Runtime "code-server@$CodeServerVersion"
if ($LASTEXITCODE -ne 0) { throw "npm install code-server 失败" }
if (-not (Test-Path -LiteralPath $paths.EntryJs)) {
  throw "code-server 入口缺失：$($paths.EntryJs)"
}

Write-Step "补装内置 VS Code 的 JS 依赖"
foreach ($dir in @($paths.VsCodeRoot, (Join-Path $paths.VsCodeRoot 'extensions'))) {
  Push-Location $dir
  try {
    & $paths.NodeExe $paths.NpmCli install --ignore-scripts --omit=dev
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败：$dir" }
  } finally {
    Pop-Location
  }
}

Write-Step "定位桌面版 VS Code（借用其原生模块）"
$codeExe = $null
$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if ($codeCmd) {
  $candidate = if ($codeCmd.Source -like '*.cmd') {
    Join-Path (Split-Path -Parent (Split-Path -Parent $codeCmd.Source)) 'Code.exe'
  } else { $codeCmd.Source }
  if (Test-Path -LiteralPath $candidate) { $codeExe = (Resolve-Path -LiteralPath $candidate).Path }
}
if (-not $codeExe) {
  foreach ($candidate in @(
    'C:\Program Files\Microsoft VS Code\Code.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe')
  )) {
    if (Test-Path -LiteralPath $candidate) { $codeExe = $candidate; break }
  }
}
if (-not $codeExe) {
  throw '未找到桌面版 VS Code。请先安装 VS Code（https://code.visualstudio.com/），它的原生模块是 code-server 在 Windows 上运行的必需品。'
}

$bundledVersion = (Get-Content -LiteralPath (Join-Path $paths.VsCodeRoot 'package.json') -Raw | ConvertFrom-Json).version
$desktopVersion = (Get-Item -LiteralPath $codeExe).VersionInfo.ProductVersion
Write-Host "  桌面版 VS Code: $codeExe ($desktopVersion)"
Write-Host "  code-server 内置 VS Code: $bundledVersion"
if ($desktopVersion -cne $bundledVersion) {
  $msg = "版本不一致：桌面版 $desktopVersion vs 内置 $bundledVersion。原生模块必须同版本才能复用。`n" +
         "解决办法：把桌面版 VS Code 升级/降级到 $bundledVersion，或用 -CodeServerVersion 指定一个内置版本与桌面版一致的 code-server。"
  if ($SkipVSCodeVersionCheck) { Write-Warning $msg } else { throw $msg }
}

$srcModules = Join-Path (Split-Path -Parent $codeExe) 'resources\app\node_modules'
if (-not (Test-Path -LiteralPath $srcModules)) {
  throw "桌面版 VS Code 目录结构异常：未找到 $srcModules"
}

Write-Step "拷贝原生模块 -> $($paths.VsCodeRoot)\node_modules"
& robocopy $srcModules (Join-Path $paths.VsCodeRoot 'node_modules') /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy 拷贝失败（exit $LASTEXITCODE）" }

$asarLink = Join-Path $paths.VsCodeRoot 'node_modules.asar'
if (-not (Test-Path -LiteralPath $asarLink)) {
  New-Item -ItemType Junction -Path $asarLink -Target (Join-Path $paths.VsCodeRoot 'node_modules') | Out-Null
}

Write-Step "安装完成"
Write-Host "  node:   $($paths.NodeExe)"
Write-Host "  entry:  $($paths.EntryJs)"
Write-Host "重启 DSH 后，dsh-vsceditor 会自动发现它。"
Write-Host ""
Write-Host "提示：Windows 支持为实验性质。如遇问题，WSL2 里的 Linux 流程是官方维护的路径。" -ForegroundColor Yellow
