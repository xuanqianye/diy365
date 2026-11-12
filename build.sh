#!/usr/bin/env bash
# Cloudflare Worker 构建脚本
# 仓库已内置 Linux Hugo 二进制(./hugo，v0.169.0 extended)。
# Cloudflare 检出可能丢失 +x 位，故先 chmod，再判定是否可用，缺失才联网下载。
set -euo pipefail

chmod +x ./hugo 2>/dev/null || true

if ./hugo version >/dev/null 2>&1; then
  echo "==> using committed hugo binary"
else
  echo "==> committed hugo not runnable, downloading v0.169.0 ..."
  HUGO_TARBALL="hugo_extended_0.169.0_linux-amd64.tar.gz"
  HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v0.169.0/${HUGO_TARBALL}"
  curl -fsSL "$HUGO_URL" -o "$HUGO_TARBALL"
  tar -xzf "$HUGO_TARBALL" hugo
  rm -f "$HUGO_TARBALL"
  chmod +x ./hugo
fi

echo "==> Building site with Hugo ..."
./hugo --minify --gc
echo "==> Build finished. Output in ./public"
