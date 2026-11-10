#!/bin/bash
# 构建并推送到 GitHub（kevin8634/anyan-tome）。course/、keys/、data/、server/.env 永远不进仓库。
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd); msg=${1:-"更新站点"}
node "$root/src/build.mjs" >/dev/null
rm -rf /tmp/repo && git clone -q ${SSL_CERT_FILE:+-c http.sslCAInfo="$SSL_CERT_FILE"} https://github.com/kevin8634/anyan-tome.git /tmp/repo
find /tmp/repo -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
tar -C "$root" --exclude=./node_modules --exclude=./data --exclude=./server/.env --exclude=./.git --exclude=./course --exclude=./keys -cf - . | tar -xf - -C /tmp/repo
cd /tmp/repo
if git ls-files --others --cached | grep -qE '^(course|keys)/|master\.key|发码器\.html'; then echo '发现机密文件，停止推送'; exit 1; fi
git add -A
git diff --cached --quiet && { echo '没有改动'; exit 0; }
git -c user.name=kevin8634 -c user.email=65992329+kevin8634@users.noreply.github.com commit -qm "$msg"
git ${SSL_CERT_FILE:+-c http.sslCAInfo="$SSL_CERT_FILE"} push -q && echo "已推送：$msg"
