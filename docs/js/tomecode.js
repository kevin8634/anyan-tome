/* 暗岩秘典 · 解锁码核心（浏览器与 Node 共用，零依赖）
 * 码的结构（17 字节 → 28 位 base32，显示为 AY-XXXX-…）：
 *   [类型 1][序号 2][种子 12，已混淆][校验 2]
 *   类型：0x01–0x05 = 单卷 N；0x0F = 全卷；0x1F = 亲授（权益同全卷）
 *   全卷码的种子是总钥 M，可以推出每一卷（包括以后开的卷）的卷钥；单卷码的种子就是那一卷的卷钥。
 * 没有服务器，所以码一旦泄漏只能「拉黑」（locked/revoked.json），无法真正收回。 */
(function (g) {
  'use strict';
  /* ── SHA-256 / HMAC（纯 JS，file:// 下的发码器也能用） ── */
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const utf8 = s => typeof s === 'string' ? new TextEncoder().encode(s) : s;
  const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; };
  function sha256(msg) {
    msg = utf8(msg);
    const l = msg.length, n = ((l + 9 + 63) >> 6) << 6, b = new Uint8Array(n); b.set(msg); b[l] = 0x80;
    const dv = new DataView(b.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W = new Uint32Array(64);
    const R = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = W[i - 15], c = W[i - 2]; W[i] = (W[i - 16] + (R(a, 7) ^ R(a, 18) ^ (a >>> 3)) + W[i - 7] + (R(c, 17) ^ R(c, 19) ^ (c >>> 10))) | 0; }
      let [a, bb, c, d, e, f, gg, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (R(e, 6) ^ R(e, 11) ^ R(e, 25)) + ((e & f) ^ (~e & gg)) + K[i] + W[i]) | 0;
        const t2 = ((R(a, 2) ^ R(a, 13) ^ R(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        h = gg; gg = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += gg; H[7] += h;
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
  }
  function hmac(key, msg) {
    key = utf8(key); if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64); k.set(key);
    return sha256(cat(k.map(x => x ^ 0x5c), sha256(cat(k.map(x => x ^ 0x36), utf8(msg)))));
  }
  /* ── base32（Crockford，不区分大小写，O→0、I/L→1） ── */
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function b32(bytes) { let bits = 0, v = 0, s = ''; for (const x of bytes) { v = (v << 8) | x; bits += 8; while (bits >= 5) { s += A[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) s += A[(v << (5 - bits)) & 31]; return s; }
  function unb32(s) { const out = []; let bits = 0, v = 0; for (const ch of s) { const i = A.indexOf(ch); if (i < 0) return null; v = ((v << 5) | i) & 0xffff; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const unhex = s => new Uint8Array(s.match(/../g).map(x => parseInt(x, 16)));

  const PEPPER = 'anyan-tome/v1';
  const NAMES = { 15: '全卷秘典', 31: '秘典 · 亲授' };
  const typeName = t => NAMES[t] || ('单卷 · 卷' + '〇一二三四五六七八九'[t]);
  const pad = (t, s) => hmac(PEPPER, cat(utf8('pad'), new Uint8Array([t, s >> 8, s & 255]))).slice(0, 12);
  const check = (body, seed) => hmac(PEPPER, cat(utf8('chk'), body, seed)).slice(0, 2);

  /* 卷钥：全卷码种子（总钥 M）→ 每卷种子；派生 AES 内容钥与视频钥 */
  const volSeed = (M, v) => hmac(M, 'vol:' + v).slice(0, 12);
  const aesKey = seed => hmac(seed, 'aes').slice(0, 16);
  const hlsKey = (seed, lesson) => hmac(seed, 'hls:' + lesson).slice(0, 16);

  /* 生成：M 为 12 字节总钥；type 见上；serial 0–65535 */
  function make(M, type, serial) {
    const seed = (type === 15 || type === 31) ? M : volSeed(M, type);
    const p = pad(type, serial), body = new Uint8Array([type, serial >> 8, serial & 255, ...seed.map((x, i) => x ^ p[i])]);
    const s = b32(cat(body, check(body, seed)));
    return 'AY-' + s.match(/.{1,4}/g).join('-');
  }
  /* 解析：返回 { type, serial, id, name, seeds: {卷号: 种子} } 或 { error } */
  function parse(code, maxVol = 9) {
    const s = String(code || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/^AY/, '').replace(/[^0-9A-Z]/g, '');
    if (s.length !== 28) return { error: '解锁码长度不对，请完整复制' };
    const b = unb32(s); if (!b || b.length < 17) return { error: '解锁码里有无效字符' };
    const type = b[0], serial = (b[1] << 8) | b[2], p = pad(type, serial), seed = b.slice(3, 15).map((x, i) => x ^ p[i]);
    const c = check(b.slice(0, 15), seed); if (c[0] !== b[15] || c[1] !== b[16]) return { error: '解锁码不正确，请检查有没有抄错' };
    if (!((type >= 1 && type <= 9) || type === 15 || type === 31)) return { error: '解锁码类型未知' };
    const seeds = {};
    if (type === 15 || type === 31) for (let v = 1; v <= maxVol; v++) seeds[v] = volSeed(seed, v); else seeds[type] = seed;
    return { type, serial, id: (type.toString(16) + ':' + serial.toString(16).padStart(4, '0')).toUpperCase(), name: typeName(type), seeds };
  }
  const api = { sha256, hmac, b32, unb32, hex, unhex, make, parse, volSeed, aesKey, hlsKey, typeName };
  g.TomeCode = api;
})(typeof window !== 'undefined' ? window : globalThis);
