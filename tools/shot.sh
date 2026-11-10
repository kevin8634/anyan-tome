#!/bin/bash
# 截图预览：tools/shot.sh docs/index.html out.png 宽 高 [首屏高]
export LD_LIBRARY_PATH=/workspace/work/.envcache/libs/usr/lib/aarch64-linux-gnu
f=$1; d=$(dirname $f); t=$d/_shot.html; hv=${5:-900}
sed "s#</head>#<style>.hero{min-height:${hv}px!important}.rv{opacity:1!important;transform:none!important}.nav{position:absolute}</style></head>#" $f > $t
/workspace/work/.envcache/ms-playwright/chromium-1140/chrome-linux/chrome --headless=new --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=5000 --screenshot=$2 --window-size=$3,$4 file://$PWD/$t 2>/dev/null
rm -f $t
