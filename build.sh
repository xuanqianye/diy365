#!/usr/bin/env bash
# Cloudflare Worker 构建脚本
# 仓库已内置 Linux Hugo 二进制(./hugo，v0.169.0 extended)，优先使用，无需联网下载。
# 仅当二进制缺失时才回退到联网下载。
set -euo pipefail

if [ ! -x "./hugo" ]; then
  HUGO_VERSION="0.169.0"
  HUGO_TARBALL="hugo_extended_${HUGO_VERSION}_linux-amd64.tar.gz"
  HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_TARBALL}"
  echo "==> hugo binary missing, downloading v${HUGO_VERSION} ..."
  curl -fsSL "$HUGO_URL" -o "$HUGO_TARBALL"
  tar -xzf "$HUGO_TARBALL" hugo
  rm -f "$HUGO_TARBALL"
fi

chmod +x ./hugo
echo "==> Building site with Hugo ..."
./hugo --minify --gc
echo "==> Build finished. Output in ./public"
