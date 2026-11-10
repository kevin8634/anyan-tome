// 课程正文：course/<卷>/<节>.md → docs/locked/<卷>/<节>.json
//   卷〇（免费）写明文 { html }；付费卷用卷钥 AES-128-GCM 加密 { iv, ct }，只有解锁码能打开。
//   course/ 和 keys/ 都不进 Git（明文与总钥只留在本地）。
// 正文里单独一行写 [[视频]]，会在该处放播放器（视频用 tools/pack-locked.sh 切片加密到 docs/locked/<卷>/<节>/）
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
// 够用的小 Markdown：# 标题、段落、- 列表、1. 列表、> 引用、``` 代码块、| 表格 |、---、[[视频]]
export function md(src) {
  const L = src.replace(/\r/g, '').split('\n'), out = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const lang = l.slice(3).trim(); const buf = []; i++; while (i < L.length && !/^```/.test(L[i])) buf.push(L[i++]); i++; out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    if (/^\[\[视频\]\]\s*$/.test(l)) { out.push('<div class="lvid"></div>'); i++; continue; }
    if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)[0].length + 1; out.push(`<h${n}>${inline(l.replace(/^#+ /, ''))}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^> /.test(l)) { const buf = []; while (i < L.length && /^> ?/.test(L[i])) buf.push(L[i++].replace(/^> ?/, '')); out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`); continue; }
    if (/^\|/.test(l)) {
      const rows = []; while (i < L.length && /^\|/.test(L[i])) rows.push(L[i++]);
      const cells = r => r.replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim());
      const body = rows.filter(r => !/^\|[\s:|-]+\|?\s*$/.test(r));
      out.push(`<table><thead><tr>${cells(body[0]).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue;
    }
    if (/^(- |\d+\. )/.test(l)) {
      const ol = /^\d+\. /.test(l), buf = [];
      while (i < L.length && /^(- |\d+\. |  +\S)/.test(L[i])) { const x = L[i++]; if (/^  +\S/.test(x) && buf.length) buf[buf.length - 1] += ' ' + x.trim(); else buf.push(x.replace(/^(- |\d+\. )/, '')); }
      out.push(`<${ol ? 'ol' : 'ul'}>${buf.map(x => `<li>${inline(x)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`); continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < L.length && L[i].trim() && !/^(#{1,4} |```|> |- |\d+\. |\||---|\[\[)/.test(L[i])) buf.push(L[i++]);
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

export async function lockAll(ROOT, OUT, volumes) {
  await import(join(ROOT, 'static/js/tomecode.js')); const T = globalThis.TomeCode;
  const keyFile = join(ROOT, 'keys/master.key');
  const M = existsSync(keyFile) ? T.unhex(readFileSync(keyFile, 'utf8').trim()) : null;
  const avail = {}; let locked = 0, skipped = 0;
  for (const v of volumes) {
    const dir = join(ROOT, 'course', String(v.no)); if (!existsSync(dir) || !(v.free || v.status === 'open')) continue; // 筹备中的卷不发布
    for (const f of readdirSync(dir).filter(f => /^\d+\.md$/.test(f))) {
      const n = +f.split('.')[0], src = readFileSync(join(dir, f), 'utf8');
      const html = md(src), video = /<div class="lvid">/.test(html) && existsSync(join(OUT, 'locked', String(v.no), String(n), 'index.m3u8'));
      let out;
      if (v.free) out = { html };
      else {
        if (!M) { skipped++; continue; }
        const key = await crypto.subtle.importKey('raw', T.aesKey(T.volSeed(M, v.no)), 'AES-GCM', false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html)));
        out = { iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64') }; locked++;
      }
      mkdirSync(join(OUT, 'locked', String(v.no)), { recursive: true });
      writeFileSync(join(OUT, 'locked', String(v.no), `${n}.json`), JSON.stringify(out));
      (avail[v.no] ||= {})[n] = { video };
    }
  }
  const rv = join(ROOT, 'keys/revoked.json');
  mkdirSync(join(OUT, 'locked'), { recursive: true });
  writeFileSync(join(OUT, 'locked/revoked.json'), existsSync(rv) ? readFileSync(rv, 'utf8') : '[]');
  if (skipped) console.warn(`⚠ 没有 keys/master.key，跳过了 ${skipped} 节付费正文（先运行 npm run code init）`);
  return { avail, locked };
}
