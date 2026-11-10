/* 暗岩秘典 · 静态解锁（不需要服务器）
 * 买家输入解锁码 → 存在本机 → 用码推出卷钥，现场解密 locked/<卷>/<节>.json 的正文与视频密钥。 */
(() => {
  const T = window.TomeCode; if (!T) return;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const R = document.querySelector('meta[name=tome-root]')?.content || './';
  const CN = '〇一二三四五六七八九';
  const KEY = 'tome_codes';
  const codes = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const revoked = fetch(R + 'locked/revoked.json').then(r => r.ok ? r.json() : []).catch(() => []);
  async function keys() {
    const bad = new Set(await revoked), out = {};
    for (const c of codes()) { const p = T.parse(c); if (p.error || bad.has(p.id)) continue; for (const [v, s] of Object.entries(p.seeds)) out[v] ||= s; }
    return out;
  }
  async function addCode(code) {
    const p = T.parse(code); if (p.error) return p;
    if ((await revoked).includes(p.id)) return { error: '这个解锁码已停用。如果是你本人购买的，请联系作者。' };
    const list = codes().filter(c => T.parse(c).id !== p.id); list.push(code.trim().toUpperCase()); localStorage.setItem(KEY, JSON.stringify(list));
    return p;
  }
  const toast = m => { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); } t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3000); };
  const vols = p => p.type === 15 || p.type === 31 ? '全部会员卷（含以后开放的卷）' : '卷' + CN[p.type];

  /* 解锁表单（卷页侧栏、入会页 #unlock） */
  $$('form.unlock').forEach(f => f.addEventListener('submit', async e => {
    e.preventDefault(); const r = await addCode(f.code.value);
    if (r.error) return toast(r.error);
    toast(`已解锁：${vols(r)}`); f.reset();
    setTimeout(() => { const v = $('.syll[data-vol]'); v ? location.reload() : location.href = R + 'juan/'; }, 900);
  }));
  const mine = $('#mycodes');
  if (mine) keys().then(k => { const vs = Object.keys(k).filter(v => (window.TOME_OPEN || []).includes(+v)); mine.innerHTML = codes().length ? `这台设备已解锁：${vs.length ? vs.map(v => `<a href="${R}juan/${v}/">卷${CN[v]}</a>`).join('、') : '（已开放的卷里暂无）'}` : ''; });

  /* 卷页：章节阅读 */
  const syll = $('.syll[data-vol]'), reader = $('#reader');
  if (!syll || !reader) return;
  const v = +syll.dataset.vol, free = syll.dataset.free === '1', avail = JSON.parse(syll.dataset.avail || '{}');
  let seed = null;
  async function decrypt(n) {
    const j = await fetch(`${R}locked/${v}/${n}.json`).then(r => r.json());
    if (j.html != null) return j.html;
    const key = await crypto.subtle.importKey('raw', T.aesKey(seed), 'AES-GCM', false, ['decrypt']);
    const b = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(j.iv) }, key, b(j.ct)));
  }
  function playVideo(box, n) {
    const src = `${R}locked/${v}/${n}/index.m3u8`;
    box.innerHTML = '<video controls playsinline controlslist="nodownload" oncontextmenu="return false"></video>';
    const video = $('video', box);
    if (!window.Hls || !Hls.isSupported()) { box.innerHTML = '<p class="dim">这个浏览器播放不了加密视频，请换用新版 Chrome、Edge 或 Safari。</p>'; return; }
    const Base = Hls.DefaultConfig.loader, k = free ? null : T.hlsKey(seed, String(n));
    class KeyLoader extends Base {
      load(ctx, cfg, cb) {
        if (!ctx.url.startsWith('tomekey:')) return super.load(ctx, cfg, cb);
        const now = performance.now(), st = { aborted: false, loaded: 16, total: 16, retry: 0, chunkCount: 0, bwEstimate: 0, loading: { start: now, first: now, end: now }, parsing: { start: now, end: now }, buffering: { start: 0, first: 0, end: 0 } };
        this.stats = st; setTimeout(() => cb.onSuccess({ url: ctx.url, data: k.slice().buffer }, st, ctx, null), 0);
      }
    }
    const h = new Hls({ loader: KeyLoader }); h.loadSource(src); h.attachMedia(video);
  }
  async function open(li) {
    const n = +li.dataset.l;
    $$('li.on', syll).forEach(x => x.classList.remove('on')); li.classList.add('on');
    reader.hidden = false; reader.innerHTML = '<p class="dim">正在展开……</p>';
    try {
      const html = await decrypt(n);
      reader.innerHTML = `<div class="rhead"><span>卷${CN[v]} · 第${'壹贰叁肆伍陆柒捌玖拾'[n - 1] || n}节</span><b>${$('b', li).textContent}</b></div><article class="lesson">${html}</article>
        <div class="rnav">${$(`li[data-l="${n - 1}"].readable`, syll) ? `<a href="#" data-go="${n - 1}">← 上一节</a>` : '<span></span>'}${$(`li[data-l="${n + 1}"].readable`, syll) ? `<a href="#" data-go="${n + 1}">下一节 →</a>` : '<span></span>'}</div>`;
      const box = $('.lvid', reader); if (box && avail[n]?.video) playVideo(box, n); else if (box) box.outerHTML = '<p class="vsoon">本节视频录制中，先看讲义。</p>';
      $$('[data-go]', reader).forEach(a => a.onclick = e => { e.preventDefault(); open($(`li[data-l="${a.dataset.go}"]`, syll)); });
      history.replaceState(null, '', '#l' + n);
      reader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { reader.innerHTML = '<p class="notice">这一节打不开：解锁码和这一卷对不上，或者文件还没更新。刷新页面再试，仍不行请联系作者。</p>'; }
  }
  keys().then(k => {
    seed = k[v] || null;
    const can = free || !!seed;
    if (!free && seed) {
      const aside = $('.aside');
      if (aside) aside.innerHTML = `<h4>卷${CN[v]} · 已解锁</h4><p class="dim" style="margin-top:12px;font-size:15px">这一卷已经在这台设备上解锁。换设备时再输一次解锁码。</p>${Object.keys(avail).length ? `<a class="btn" href="#l${Object.keys(avail)[0]}" data-first>开始阅读</a>` : '<p class="dim">本卷正文正在写，开卷当天就能看。</p>'}`;
      $('[data-first]')?.addEventListener('click', e => { e.preventDefault(); open($(`li[data-l="${Object.keys(avail)[0]}"]`, syll)); });
    }
    $$('li[data-l]', syll).forEach(li => {
      const n = +li.dataset.l; if (!avail[n] || li.hasAttribute('data-play')) return;
      const s = $('s', li);
      if (can) { li.classList.add('readable', 'playable'); li.removeAttribute('data-play'); if (s && !li.dataset.video) { s.textContent = free ? '免费 · 阅读' : '已解锁 · 阅读'; s.className = 'f'; } li.addEventListener('click', () => open(li)); }
      else if (s) s.textContent = '会员 · 需解锁';
    });
    const m = location.hash.match(/^#l(\d+)$/); if (m && can && avail[m[1]]) open($(`li[data-l="${m[1]}"]`, syll));
  });
})();
