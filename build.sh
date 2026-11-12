#!/usr/bin/env bash
# Cloudflare Worker 构建脚本：先下载 Hugo（构建环境未预装），再构建静态站。
# 用法：仪表盘 Build command 设为 `bash build.sh`
set -euo pipefail

HUGO_VERSION="0.169.0"
HUGO_TARBALL="hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_TARBALL}"

# 构建环境每次全新，本地没有 hugo 就下载（已验证可用的版本）
if [ ! -x "./hugo" ]; then
  echo "==> Downloading Hugo v${HUGO_VERSION} ..."
  curl -fsSL "$HUGO_URL" -o "$HUGO_TARBALL"
  tar -xzf "$HUGO_TARBALL" hugo
  rm -f "$HUGO_TARBALL"
  chmod +x hugo
fi

echo "==> Building site with Hugo ..."
./hugo --minify --gc
echo "==> Build finished. Output in ./public"
