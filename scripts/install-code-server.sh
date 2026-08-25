#!/bin/sh
# install-code-server.sh [目标目录] — 下载并安装 code-server 独立运行包。
#
# dsh-vsceditor 需要一个 code-server 安装。本脚本把它装到指定目录下的
# code-server/ 子目录；默认目标目录是当前工作目录下的 .dsh-editor（即
# DSH 会话工作区的 .dsh-editor，正是插件自动查找的位置之一）。
#
# 用法：
#   cd <你的 DSH 工作区>
#   sh ~/.dsh/profiles/web/node_modules/dsh-vsceditor/scripts/install-code-server.sh
#
# 环境变量：
#   DSH_VSCEDITOR_VERSION  要安装的 code-server 版本（默认 4.133.0）
set -eu

VERSION="${DSH_VSCEDITOR_VERSION:-4.133.0}"
DEST="${1:-$(pwd)/.dsh-editor}"

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS-$ARCH" in
  Darwin-arm64)  PKG="macos-arm64" ;;
  Darwin-x86_64) PKG="macos-amd64" ;;
  Linux-x86_64)  PKG="linux-amd64" ;;
  Linux-aarch64) PKG="linux-arm64" ;;
  Linux-armv7l)  PKG="linux-armhf" ;;
  *) echo "不支持的平台: $OS-$ARCH（可手动从 https://github.com/coder/code-server/releases 下载）" >&2; exit 1 ;;
esac

URL="https://github.com/coder/code-server/releases/download/v${VERSION}/code-server-${VERSION}-${PKG}.tar.gz"
BIN="$DEST/code-server/bin/code-server"

if [ -f "$BIN" ]; then
  echo "已存在: $BIN"
  echo "如需重装，请先删除 $DEST/code-server"
  exit 0
fi

echo "下载 code-server v${VERSION} (${PKG}) ..."
echo "  $URL"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if ! curl -fL --retry 3 -o "$TMP/code-server.tar.gz" "$URL"; then
  echo "下载失败。网络受限时可手动下载上述地址，解压后把 code-server-${VERSION}-${PKG} 目录" >&2
  echo "重命名为 code-server 并放到 $DEST/ 下。" >&2
  exit 1
fi

mkdir -p "$DEST"
tar -xzf "$TMP/code-server.tar.gz" -C "$TMP"
mv "$TMP/code-server-${VERSION}-${PKG}" "$DEST/code-server"

if [ ! -f "$BIN" ]; then
  echo "安装异常：未找到 $BIN" >&2
  exit 1
fi

echo "安装完成: $BIN"
echo "重启 DSH 后，dsh-vsceditor 会自动发现它。"
