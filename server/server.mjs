// 暗岩秘典 · 后端（零依赖：node:http + node:sqlite）。启动：node server/server.mjs
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { cfg } from './config.mjs';
import { db, now, log, grant, entitled, MEMBER_VOLS, confirmManual, cancelOrder } from './db.mjs';
import * as afd from './afdian.mjs';

/* ───── 工具 ───── */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.txt': 'text/plain; charset=utf-8' };
const SEC_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN' };
const json = (res, code, obj, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS, ...extra }); res.end(JSON.stringify(obj)); };
const fail = (res, code, msg) => json(res, code, { ok: false, error: msg });
const hmac = s => createHmac('sha256', cfg.secret).update(s).digest('base64url');
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const ipOf = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

async function body(req, limit = 64 * 1024) {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > limit) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
}

/* ───── 密码与会话 ───── */
const hashPass = p => { const salt = randomBytes(16); return `s1$${salt.toString('base64')}$${scryptSync(p, salt, 64).toString('base64')}`; };
const checkPass = (p, stored) => {
  const [, s, h] = stored.split('$'); const a = scryptSync(p, Buffer.from(s, 'base64'), 64), b = Buffer.from(h, 'base64');
  return a.length === b.length && timingSafeEqual(a, b);
};
const DUMMY = hashPass(randomBytes(8).toString('hex'));

function newSession(res, userId, ua) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token,user_id,created,seen,ua) VALUES(?,?,?,?,?)').run(token, userId, now(), now(), (ua || '').slice(0, 200));
  // 设备上限：超出时踢掉最久没用的
  const extra = db.prepare('SELECT token FROM sessions WHERE user_id=? ORDER BY seen DESC, rowid DESC LIMIT -1 OFFSET ?').all(userId, cfg.maxDevices);
  for (const s of extra) db.prepare('DELETE FROM sessions WHERE token=?').run(s.token);
  setCookie(res, token, cfg.sessionDays * 86400);
}
function setCookie(res, val, maxAge) {
  res.setHeader('set-cookie', `tome_sid=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secureCookie ? '; Secure' : ''}`);
}
function currentUser(req) {
  const t = cookies(req).tome_sid; if (!t) return null;
  const s = db.prepare('SELECT s.token, s.seen, u.id, u.email, u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(t);
  if (!s || s.disabled) return null;
  if (now() - s.seen > cfg.sessionDays * 86400) { db.prepare('DELETE FROM sessions WHERE token=?').run(t); return null; }
  if (now() - s.seen > 300) db.prepare('UPDATE sessions SET seen=? WHERE token=?').run(now(), t);
  return { id: s.id, email: s.email, token: s.token };
}

// 简单限流：同一 IP 每 15 分钟最多 N 次
const buckets = new Map();
function limited(key, max) {
  const t = Date.now(), b = buckets.get(key) || []; const fresh = b.filter(x => t - x < 15 * 60e3);
  fresh.push(t); buckets.set(key, fresh); return fresh.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of buckets) if (!v.some(x => t - x < 15 * 60e3)) buckets.delete(k); }, 60e3).unref();

// 防跨站：写操作必须同源（Origin/Referer 与 BASE_URL 一致）
function sameOrigin(req) {
  const o = req.headers.origin || req.headers.referer; if (!o) return false;
  try { const a = new URL(o), b = new URL(cfg.baseUrl); return a.host === b.host || a.host === req.headers.host; } catch { return false; }
}

/* ───── 播放地址签名 ───── */
const signSeg = (path, uid, exp) => hmac(`${path}|${uid}|${exp}`);
const VALID_PART = /^[0-9]{1,2}$/;

/* ───── 收款 ───── */
const isAdmin = u => !!u && cfg.adminEmails.includes(u.email);
const payMethods = () => ({
  afdian: Object.fromEntries(['single', 'full', 'mentor'].map(p => [p, afd.payable(p)])),
  wechat: cfg.wechat.enabled,
});
// 微信个人码没有订单号，用「价格 + 随机角分」区分每一单：¥199 → ¥199.37。48 小时内不重复
function uniqueAmount(price) {
  const base = Math.round(parseFloat(price) * 100);
  const used = new Set(db.prepare("SELECT pay_amount FROM orders WHERE method='wechat' AND status='pending' AND created>?").all(now() - 2 * 86400).map(r => r.pay_amount));
  for (let i = 0; i < 400; i++) {
    const c = base + 1 + (randomBytes(1)[0] % 99), s = (c / 100).toFixed(2);
    if (!used.has(s)) return s;
  }
  throw new Error('待确认的微信订单太多，请先处理');
}

/* ───── 路由 ───── */
const routes = {
  'POST /api/register': async (req, res) => {
    if (limited('reg:' + ipOf(req), 10)) return fail(res, 429, '操作太频繁，请稍后再试');
    const { email = '', password = '' } = await body(req);
    const em = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 120) return fail(res, 400, '邮箱格式不对');
    if (String(password).length < 8 || String(password).length > 128) return fail(res, 400, '密码至少 8 位');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(em)) return fail(res, 409, '这个邮箱已经注册过，请直接登录');
    const r = db.prepare('INSERT INTO users(email,pass,created) VALUES(?,?,?)').run(em, hashPass(String(password)), now());
    log('register', String(r.lastInsertRowid));
    newSession(res, Number(r.lastInsertRowid), req.headers['user-agent']);
    json(res, 200, { ok: true });
  },
  'POST /api/login': async (req, res) => {
    const { email = '', password = '' } = await body(req);
    const em = String(email).trim().toLowerCase();
    if (limited('login:' + ipOf(req), 20) || limited('login:' + em, 10)) return fail(res, 429, '尝试次数太多，请 15 分钟后再试');
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(em);
    const ok = checkPass(String(password), u ? u.pass : DUMMY);
    if (!u || !ok || u.disabled) return fail(res, 401, '邮箱或密码不对');
    newSession(res, u.id, req.headers['user-agent']);
    json(res, 200, { ok: true });
  },
  'POST /api/logout': async (req, res) => {
    const u = currentUser(req); if (u) db.prepare('DELETE FROM sessions WHERE token=?').run(u.token);
    setCookie(res, '', 0); json(res, 200, { ok: true });
  },
  'POST /api/password': async (req, res, u) => {
    const { old = '', password = '' } = await body(req);
    const row = db.prepare('SELECT pass FROM users WHERE id=?').get(u.id);
    if (!checkPass(String(old), row.pass)) return fail(res, 401, '原密码不对');
    if (String(password).length < 8) return fail(res, 400, '新密码至少 8 位');
    db.prepare('UPDATE users SET pass=? WHERE id=?').run(hashPass(String(password)), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(u.id, u.token);
    json(res, 200, { ok: true });
  },
  'GET /api/me': async (req, res) => {
    const u = currentUser(req);
    if (!u) return json(res, 200, { ok: true, user: null });
    const vols = db.prepare('SELECT vol FROM entitlements WHERE user_id=? ORDER BY vol').all(u.id).map(r => r.vol);
    const orders = db.prepare("SELECT id,product,vol,amount,pay_amount,method,claimed,status,created,paid FROM orders WHERE user_id=? AND status<>'cancelled' ORDER BY created DESC LIMIT 20").all(u.id);
    const progress = db.prepare('SELECT vol,lesson,pct FROM progress WHERE user_id=?').all(u.id);
    const devices = db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(u.id).n;
    json(res, 200, { ok: true, user: { id: u.id, email: u.email }, vols, orders, progress, devices, maxDevices: cfg.maxDevices,
      payReady: afd.enabled() || cfg.wechat.enabled, pay: payMethods(), admin: isAdmin(u) });
  },
  'GET /api/pay': async (req, res) => json(res, 200, { ok: true, ...payMethods() }),
  'POST /api/orders': async (req, res, u) => {
    let { product, vol, method } = await body(req);
    if (!['single', 'full', 'mentor'].includes(product)) return fail(res, 400, '没有这个方案');
    const v = product === 'single' ? Number(vol) : null;
    if (product === 'single' && !MEMBER_VOLS.includes(v)) return fail(res, 400, '请选择要买的卷');
    if (product === 'single' && entitled(u.id, v)) return fail(res, 409, '这一卷你已经有了');
    if (product !== 'single' && MEMBER_VOLS.every(x => entitled(u.id, x)) && product === 'full') return fail(res, 409, '你已经拥有全卷');
    const pm = payMethods();
    if (!method) method = pm.afdian[product] ? 'afdian' : 'wechat';
    if (method === 'afdian' && !pm.afdian[product]) return json(res, 503, { ok: false, error: '爱发电通道还没开通，可以先用微信扫码' });
    if (method === 'wechat' && !pm.wechat) return json(res, 503, { ok: false, error: '微信收款暂未开放' });
    if (!['afdian', 'wechat'].includes(method)) return fail(res, 400, '没有这种付款方式');
    if (limited('order:' + u.id, 20)) return fail(res, 429, '下单太频繁');
    // 同一方案、同一付款方式的待付订单直接复用（爱发电 30 分钟，微信 24 小时，免得金额变来变去）
    const keep = method === 'wechat' ? 86400 : 1800;
    let o = db.prepare("SELECT * FROM orders WHERE user_id=? AND product=? AND IFNULL(vol,-1)=IFNULL(?,-1) AND method=? AND status='pending' AND created>? ORDER BY created DESC").get(u.id, product, v, method, now() - keep);
    if (!o) {
      const id = 'AY' + Date.now().toString(36).toUpperCase() + randomBytes(4).toString('hex').toUpperCase();
      const payAmount = method === 'wechat' ? uniqueAmount(cfg.prices[product]) : null;
      db.prepare('INSERT INTO orders(id,user_id,product,vol,amount,method,pay_amount,created) VALUES(?,?,?,?,?,?,?,?)').run(id, u.id, product, v, cfg.prices[product], method, payAmount, now());
      o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    }
    if (method === 'wechat') return json(res, 200, { ok: true, method, order: o.id, amount: o.amount, payAmount: o.pay_amount, qr: cfg.wechat.qr, payee: cfg.wechat.name, claimed: !!o.claimed });
    json(res, 200, { ok: true, method, order: o.id, amount: o.amount, payUrl: afd.payUrl(o) });
  },
  // 微信扫码后点「我已付款」：只是通知作者去核对，不会直接开通
  'POST /api/orders/claim': async (req, res, u) => {
    const { id } = await body(req);
    const o = db.prepare("SELECT * FROM orders WHERE id=? AND user_id=? AND method='wechat'").get(String(id || ''), u.id);
    if (!o) return fail(res, 404, '没有这个订单');
    if (o.status !== 'pending') return json(res, 200, { ok: true, status: o.status });
    if (!o.claimed) { db.prepare('UPDATE orders SET claimed=? WHERE id=?').run(now(), o.id); log('wechat_claim', o.id, { user: u.id, pay_amount: o.pay_amount }); }
    json(res, 200, { ok: true, status: 'pending' });
  },
  /* 后台：微信到账确认（只有 ADMIN_EMAILS 里的账号能用） */
  'GET /api/admin/orders': async (req, res, u, q) => {
    if (!isAdmin(u)) return fail(res, 403, '没有后台权限');
    const st = q.get('status') === 'paid' ? 'paid' : 'pending';
    const rows = db.prepare(`SELECT o.id,u.email,o.product,o.vol,o.amount,o.pay_amount,o.method,o.status,o.claimed,o.created,o.paid FROM orders o JOIN users u ON u.id=o.user_id
      WHERE o.status=? AND o.created>? ORDER BY (o.claimed IS NULL), o.claimed DESC, o.created DESC LIMIT 100`).all(st, now() - 14 * 86400);
    json(res, 200, { ok: true, orders: rows });
  },
  'POST /api/admin/confirm': async (req, res, u) => {
    if (!isAdmin(u)) return fail(res, 403, '没有后台权限');
    const r = confirmManual(String((await body(req)).id || ''), u.email);
    json(res, r === 'ok' || r === 'dup' ? 200 : 409, { ok: r === 'ok' || r === 'dup', result: r });
  },
  'POST /api/admin/cancel': async (req, res, u) => {
    if (!isAdmin(u)) return fail(res, 403, '没有后台权限');
    const r = cancelOrder(String((await body(req)).id || ''), u.email);
    json(res, r === 'ok' ? 200 : 409, { ok: r === 'ok', result: r });
  },
  'GET /api/orders/status': async (req, res, u, q) => {
    const o = db.prepare('SELECT id,status,product,vol,method FROM orders WHERE id=? AND user_id=?').get(q.get('id') || '', u.id);
    if (!o) return fail(res, 404, '没有这个订单');
    // 还没到账时主动回查一次爱发电（每单 30 秒最多一次）
    if (o.status === 'pending' && o.method === 'afdian' && afd.enabled() && !limited('poll:' + o.id, 1)) {
      try { await afd.reconcile(); } catch (e) { console.error('[reconcile]', e.message); }
      Object.assign(o, db.prepare('SELECT status FROM orders WHERE id=?').get(o.id));
    }
    json(res, 200, { ok: true, ...o });
  },
  'POST /api/redeem': async (req, res, u) => {
    if (limited('redeem:' + u.id, 10)) return fail(res, 429, '尝试次数太多，请稍后再试');
    const code = String((await body(req)).code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const c = db.prepare('SELECT * FROM codes WHERE code=?').get(code);
    if (!c) return fail(res, 404, '兑换码不存在');
    if (c.used_by) return fail(res, 409, c.used_by === u.id ? '你已经用过这个兑换码' : '兑换码已被使用');
    const r = db.prepare('UPDATE codes SET used_by=?, used_at=? WHERE code=? AND used_by IS NULL').run(u.id, now(), code);
    if (!r.changes) return fail(res, 409, '兑换码已被使用');
    const vols = grant(u.id, c.product, c.vol, 'code:' + code);
    log('redeem', code, { user: u.id });
    json(res, 200, { ok: true, vols });
  },
  'POST /api/progress': async (req, res, u) => {
    const { vol, lesson, pct } = await body(req);
    const v = Number(vol), l = Number(lesson), p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    if (!Number.isInteger(v) || !Number.isInteger(l) || v < 0 || v > 5 || l < 1 || l > 30) return fail(res, 400, 'bad');
    db.prepare('INSERT INTO progress(user_id,vol,lesson,pct,updated) VALUES(?,?,?,?,?) ON CONFLICT(user_id,vol,lesson) DO UPDATE SET pct=MAX(pct,excluded.pct), updated=excluded.updated').run(u.id, v, l, p, now());
    json(res, 200, { ok: true });
  },
  'POST /api/afdian/webhook': async (req, res) => {
    // 无论结果如何都尽快回 ec:200，否则爱发电会认为失败；结果写进 events 表
    let result = 'error';
    try { result = await afd.handleWebhook(await body(req, 256 * 1024)); } catch (e) { console.error('[webhook]', e.message); log('webhook_error', null, { msg: e.message }); }
    if (result !== 'ok' && result !== 'dup') log('webhook_result', null, { result });
    json(res, 200, { ec: 200, em: '' });
  },
};

// 播放列表：要登录且有该卷权益（卷〇 免登录）。分片地址带 10 分钟签名
async function playlist(req, res, vol, lesson) {
  const v = +vol; const u = currentUser(req);
  if (v !== 0 && (!u || !entitled(u.id, v))) return fail(res, u ? 403 : 401, u ? '还没有这一卷' : '请先登录');
  const dir = join(cfg.mediaDir, vol, lesson); const f = join(dir, 'index.m3u8');
  if (!existsSync(f)) return fail(res, 404, '这一节还在录制');
  const uid = u ? u.id : 0, exp = now() + 600;
  const out = readFileSync(f, 'utf8').split('\n').map(line => {
    if (line.startsWith('#EXT-X-KEY')) return line.replace(/URI="[^"]*"/, `URI="/api/media/${vol}/${lesson}/key"`);
    if (line && !line.startsWith('#')) {
      const name = line.trim(); if (!/^[\w.-]+\.ts$/.test(name)) return '';
      const p = `${vol}/${lesson}/${name}`;
      return `/m/${p}?u=${uid}&e=${exp}&s=${signSeg(p, uid, exp)}`;
    }
    return line;
  }).join('\n');
  res.writeHead(200, { 'content-type': MIME['.m3u8'], 'cache-control': 'no-store', ...SEC_HEADERS }); res.end(out);
}
function mediaKey(req, res, vol, lesson) {
  const v = +vol; const u = currentUser(req);
  if (v !== 0 && (!u || !entitled(u.id, v))) return fail(res, 403, 'forbidden');
  const f = join(cfg.mediaDir, vol, lesson, 'enc.key');
  if (!existsSync(f)) return fail(res, 404, 'no key');
  res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(f));
}
function segment(req, res, vol, lesson, name, q) {
  const p = `${vol}/${lesson}/${name}`, uid = q.get('u'), exp = +q.get('e'), s = q.get('s') || '';
  const want = signSeg(p, uid, exp);
  if (!exp || exp < now() || s.length !== want.length || !timingSafeEqual(Buffer.from(s), Buffer.from(want))) return fail(res, 403, 'expired');
  sendFile(req, res, join(cfg.mediaDir, vol, lesson, name), 'private, max-age=600');
}

function sendFile(req, res, file, cache) {
  let st; try { st = statSync(file); } catch { return null; }
  if (!st.isFile()) return null;
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'content-type': type, 'cache-control': cache || (/\.(html)$/.test(file) ? 'no-cache' : 'public, max-age=86400'), 'accept-ranges': 'bytes', ...SEC_HEADERS };
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res); return true;
}
function staticFile(req, res, pathname) {
  let p; try { p = decodeURIComponent(pathname); } catch { return fail(res, 400, 'bad path'); }
  const full = normalize(join(cfg.staticDir, p));
  if (!full.startsWith(normalize(cfg.staticDir + sep)) && full !== normalize(cfg.staticDir)) return fail(res, 403, 'forbidden');
  let target = full;
  try { if (statSync(target).isDirectory()) { if (!pathname.endsWith('/')) { res.writeHead(301, { location: pathname + '/' }); return res.end(); } target = join(target, 'index.html'); } } catch {}
  if (sendFile(req, res, target) === null) {
    res.writeHead(404, { 'content-type': MIME['.html'] });
    const nf = join(cfg.staticDir, '404.html'); res.end(existsSync(nf) ? readFileSync(nf) : 'Not found');
  }
}

const NEED_LOGIN = new Set(['POST /api/password', 'POST /api/orders', 'POST /api/orders/claim', 'GET /api/admin/orders', 'POST /api/admin/confirm', 'POST /api/admin/cancel', 'GET /api/orders/status', 'POST /api/redeem', 'POST /api/progress']);
const NO_ORIGIN_CHECK = new Set(['POST /api/afdian/webhook']);

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const path = url.pathname;
  try {
    let m;
    if ((m = path.match(/^\/api\/media\/(\d{1,2})\/(\d{1,2})\/(playlist\.m3u8|key)$/)) && req.method === 'GET') {
      if (!VALID_PART.test(m[1]) || !VALID_PART.test(m[2])) return fail(res, 400, 'bad');
      return m[3] === 'key' ? mediaKey(req, res, m[1], m[2]) : playlist(req, res, m[1], m[2]);
    }
    if ((m = path.match(/^\/m\/(\d{1,2})\/(\d{1,2})\/([\w.-]+\.ts)$/))) return segment(req, res, m[1], m[2], m[3], url.searchParams);
    if (path.startsWith('/api/')) {
      const key = `${req.method} ${path}`; const h = routes[key];
      if (!h) return fail(res, 404, 'not found');
      if (req.method === 'POST' && !NO_ORIGIN_CHECK.has(key) && !sameOrigin(req)) return fail(res, 403, '请求来源不对');
      let u = null;
      if (NEED_LOGIN.has(key)) { u = currentUser(req); if (!u) return fail(res, 401, '请先登录'); }
      return await h(req, res, u, url.searchParams);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method');
    return staticFile(req, res, path);
  } catch (e) {
    if (e.code === 413 || e.code === 400) return fail(res, e.code, e.message);
    console.error(e); if (!res.headersSent) fail(res, 500, '服务器出错了');
  }
});

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  server.listen(cfg.port, cfg.host, () => console.log(`[tome] ${cfg.baseUrl}  (listen ${cfg.host}:${cfg.port})  爱发电：${afd.enabled() ? '已配置' : '未配置'}  微信收款码：${cfg.wechat.enabled ? '开' : '关'}  后台账号：${cfg.adminEmails.length}`));
  // 每 10 分钟对账一次，防回调丢失
  setInterval(() => afd.reconcile().then(r => r && !r.skipped && r.pending !== 0 && console.log('[reconcile]', r)).catch(e => console.error('[reconcile]', e.message)), 600e3).unref();
  // 清理过期会话
  setInterval(() => db.prepare('DELETE FROM sessions WHERE seen < ?').run(now() - cfg.sessionDays * 86400), 3600e3).unref();
}
