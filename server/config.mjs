// 配置：读 server/.env（不进 Git），再读环境变量。样例见 server/.env.example
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
const envFile = process.env.TOME_ENV || join(HERE, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const e = (k, d = '') => process.env[k] ?? d;

export const cfg = {
  port: +e('PORT', 8787),
  host: e('HOST', '127.0.0.1'),            // 前面挂 Nginx/Caddy 时保持 127.0.0.1
  baseUrl: e('BASE_URL', 'http://localhost:8787'),
  secret: e('SECRET'),                      // 至少 32 位随机串，用于签名播放地址
  cookieSecure: e('COOKIE_SECURE', 'auto'), // auto：BASE_URL 是 https 时加 Secure
  dbPath: e('DB_PATH', join(ROOT, 'data/tome.db')),
  staticDir: e('STATIC_DIR', join(ROOT, 'docs')),
  mediaDir: e('MEDIA_DIR', join(ROOT, 'media')),
  maxDevices: +e('MAX_DEVICES', 2),
  sessionDays: +e('SESSION_DAYS', 30),
  afdian: {
    api: e('AFDIAN_API', 'https://afdian.com/api/open'),
    orderUrl: e('AFDIAN_ORDER_URL', 'https://afdian.com/order/create'),
    userId: e('AFDIAN_USER_ID'),
    productType: e('AFDIAN_PRODUCT_TYPE', '0'), // 0 = 常规方案（官方示例写法）；如用「售卖」商品，按爱发电后台给的链接改
    token: e('AFDIAN_TOKEN'),
    // 在爱发电后台建好三个「售卖方案」后，把 plan_id 填进来
    plans: { single: e('AFDIAN_PLAN_SINGLE'), full: e('AFDIAN_PLAN_FULL'), mentor: e('AFDIAN_PLAN_MENTOR') },
  },
  // 微信收款码：个人码没有到账通知，需要作者在 /admin/ 或命令行确认到账
  wechat: { enabled: e('WECHAT_PAY', '1') === '1', qr: e('WECHAT_QR', '/img/wechat-pay.webp'), name: e('WECHAT_NAME', '王磊-锐特 Rhett·AI 工坊') },
  // 能进 /admin/ 的账号（逗号分隔的邮箱），要先在站上注册
  adminEmails: e('ADMIN_EMAILS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  // 价格以服务器为准，不信前端。早鸟结束后把 PRICE_FULL 改成 299.00
  prices: { single: e('PRICE_SINGLE', '99.00'), full: e('PRICE_FULL', '199.00'), mentor: e('PRICE_MENTOR', '299.00') },
};

if (!cfg.secret || cfg.secret.length < 32) {
  if (process.env.NODE_ENV === 'production') throw new Error('SECRET 未设置或太短（至少 32 位）');
  cfg.secret = 'dev-only-secret-change-me-dev-only-secret';
  console.warn('[tome] 警告：SECRET 未设置，正在用开发默认值，上线前必须改');
}
cfg.secureCookie = cfg.cookieSecure === 'auto' ? cfg.baseUrl.startsWith('https') : cfg.cookieSecure === 'true';
