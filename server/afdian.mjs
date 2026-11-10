// 爱发电对接。依据官方文档 https://guide.afdian.com/creator/developer
// - Webhook 只推 status=2（交易成功）的订单，要求返回 {"ec":200}；可能重复推送，需要幂等
// - Webhook 本身不带可校验的签名，所以收到后一律用 query-order 接口回查，以接口结果为准
// - API 签名：sign = md5(token + "params" + params + "ts" + ts + "user_id" + user_id)
import { createHash } from 'node:crypto';
import { cfg } from './config.mjs';
import { db, now, log, grant } from './db.mjs';

const md5 = s => createHash('md5').update(s).digest('hex');
export const enabled = () => !!(cfg.afdian.userId && cfg.afdian.token);
// 能用来收款：签名配置好，且至少建了一个方案
export const payable = product => enabled() && !!cfg.afdian.plans[product];

export function signBody(paramsObj, ts = now()) {
  const params = JSON.stringify(paramsObj);
  const { userId: user_id, token } = cfg.afdian;
  return { user_id, params, ts, sign: md5(`${token}params${params}ts${ts}user_id${user_id}`) };
}

async function call(path, paramsObj) {
  const res = await fetch(`${cfg.afdian.api}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signBody(paramsObj)), signal: AbortSignal.timeout(10000),
  });
  const j = await res.json();
  if (j.ec !== 200) throw new Error(`afdian ${path} ec=${j.ec} ${j.em}`);
  return j.data;
}
export const ping = () => call('ping', { a: 1 });
export const queryByTradeNo = async no => (await call('query-order', { out_trade_no: no })).list?.[0] || null;
export const queryPage = page => call('query-order', { page });

// 付款链接：custom_order_id 带本站订单号；remark 也放一份，作兜底
export function payUrl(order) {
  const plan = cfg.afdian.plans[order.product];
  if (!plan) return null;
  const u = new URL(cfg.afdian.orderUrl);
  u.searchParams.set('plan_id', plan);
  u.searchParams.set('product_type', cfg.afdian.productType);
  u.searchParams.set('custom_order_id', order.id);
  u.searchParams.set('remark', `订单 ${order.id}`);
  return u.toString();
}

const amt = s => Math.round(parseFloat(s || '0') * 100);

// 用「接口回查到的订单」给本站订单开通。返回 'ok' | 'dup' | 原因
export function fulfill(remote, hintedOrderId) {
  if (!remote || +remote.status !== 2) return 'not_paid';
  const already = db.prepare('SELECT id FROM orders WHERE trade_no = ?').get(remote.out_trade_no);
  if (already) return 'dup';
  const remarkId = (remote.remark || '').match(/AY[0-9A-Z]{10,}/)?.[0];
  const oid = remote.custom_order_id || hintedOrderId || remarkId;
  if (!oid) return 'no_order_id';
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(oid);
  if (!o) return 'order_not_found';
  if (o.status === 'paid') return 'dup';
  if (o.status !== 'pending') return 'order_' + o.status;
  const plan = cfg.afdian.plans[o.product];
  if (plan && remote.plan_id && remote.plan_id !== plan) return 'plan_mismatch';
  // 付款金额要够；用了爱发电兑换码时 total_amount 为 0，此时看 show_amount
  const paid = amt(remote.total_amount), shown = amt(remote.show_amount);
  const okAmount = paid >= amt(o.amount) || (remote.redeem_id && shown >= amt(o.amount));
  if (!okAmount) return 'amount_low';
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE orders SET status='paid', trade_no=?, paid_amount=?, paid=? WHERE id=? AND status='pending'")
      .run(remote.out_trade_no, remote.total_amount, now(), o.id);
    grant(o.user_id, o.product, o.vol, 'order:' + o.id);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); if (/UNIQUE/.test(err.message)) return 'dup'; throw err; }
  log('order_paid', o.id, { trade_no: remote.out_trade_no, amount: remote.total_amount });
  return 'ok';
}

// Webhook 入口：先回查，再开通
export async function handleWebhook(body) {
  const ord = body?.data?.order;
  log('webhook', ord?.out_trade_no, body);
  if (body?.data?.type !== 'order' || !ord?.out_trade_no) return 'ignored';
  if (!enabled()) {
    // 只有本地开发、并显式打开时，才直接信任回调内容
    if (process.env.AFDIAN_INSECURE_DEV === '1' && process.env.NODE_ENV !== 'production') return fulfill(ord, ord.custom_order_id);
    return 'afdian_not_configured';
  }
  const remote = await queryByTradeNo(ord.out_trade_no);
  if (!remote) return 'trade_not_found';
  return fulfill(remote, ord.custom_order_id);
}

// 对账：防止回调丢失。拉最近两页订单，补开通
export async function reconcile() {
  if (!enabled()) return { skipped: true };
  const pending = db.prepare("SELECT count(*) n FROM orders WHERE status='pending' AND method='afdian' AND created > ?").get(now() - 3 * 86400).n;
  if (!pending) return { pending: 0 };
  const out = {};
  for (const page of [1, 2]) {
    const d = await queryPage(page);
    for (const r of d.list || []) { const k = fulfill(r); out[k] = (out[k] || 0) + 1; }
    if (page >= (d.total_page || 1)) break;
  }
  return out;
}
