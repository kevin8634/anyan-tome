#!/bin/bash
# 用法：tools/review-pdf.sh 卷号  → ../卷X讲义草稿_待审.pdf（审稿用，不发布）
set -e; N=$1; cd "$(dirname "$0")/.."
node --input-type=module -e "
import {md} from './tools/lock.mjs'; import fs from 'fs'; import {volumes} from './src/data.mjs';
const N=$N,v=volumes[N]; let body='';
v.lessons.forEach((l,i)=>{ const f='course/'+N+'/'+(i+1)+'.md'; if(!fs.existsSync(f)) return; body+='<section><div class=k>卷'+v.cn+' · 第'+(i+1)+'节</div><h1>'+l.t+'</h1>'+md(fs.readFileSync(f,'utf8'))+'</section>'; });
const html='<!doctype html><meta charset=utf-8><style>@font-face{font-family:S;src:url(file://'+process.cwd()+'/../fonts/NotoSerifSC.ttf)}body{font-family:S;color:#222;font-size:11.5pt;line-height:1.85;margin:0}section{page-break-after:always;padding:0 4mm}h1{font-size:20pt;margin:2mm 0 6mm;color:#3a2410}h2{font-size:14pt;color:#5a3a14;margin:7mm 0 2mm}.k{color:#8a6a30;letter-spacing:3px;font-size:10pt}pre{background:#f5f1e8;padding:8px 10px;border-radius:4px;font-size:8.5pt;white-space:pre-wrap}code{font-family:S;background:#f5f1e8;padding:0 3px}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #ccb;padding:4px 6px;text-align:left}blockquote{border-left:3px solid #b08a40;margin:0;padding:4px 12px;background:#faf6ec}.cover{height:250mm;display:flex;flex-direction:column;justify-content:center;text-align:center}.cover h1{font-size:30pt}</style><section class=cover><div class=k>暗岩秘典 · 讲义草稿（待 Rhett 审）</div><h1>卷'+v.cn+' · '+v.title+'</h1><p>'+v.tagline+'</p><p style=\"color:#888\">'+new Date().toISOString().slice(0,10)+' · 未发布，审过后再开卷</p></section>'+body;
fs.writeFileSync('/tmp/review.html',html); console.log(v.cn);" > /tmp/cn
CN=$(cat /tmp/cn)
LD_LIBRARY_PATH=/workspace/work/.envcache/libs/usr/lib/aarch64-linux-gnu timeout 60 /workspace/work/.envcache/ms-playwright/chromium-1140/chrome-linux/chrome --headless=new --no-sandbox --disable-gpu --allow-file-access-from-files --no-pdf-header-footer --print-to-pdf=/tmp/review.pdf file:///tmp/review.html 2>/dev/null
cp /tmp/review.pdf "../卷${CN}讲义草稿_待审.pdf"; echo "../卷${CN}讲义草稿_待审.pdf"
