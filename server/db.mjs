// 数据库：Node 自带的 node:sqlite（Node ≥ 22.5），不需要装任何包
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cfg } from './config.mjs';

mkdirSync(dirname(cfg.dbPath), { recursive: true });
export const db = new DatabaseSync(cfg.dbPath);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL,
  created INTEGER NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL, seen INTEGER NOT NULL, ua TEXT);
CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  product TEXT NOT NULL, vol INTEGER, amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending / paid / refunded / cancelled
  trade_no TEXT UNIQUE, paid_amount TEXT, created INTEGER NOT NULL, paid INTEGER);
CREATE TABLE IF NOT EXISTS entitlements(
  user_id INTEGER NOT NULL REFERENCES users(id), vol INTEGER NOT NULL,
  source TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(user_id, vol));
CREATE TABLE IF NOT EXISTS codes(
  code TEXT PRIMARY KEY, product TEXT NOT NULL, vol INTEGER, note TEXT,
  created INTEGER NOT NULL, used_by INTEGER REFERENCES users(id), used_at INTEGER);
CREATE TABLE IF NOT EXISTS progress(
  user_id INTEGER NOT NULL REFERENCES users(id), vol INTEGER NOT NULL, lesson INTEGER NOT NULL,
  pct INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, PRIMARY KEY(user_id, vol, lesson));
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, ref TEXT, body TEXT, created INTEGER NOT NULL);
`);

// v2.1：微信收款码（人工确认）。老库自动补列
for (const col of ["method TEXT NOT NULL DEFAULT 'afdian'", 'pay_amount TEXT', 'claimed INTEGER']) {
  try { db.exec(`ALTER TABLE orders ADD COLUMN ${col}`); } catch {}
}

export const now = () => Math.floor(Date.now() / 1000);
export const log = (kind, ref, body) =>
  db.prepare('INSERT INTO events(kind,ref,body,created) VALUES(?,?,?,?)').run(kind, ref ?? null, body ? JSON.stringify(body) : null, now());

// 产品 → 解锁哪些卷。卷〇 免费，不进权益表
export const MEMBER_VOLS = [1, 2, 3, 4, 5];
export function grant(userId, product, vol, source) {
  const vols = product === 'single' ? [vol] : MEMBER_VOLS;
  const st = db.prepare('INSERT OR IGNORE INTO entitlements(user_id,vol,source,created) VALUES(?,?,?,?)');
  for (const v of vols) st.run(userId, v, source, now());
  if (product === 'mentor') log('mentor_booking_needed', String(userId), { source });
  return vols;
}
export function revokeBySource(source) {
  return db.prepare('DELETE FROM entitlements WHERE source = ?').run(source).changes;
}
export const entitled = (userId, vol) => vol === 0 ||
  !!db.prepare('SELECT 1 FROM entitlements WHERE user_id=? AND vol=?').get(userId, vol);

// 人工确认到账（微信收款码）。返回 'ok' 或原因
export function confirmManual(orderId, by) {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
  if (!o) return 'order_not_found';
  if (o.status === 'paid') return 'dup';
  if (o.status !== 'pending') return 'order_' + o.status;
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE orders SET status='paid', trade_no=?, paid_amount=?, paid=? WHERE id=? AND status='pending'")
      .run('WX-' + o.id, o.pay_amount || o.amount, now(), o.id);
    grant(o.user_id, o.product, o.vol, 'order:' + o.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  log('order_paid', o.id, { method: o.method, amount: o.pay_amount || o.amount, by });
  return 'ok';
}
export function cancelOrder(orderId, by) {
  const r = db.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND status='pending'").run(orderId);
  if (r.changes) log('order_cancelled', orderId, { by });
  return r.changes ? 'ok' : 'not_pending';
}
