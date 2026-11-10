#!/bin/bash
# 把一节课的 mp4 切成加密 HLS，放进 media/<卷>/<节>/
# 用法：tools/pack-hls.sh 输入.mp4 卷号 节号        例：tools/pack-hls.sh 卷一第1节.mp4 1 1
# 产出：index.m3u8、seg_000.ts…、enc.key（密钥，只经 /api/media/.../key 下发给有权限的会员）
set -euo pipefail
in=$1; vol=$2; les=$3
root=$(cd "$(dirname "$0")/.." && pwd); out=$root/media/$vol/$les
tmp=$(mktemp -d)   # 先写到临时目录再拷回，部分网络盘直接写会出错
openssl rand 16 > "$tmp/enc.key"
printf 'key\n%s\n%s\n' "$tmp/enc.key" "$(openssl rand -hex 16)" > "$tmp/keyinfo"
ffmpeg -y -loglevel error -i "$in" -vf "scale='min(1280,iw)':-2" -c:v libx264 -preset slow -crf 24 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -hls_time 6 -hls_playlist_type vod -hls_key_info_file "$tmp/keyinfo" \
  -hls_segment_filename "$tmp/seg_%03d.ts" "$tmp/index.m3u8"
mkdir -p "$out"; rm -f "$out"/seg_*.ts
cp "$tmp"/index.m3u8 "$tmp"/enc.key "$tmp"/seg_*.ts "$out"/; rm -rf "$tmp"
echo "完成：$out（$(ls "$out"/seg_*.ts | wc -l) 个分片）"
