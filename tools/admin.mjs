// 后台命令行。用法：node tools/admin.mjs <命令> ...
//   codes <single|full|mentor> [卷号] [数量=1] [备注]   生成兑换码
//   grant <邮箱> <single|full|mentor> [卷号]           手动开通
//   refund <订单号>                                   标记退款并收回权限
//   orders [条数=20]  users [条数=20]  events [条数=30]
//   reset-password <邮箱>                             生成新密码并踢下线
//   disable <邮箱> / enable <邮箱>
//   pending                                           待确认的微信订单（按金额对账）
//   confirm <订单号|金额>                              确认微信到账并开通，如 confirm 199.37
//   cancel <订单号>                                   作废待付订单
//   ping                                              测试爱发电签名
//   reconcile                                         立刻对账一次
import { randomBytes, scryptSync } from 'node:crypto';
import { db, now, grant, revokeBySource, log, confirmManual, cancelOrder } from '../server/db.mjs';
import * as afd from '../server/afdian.mjs';

const [cmd, ...a] = process.argv.slice(2);
const user = em => { const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(em || '').toLowerCase()); if (!u) { console.error('没有这个用户：' + em); process.exit(1); } return u; };
const t = s => s ? new Date(s * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '';
const prod = (p, v) => { if (!['single', 'full', 'mentor'].includes(p)) throw new Error('方案只能是 single / full / mentor'); if (p === 'single' && !(+v >= 1 && +v <= 5)) throw new Error('single 要带卷号 1–5'); };
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => 'AY-' + [0, 1, 2].map(() => Array.from(randomBytes(4), b => ALPH[b % ALPH.length]).join('')).join('-');

switch (cmd) {
  case 'codes': {
    const [p, v, n = 1, note = ''] = a[0] === 'single' ? a : [a[0], null, a[1] || 1, a[2] || ''];
    prod(p, v);
    const st = db.prepare('INSERT INTO codes(code,product,vol,note,created) VALUES(?,?,?,?,?)');
    for (let i = 0; i < +n; i++) { const c = code(); st.run(c, p, p === 'single' ? +v : null, note, now()); console.log(c); }
    break;
  }
  case 'grant': { const u = user(a[0]); prod(a[1], a[2]); console.log('已开通卷', grant(u.id, a[1], a[2] ? +a[2] : null, 'admin:' + now()).join(',')); break; }
  case 'refund': {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(a[0]); if (!o) { console.error('没有这个订单'); process.exit(1); }
    db.prepare("UPDATE orders SET status='refunded' WHERE id=?").run(o.id);
    console.log('已标记退款，收回权益条数：', revokeBySource('order:' + o.id), '（爱发电那边的退款要在爱发电后台操作）');
    log('refund', o.id); break;
  }
  case 'orders': console.table(db.prepare('SELECT o.id, u.email, o.product, o.vol, o.amount, o.status, o.trade_no, o.created, o.paid FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created DESC LIMIT ?').all(+(a[0] || 20)).map(r => ({ ...r, created: t(r.created), paid: t(r.paid) }))); break;
  case 'users': console.table(db.prepare("SELECT u.id, u.email, u.created, u.disabled, (SELECT group_concat(vol) FROM entitlements e WHERE e.user_id=u.id) vols FROM users u ORDER BY u.id DESC LIMIT ?").all(+(a[0] || 20)).map(r => ({ ...r, created: t(r.created) }))); break;
  case 'events': console.table(db.prepare('SELECT id, kind, ref, substr(body,1,80) body, created FROM events ORDER BY id DESC LIMIT ?').all(+(a[0] || 30)).map(r => ({ ...r, created: t(r.created) }))); break;
  case 'reset-password': {
    const u = user(a[0]); const pw = randomBytes(6).toString('base64url'); const salt = randomBytes(16);
    db.prepare('UPDATE users SET pass=? WHERE id=?').run(`s1$${salt.toString('base64')}$${scryptSync(pw, salt, 64).toString('base64')}`, u.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); console.log('新密码：', pw); break;
  }
  case 'disable': case 'enable': { const u = user(a[0]); db.prepare('UPDATE users SET disabled=? WHERE id=?').run(cmd === 'disable' ? 1 : 0, u.id); if (cmd === 'disable') db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); console.log('ok'); break; }
  case 'pending': console.table(db.prepare("SELECT o.id, u.email, o.product, o.vol, o.pay_amount, o.claimed, o.created FROM orders o JOIN users u ON u.id=o.user_id WHERE o.status='pending' AND o.method='wechat' ORDER BY o.created DESC LIMIT 50").all().map(r => ({ ...r, claimed: r.claimed ? '已点付款 ' + t(r.claimed) : '', created: t(r.created) }))); break;
  case 'confirm': {
    let id = a[0] || '';
    if (/^\d+(\.\d{1,2})?$/.test(id)) {
      const rows = db.prepare("SELECT id FROM orders WHERE status='pending' AND method='wechat' AND pay_amount=?").all((+id).toFixed(2));
      if (rows.length !== 1) { console.error(rows.length ? '这个金额对上了多张单，请用订单号' : '没有这个金额的待确认订单'); process.exit(1); }
      id = rows[0].id;
    }
    const r = confirmManual(id, 'cli'); console.log(r === 'ok' ? '已确认并开通：' + id : r); if (r !== 'ok' && r !== 'dup') process.exit(1); break;
  }
  case 'cancel': console.log(cancelOrder(a[0], 'cli')); break;
  case 'ping': console.log(await afd.ping()); break;
  case 'reconcile': console.log(await afd.reconcile()); break;
  default: console.log(readHelp());
}
function readHelp() { return '用法见 tools/admin.mjs 文件开头'; }
