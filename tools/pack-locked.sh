#!/bin/bash
# 静态版：把一节课的 mp4 切成加密 HLS，放进 static/locked/<卷>/<节>/（构建时进 docs/，可以公开托管）
# 密钥由总钥推出，只有持对应解锁码的人能在浏览器里算出来。卷〇（免费）不加密。
# 用法：tools/pack-locked.sh 输入.mp4 卷号 节号        例：tools/pack-locked.sh 卷一第1节.mp4 1 1
# 然后在 course/<卷>/<节>.md 里单独一行写 [[视频]]，重新构建即可
set -euo pipefail
in=$1; vol=$2; les=$3
root=$(cd "$(dirname "$0")/.." && pwd); out=$root/static/locked/$vol/$les
tmp=$(mktemp -d)   # 先写到临时目录再拷回，部分网络盘直接写会出错
enc=()
if [ "$vol" != "0" ]; then
  node --input-type=module -e "
    import {readFileSync} from 'fs'; await import('$root/static/js/tomecode.js'); const T=globalThis.TomeCode;
    const M=T.unhex(readFileSync('$root/keys/master.key','utf8').trim());
    process.stdout.write(Buffer.from(T.hlsKey(T.volSeed(M,$vol),'$les')));" > "$tmp/k.bin"
  printf 'tomekey:%s/%s\n%s\n%s\n' "$vol" "$les" "$tmp/k.bin" "$(openssl rand -hex 16)" > "$tmp/keyinfo"
  enc=(-hls_key_info_file "$tmp/keyinfo")
fi
ffmpeg -y -loglevel error -i "$in" -vf "scale='min(1280,iw)':-2" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -hls_time 6 -hls_playlist_type vod "${enc[@]}" \
  -hls_segment_filename "$tmp/seg_%03d.ts" "$tmp/index.m3u8"
mkdir -p "$out"; rm -f "$out"/seg_*.ts "$out"/index.m3u8
cp "$tmp"/index.m3u8 "$tmp"/seg_*.ts "$out"/; rm -rf "$tmp"
echo "完成：$out（$(ls "$out"/seg_*.ts | wc -l) 个分片，$(du -sh "$out" | cut -f1)）"
