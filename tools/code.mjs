// 发码器（命令行版）。网页版：npm run code html → keys/发码器.html，双击打开即可用（不要上传、不要发给别人）
//   npm run code init                  第一次：生成总钥 keys/master.key（只做一次！丢了旧码全部失效）
//   npm run code full  "张三 微信xx"     发一个全卷码（亲授用 mentor，单卷用 1–5）
//   npm run code list                  看发过的码（keys/ledger.csv）
//   npm run code revoke <码或编号>       拉黑一个泄漏的码，然后重新构建并推送
//   npm run code html                  生成网页版发码器
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
await import(join(ROOT, 'static/js/tomecode.js')); const T = globalThis.TomeCode;
const KEYS = join(ROOT, 'keys'), MK = join(KEYS, 'master.key'), LEDGER = join(KEYS, 'ledger.csv'), RV = join(KEYS, 'revoked.json');
mkdirSync(KEYS, { recursive: true });
const master = () => { if (!existsSync(MK)) { console.error('还没有总钥，先运行：npm run code init'); process.exit(1); } return T.unhex(readFileSync(MK, 'utf8').trim()); };
const TYPES = { full: 15, all: 15, mentor: 31 };
const [cmd, ...rest] = process.argv.slice(2);

function issue(type, note) {
  const M = master(), serial = randomBytes(2).readUInt16BE(0);
  const code = T.make(M, type, serial), p = T.parse(code);
  if (!existsSync(LEDGER)) writeFileSync(LEDGER, '\ufeff时间,编号,类型,解锁码,备注\n');
  appendFileSync(LEDGER, [new Date().toLocaleString('zh-CN', { hour12: false }), p.id, p.name, code, `"${String(note || '').replace(/"/g, '""')}"`].join(',') + '\n');
  return { code, ...p };
}

switch (cmd) {
  case 'init': {
    if (existsSync(MK)) { console.error('已经有总钥了，不要重复生成（会让所有已发的码失效）。'); process.exit(1); }
    writeFileSync(MK, randomBytes(12).toString('hex') + '\n', { mode: 0o600 });
    console.log('已生成总钥 keys/master.key。请另外备份一份到安全的地方，不要提交到 Git。'); break;
  }
  case 'list': console.log(existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '还没有发过码'); break;
  case 'revoke': {
    const x = rest[0] || ''; const p = T.parse(x); const id = p.error ? x.toUpperCase() : p.id;
    if (!/^[0-9A-F]{1,2}:[0-9A-F]{4}$/.test(id)) { console.error('请给出解锁码或编号（如 F:10E1）'); process.exit(1); }
    const list = existsSync(RV) ? JSON.parse(readFileSync(RV, 'utf8')) : [];
    if (!list.includes(id)) list.push(id); writeFileSync(RV, JSON.stringify(list));
    console.log(`已拉黑 ${id}。重新构建并推送后生效。`); break;
  }
  case 'html': {
    const M = master(), core = readFileSync(join(ROOT, 'static/js/tomecode.js'), 'utf8');
    const html = readFileSync(join(ROOT, 'tools/发码器.template.html'), 'utf8').replace('/*CORE*/', core).replace('__MASTER__', T.hex(M));
    writeFileSync(join(KEYS, '发码器.html'), html); console.log('已生成 keys/发码器.html（含总钥，只能自己留着）'); break;
  }
  default: {
    const type = TYPES[cmd] ?? (/^[1-9]$/.test(cmd || '') ? +cmd : null);
    if (type == null) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 7).join('\n')); process.exit(cmd ? 1 : 0); }
    const r = issue(type, rest.join(' '));
    console.log(`${r.name}  编号 ${r.id}\n${r.code}`);
  }
}
