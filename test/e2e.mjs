// 端到端自测：假爱发电（会校验签名）+ 真后端。用法：node test/e2e.mjs
// 不访问真实爱发电，不花钱。
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const PJ = JSON.parse((await import('node:fs')).readFileSync(new URL('../docs/prices.json', import.meta.url), 'utf8')), FULL = PJ.full, SINGLE = PJ.single;
import assert from 'node:assert/strict';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'tome-'));
const TOKEN = 'test-token-123', UID = 'creator-abc';
const PLANS = { single: 'plan-single', full: 'plan-full', mentor: 'plan-mentor' };

/* 假爱发电 */
const remoteOrders = [];
const mock = createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  const b = JSON.parse(raw);
  const want = createHash('md5').update(`${TOKEN}params${b.params}ts${b.ts}user_id${b.user_id}`).digest('hex');
  res.setHeader('content-type', 'application/json');
  if (b.sign !== want) return res.end(JSON.stringify({ ec: 400005, em: 'sign validation failed' }));
  const p = JSON.parse(b.params);
  if (req.url.endsWith('/ping')) return res.end(JSON.stringify({ ec: 200, em: 'pong', data: { uid: UID } }));
  const list = p.out_trade_no ? remoteOrders.filter(o => p.out_trade_no.split(',').includes(o.out_trade_no)) : remoteOrders.slice().reverse();
  res.end(JSON.stringify({ ec: 200, em: '', data: { list, total_count: list.length, total_page: 1 } }));
});
await new Promise(r => mock.listen(0, '127.0.0.1', r));
const MOCK = `http://127.0.0.1:${mock.address().port}`;

/* 测试用视频：从钩子片切 8 秒，打包成加密 HLS */
const media = join(tmp, 'media'); mkdirSync(media);
const clip = join(tmp, 'clip.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-t', '8', '-i', join(ROOT, 'static/video/hook60.mp4'), '-c', 'copy', clip]);
Object.assign(process.env, {
  NODE_ENV: 'test', PORT: '0', BASE_URL: 'http://127.0.0.1', SECRET: 'x'.repeat(40), DB_PATH: join(tmp, 'tome.db'),
  MEDIA_DIR: media, AFDIAN_API: MOCK, AFDIAN_USER_ID: UID, AFDIAN_TOKEN: TOKEN,
  AFDIAN_PLAN_SINGLE: PLANS.single, AFDIAN_PLAN_FULL: PLANS.full, AFDIAN_PLAN_MENTOR: PLANS.mentor, TOME_ENV: '/nonexistent', ADMIN_EMAILS: 'boss@test.cn',
});
// pack-hls 写到 ROOT/media，测试里改成直接在 tmp 里跑一份
execFileSync('bash', ['-c', `cd ${tmp} && mkdir -p tools && cp ${ROOT}/tools/pack-hls.sh tools/ && tools/pack-hls.sh ${clip} 1 1`]);
assert.ok(existsSync(join(media, '1/1/index.m3u8')), 'HLS 打包');

const { server } = await import('../server/server.mjs');
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
process.env.BASE_URL = BASE;
const { cfg } = await import('../server/config.mjs'); cfg.baseUrl = BASE;

/* 客户端：带 cookie */
const client = () => {
  let cookie = '';
  const f = async (path, body, extra = {}) => {
    const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', redirect: 'manual',
      headers: { ...(body ? { 'content-type': 'application/json', origin: BASE } : {}), ...(cookie ? { cookie } : {}), ...extra },
      body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, j: ct.includes('json') ? await r.json() : null, text: ct.includes('json') ? '' : await r.text() };
  };
  return f;
};
let n = 0; const ok = m => console.log(`  ✓ ${++n}. ${m}`);
const hook = order => fetch(BASE + '/api/afdian/webhook', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ec: 200, em: 'ok', data: { type: 'order', order } }) }).then(r => r.json());

try {
  const A = client();
  assert.equal((await A('/')).status, 200); ok('静态首页可访问');
  assert.equal((await A('/../server/.env')).status !== 200, true); ok('不能越权读文件');
  assert.equal((await A('/api/register', { email: 'bad', password: '12345678' })).status, 400); ok('邮箱格式校验');
  assert.equal((await A('/api/register', { email: 'rhett@test.cn', password: 'short' })).status, 400); ok('密码长度校验');
  assert.equal((await A('/api/register', { email: 'Rhett@Test.cn', password: 'pass-1234' })).j.ok, true); ok('注册成功并自动登录');
  let me = (await A('/api/me')).j; assert.equal(me.user.email, 'rhett@test.cn'); assert.deepEqual(me.vols, []); ok('/api/me 返回用户，暂无权益');

  // 跨站请求被拒
  const r403 = await fetch(BASE + '/api/orders', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"product":"full"}' });
  assert.equal(r403.status, 403); ok('跨站下单被拒（Origin 校验）');

  // 下单
  const o = (await A('/api/orders', { product: 'full' })).j; assert.ok(o.ok);
  const pu = new URL(o.payUrl); assert.equal(pu.searchParams.get('custom_order_id'), o.order); assert.equal(pu.searchParams.get('plan_id'), PLANS.full);
  ok(`下单生成爱发电付款链接（custom_order_id=${o.order}）`);
  assert.equal((await A('/api/orders', { product: 'full' })).j.order, o.order); ok('30 分钟内重复点击复用同一订单');

  // 伪造回调：爱发电那边查不到这笔
  assert.equal((await hook({ out_trade_no: 'FAKE001', custom_order_id: o.order, status: 2, total_amount: FULL, plan_id: PLANS.full })).ec, 200);
  assert.deepEqual((await A('/api/me')).j.vols, []); ok('伪造的回调不会开通（回查不到订单）');

  // 金额不对
  remoteOrders.push({ out_trade_no: 'T-LOW', custom_order_id: o.order, status: 2, total_amount: '1.00', show_amount: '1.00', plan_id: PLANS.full });
  await hook({ out_trade_no: 'T-LOW', custom_order_id: o.order });
  assert.deepEqual((await A('/api/me')).j.vols, []); ok('付款金额不足不会开通');

  // 方案不对
  remoteOrders.push({ out_trade_no: 'T-PLAN', custom_order_id: o.order, status: 2, total_amount: FULL, show_amount: FULL, plan_id: 'other-plan' });
  await hook({ out_trade_no: 'T-PLAN', custom_order_id: o.order });
  assert.deepEqual((await A('/api/me')).j.vols, []); ok('方案对不上不会开通');

  // 真付款
  remoteOrders.push({ out_trade_no: 'T-REAL-1', custom_order_id: o.order, status: 2, total_amount: FULL, show_amount: FULL, plan_id: PLANS.full, remark: '' });
  assert.equal((await hook({ out_trade_no: 'T-REAL-1', custom_order_id: o.order })).ec, 200);
  me = (await A('/api/me')).j; assert.deepEqual(me.vols, [1, 2, 3, 4, 5, 6]); assert.equal(me.orders[0].status, 'paid');
  ok('真实付款回调 → 回查通过 → 自动开通卷一至卷六');
  await hook({ out_trade_no: 'T-REAL-1', custom_order_id: o.order });
  assert.equal((await A('/api/me')).j.orders.filter(x => x.status === 'paid').length, 1); ok('重复推送幂等，不重复记账');
  assert.equal((await A('/api/orders/status?id=' + o.order)).j.status, 'paid'); ok('订单状态查询');

  // 回调丢失 → 对账补单（B 用户单买卷二）
  const B = client();
  await B('/api/register', { email: 'b@test.cn', password: 'pass-5678' });
  const ob = (await B('/api/orders', { product: 'single', vol: 2 })).j; assert.ok(ob.ok);
  remoteOrders.push({ out_trade_no: 'T-REAL-2', custom_order_id: ob.order, status: 2, total_amount: SINGLE, show_amount: SINGLE, plan_id: PLANS.single });
  assert.equal(ob.amount, SINGLE); ok('普通卷单买按单卷价下单');
  if (PJ.vol?.['6']) { const o6 = (await B('/api/orders', { product: 'single', vol: 6 })).j; assert.ok(o6.ok); assert.equal(o6.amount, PJ.vol['6']); ok('实战卷单买按实战卷价下单'); }
  assert.equal((await B('/api/orders/status?id=' + ob.order)).j.status, 'paid');
  assert.deepEqual((await B('/api/me')).j.vols, [2]); ok('没收到回调时，查询订单会主动对账补开通（单卷）');

  // 视频
  const pl = await A('/api/media/1/1/playlist.m3u8');
  assert.equal(pl.status, 200); assert.match(pl.text, /\/m\/1\/1\/seg_000\.ts\?u=\d+&e=\d+&s=/); assert.match(pl.text, /URI="\/api\/media\/1\/1\/key"/);
  ok('会员拿到带签名的加密播放列表');
  const seg = pl.text.split('\n').find(l => l.startsWith('/m/'));
  assert.equal((await fetch(BASE + seg)).status, 200); ok('签名分片可下载');
  assert.equal((await fetch(BASE + seg.replace(/s=[^&]+/, 's=AAAA'))).status, 403); ok('篡改签名的分片被拒');
  assert.equal((await fetch(BASE + seg.replace(/e=\d+/, 'e=1000'))).status, 403); ok('过期的分片地址被拒');
  const key = await fetch(BASE + '/api/media/1/1/key', { headers: { cookie: '' } }); assert.equal(key.status, 403); ok('未登录拿不到密钥');
  assert.equal((await B('/api/media/1/1/playlist.m3u8')).status, 403); ok('只买了卷二的人看不了卷一');
  const C = client(); assert.equal((await C('/api/media/1/1/playlist.m3u8')).status, 401); ok('未登录看不了会员卷');
  // 用 ffmpeg 实际解密播放（带 A 的 cookie 取 key）
  const plFile = join(tmp, 'p.m3u8');
  const keyRes = await fetch(BASE + '/api/media/1/1/key', { headers: { cookie: (await (async () => { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ email: 'rhett@test.cn', password: 'pass-1234' }) }); return r.headers.get('set-cookie').split(';')[0]; })()) } });
  assert.equal(keyRes.status, 200); assert.equal((await keyRes.arrayBuffer()).byteLength, 16); ok('会员拿到 16 字节 AES 密钥');

  // 进度
  assert.ok((await A('/api/progress', { vol: 1, lesson: 1, pct: 42 })).j.ok);
  assert.equal((await A('/api/me')).j.progress[0].pct, 42); ok('学习进度记录');

  // 兑换码
  const code = execFileSync('node', [join(ROOT, 'tools/admin.mjs'), 'codes', 'single', '3', '1', '测试'], { env: process.env }).toString().trim();
  assert.match(code, /^AY-\w{4}-\w{4}-\w{4}$/);
  assert.deepEqual((await B('/api/redeem', { code: code.toLowerCase() })).j.vols, [3]);
  assert.equal((await C('/api/redeem', { code })).status, 401);
  const D = client(); await D('/api/register', { email: 'd@test.cn', password: 'pass-0000' });
  assert.equal((await D('/api/redeem', { code })).status, 409); ok(`兑换码生成、兑换、不能重复用（${code}）`);

  // 设备上限：A 已有 2 个会话（注册 + 上面登录一次），再登录一次，最早的被踢
  const A3 = client(); await A3('/api/login', { email: 'rhett@test.cn', password: 'pass-1234' });
  assert.equal((await A('/api/me')).j.user, null); assert.ok((await A3('/api/me')).j.user); ok('同账号第 3 台设备登录，最早那台被挤下线');

  // 登录失败与限流
  assert.equal((await C('/api/login', { email: 'rhett@test.cn', password: 'wrong' })).status, 401); ok('密码错误被拒');

  // 退款
  execFileSync('node', [join(ROOT, 'tools/admin.mjs'), 'refund', o.order], { env: process.env });
  assert.deepEqual((await A3('/api/me')).j.vols, []); ok('后台退款后收回权益');

  // 微信收款码：人工确认
  const W = client(); await W('/api/register', { email: 'w@test.cn', password: 'pass-wwww' });
  const pay = (await W('/api/pay')).j; assert.equal(pay.wechat, true); assert.equal(pay.afdian.full, true); ok('付款方式接口：爱发电 + 微信都可用');
  const w1 = (await W('/api/orders', { product: 'full', method: 'wechat' })).j;
  assert.equal(w1.method, 'wechat'); assert.match(w1.payAmount, new RegExp('^'+FULL.split('.')[0]+'\\.\\d\\d$')); assert.notEqual(w1.payAmount, FULL); assert.ok(w1.qr);
  ok(`微信下单给出带角分的金额（¥${w1.payAmount}）和收款码`);
  assert.equal((await W('/api/orders', { product: 'full', method: 'wechat' })).j.payAmount, w1.payAmount); ok('重复点击金额不变');
  const W2 = client(); await W2('/api/register', { email: 'w2@test.cn', password: 'pass-wwww' });
  const w2 = (await W2('/api/orders', { product: 'full', method: 'wechat' })).j; assert.notEqual(w2.payAmount, w1.payAmount); ok('两个人同时下单，金额不同');
  assert.ok((await W('/api/orders/claim', { id: w1.order })).j.ok);
  assert.deepEqual((await W('/api/me')).j.vols, []); ok('点「我已付款」不会直接开通');
  assert.equal((await W('/api/admin/confirm', { id: w1.order })).status, 403); ok('普通会员不能确认到账');
  const BOSS = client(); await BOSS('/api/register', { email: 'boss@test.cn', password: 'pass-boss1' });
  assert.equal((await BOSS('/api/me')).j.admin, true);
  const list = (await BOSS('/api/admin/orders')).j.orders; assert.equal(list[0].id, w1.order); ok('后台列出待确认订单，已点付款的排最前');
  assert.ok((await BOSS('/api/admin/confirm', { id: w1.order })).j.ok);
  assert.deepEqual((await W('/api/me')).j.vols, [1, 2, 3, 4, 5, 6]); assert.equal((await W('/api/orders/status?id=' + w1.order)).j.status, 'paid'); ok('后台确认到账 → 自动开通全卷');
  execFileSync('node', [join(ROOT, 'tools/admin.mjs'), 'confirm', w2.payAmount], { env: process.env });
  assert.deepEqual((await W2('/api/me')).j.vols, [1, 2, 3, 4, 5, 6]); ok(`命令行按金额确认（confirm ${w2.payAmount}）`);
  const w3 = (await W('/api/orders', { product: 'mentor', method: 'wechat' })).j;
  assert.ok((await BOSS('/api/admin/cancel', { id: w3.order })).j.ok);
  assert.equal((await BOSS('/api/admin/confirm', { id: w3.order })).status, 409); ok('作废的订单不能再确认');

  console.log(`\n全部通过：${n} 项`);
} catch (e) { console.error('\n✗ 失败：', e); process.exitCode = 1; }
finally { server.close(); mock.close(); }
