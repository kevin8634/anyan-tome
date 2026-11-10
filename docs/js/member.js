// 暗岩秘典 · 会员功能（需要后端 server/；放在纯静态托管上会自动退化为展示站）
(() => {
  const R = document.querySelector('meta[name="tome-root"]')?.content || './';
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NUM = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
  const CN = ['〇', '一', '二', '三', '四', '五'];
  const T = window.TOME || {};

  async function api(path, body) {
    const r = await fetch('/api/' + path, body === undefined ? { credentials: 'same-origin' } : {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw Object.assign(new Error('no-backend'), { offline: true });
    const j = await r.json(); j.status = r.status; return j;
  }
  function toast(msg, ms = 3200) {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const go = p => { location.href = R + p; };
  const next = () => new URLSearchParams(location.search).get('next');

  let ME = null, ONLINE = false;
  const ready = api('me').then(j => { ONLINE = true; ME = j.user ? j : null; return ME; }).catch(() => null);

  /* 导航：登录后显示「我的秘典」 */
  ready.then(me => {
    const j = $('.nav .join'); if (!j || !ONLINE) return;
    if (me) { j.textContent = '我的秘典'; j.href = R + 'me/'; }
    else { j.textContent = '登录 · 入会'; j.href = R + 'login/'; }
  });

  /* 购买：微信扫码（作者确认到账）或爱发电（自动开通） */
  const NAMES = { single: '单卷', full: '全卷秘典', mentor: '秘典 · 亲授' };
  const label = (p, v) => NAMES[p] + (v ? ' · 卷' + CN[v] : '');
  function modal(html) {
    let m = $('.paymodal'); if (!m) { m = document.createElement('div'); m.className = 'paymodal'; document.body.append(m); }
    m.innerHTML = `<div class="paybox parch"><button class="x" type="button" aria-label="关闭">×</button>${html}</div>`;
    m.hidden = false; $('.x', m).onclick = () => { m.hidden = true; clearInterval(m._poll); };
    m.onclick = e => { if (e.target === m) { m.hidden = true; clearInterval(m._poll); } };
    return m;
  }
  const PRICE = JSON.parse(document.body.dataset.prices || '{}');
  function showWechat(j, product, vol) {
    const m = modal(`<div class="kicker">微信扫码付款</div><h3>${label(product, vol)}</h3>
      <img class="qr" src="${R}${j.qr.replace(/^\//, '')}" alt="微信收款码">
      <div class="amt">请付 <b>¥${j.payAmount}</b></div>
      <p class="dim">金额要和上面<b>一分不差</b>，作者靠这个角分认出是你的订单。付款备注可写订单号 <code>${j.order}</code>。</p>
      <button class="btn" type="button" id="paid">我已付款</button>
      <p class="hint" id="payhint">付款后点上面的按钮。作者核对到账后自动开通，一般当天内。</p>`);
    const done = () => { $('#payhint', m).textContent = '付款已到账，秘典已为你开启。'; setTimeout(() => go('me/'), 1500); };
    const poll = () => { clearInterval(m._poll); m._poll = setInterval(async () => {
      const s = await api('orders/status?id=' + encodeURIComponent(j.order)).catch(() => null);
      if (s?.status === 'paid') { clearInterval(m._poll); done(); }
    }, 8000); };
    const claimed = () => { const b = $('#paid', m); b.disabled = true; b.textContent = '已通知作者核对'; $('#payhint', m).textContent = '可以关掉这个窗口。到账确认后会自动开通，「我的秘典」里能看到状态。'; poll(); };
    if (j.claimed) claimed();
    $('#paid', m).onclick = async () => { const r = await api('orders/claim', { id: j.order }).catch(() => null); if (r?.ok) { r.status === 'paid' ? done() : claimed(); } else toast(r?.error || '网络错误'); };
  }
  // 没有后端（纯静态托管）时：直接给收款码，按基础价付款，备注邮箱，作者发兑换码
  function showStatic(product, vol) {
    modal(`<div class="kicker">微信扫码付款</div><h3>${label(product, vol)}</h3>
      <img class="qr" src="${R}img/wechat-pay.webp" alt="微信收款码">
      <div class="amt">请付 <b>¥${PRICE[product]}</b></div>
      <p class="dim">付款时在<b>备注里写你的微信号或邮箱</b>${vol ? '，并注明「卷' + CN[vol] + '」' : ''}。作者核对到账后把<b>专属解锁码</b>发给你，一般当天内。</p>
      <p class="hint">收到解锁码后，到 <a href="${R}join/#unlock">入会页</a> 输入即可。</p>`);
  }
  async function pay(product, vol, method) {
    const j = await api('orders', { product, vol, method });
    if (j.status === 401) return go('login/?next=' + encodeURIComponent(location.pathname + location.search));
    if (!j.ok) return toast(j.error || '下单失败');
    if (j.method === 'wechat') return showWechat(j, product, vol);
    localStorage.setItem('tome_pending', j.order); toast('正在前往爱发电付款页……'); setTimeout(() => location.href = j.payUrl, 400);
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-buy]'); if (!b) return;
    e.preventDefault();
    const product = b.dataset.buy, vol = b.dataset.vol ? +b.dataset.vol : undefined;
    let pm;
    try { pm = await api('pay'); } catch { return showStatic(product, vol); }
    await ready;
    const canA = pm.afdian?.[product], canW = pm.wechat;
    if (!ME) return go('login/?next=' + encodeURIComponent(location.pathname + location.search));
    if (canA && canW) {
      const m = modal(`<div class="kicker">选择付款方式</div><h3>${label(product, vol)}</h3>
        <div class="paypick"><button class="btn" data-m="wechat" type="button">微信扫码<small>作者确认后开通</small></button>
        <button class="btn ghost" data-m="afdian" type="button">爱发电<small>微信 / 支付宝 · 自动开通</small></button></div>`);
      $$('[data-m]', m).forEach(x => x.onclick = () => pay(product, vol, x.dataset.m).catch(() => toast('网络错误')));
      return;
    }
    if (!canA && !canW) return go('join/#open');
    pay(product, vol, canA ? 'afdian' : 'wechat').catch(() => toast('网络错误'));
  });

  /* 卷页：有权限时章节可点开学习 */
  const syll = $('.syll[data-vol]');
  if (syll) ready.then(me => {
    const v = +syll.dataset.vol;
    const own = v === 0 || (me && me.vols.includes(v));
    if (!own || !ONLINE) return;
    $$('li[data-l]', syll).forEach(li => {
      li.classList.add('playable'); li.removeAttribute('data-play');
      li.addEventListener('click', () => go(`learn/?v=${v}&l=${li.dataset.l}`), { once: false });
      const s = $('s', li); if (s && v !== 0) { s.textContent = '已解锁'; s.className = 'f'; }
    });
    const aside = $('.aside'); if (aside && v !== 0) aside.innerHTML = `<h4>卷${CN[v]} · 已解锁</h4><p class="dim" style="margin-top:12px">这一卷已经在你的秘典里。</p><a class="btn" href="${R}learn/?v=${v}&l=1">开始学习</a>`;
  });

  /* 登录 / 注册页 */
  const auth = $('#auth');
  if (auth) {
    ready.then(me => { if (me) go(next() ? next().replace(/^\//, '') : 'me/'); });
    $$('.tabs button', auth).forEach(btn => btn.addEventListener('click', () => {
      $$('.tabs button', auth).forEach(x => x.classList.toggle('on', x === btn));
      auth.dataset.mode = btn.dataset.mode; $('button[type=submit]', auth).textContent = btn.dataset.mode === 'login' ? '登录' : '注册并登录';
      $('.pw2', auth).hidden = btn.dataset.mode === 'login';
    }));
    auth.addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(auth), mode = auth.dataset.mode || 'login';
      if (mode === 'register' && f.get('password') !== f.get('password2')) return toast('两次密码不一样');
      try {
        const j = await api(mode, { email: f.get('email'), password: f.get('password') });
        if (!j.ok) return toast(j.error);
        const n = next(); location.href = n && n.startsWith('/') ? n : R + 'me/';
      } catch { toast('会员系统还没上线，先看看免费的卷〇吧'); }
    });
  }

  /* 我的秘典 */
  const me = $('#me');
  if (me) ready.then(async j => {
    if (!ONLINE) { me.innerHTML = '<p class="notice">会员系统还没上线，先看看免费的卷〇吧。</p>'; return; }
    if (!j) return go('login/?next=' + encodeURIComponent(location.pathname));
    $('#me-email').textContent = j.user.email;
    $('#me-dev').textContent = `已登录设备 ${j.devices} / ${j.maxDevices}`;
    const prog = {}; j.progress.forEach(p => { (prog[p.vol] ||= []).push(p); });
    $('#me-vols').innerHTML = T.volumes.map(v => {
      const own = v.no === 0 || j.vols.includes(v.no);
      const done = (prog[v.no] || []).filter(p => p.pct >= 90).length, total = v.lessons.filter(l => !l.more).length;
      return `<a class="mvol ${own ? 'own' : ''}" href="${own ? `${R}learn/?v=${v.no}&l=1` : `${R}juan/${v.no}/`}">
        <img class="img" src="${R}img/${v.img}.jpg" alt="">
        <div class="in"><div class="num">卷 ${CN[v.no]}</div><h4>${esc(v.title)}</h4>
        <div class="bar"><i style="width:${own ? Math.round(done / total * 100) : 0}%"></i></div>
        <small>${own ? `已学 ${done} / ${total} 节` : v.status === 'open' ? '未解锁' : '筹备中 · 未解锁'}</small></div></a>`;
    }).join('');
    const ST = { pending: '待付款', paid: '已开通', refunded: '已退款' };
    $('#me-orders').innerHTML = j.orders.length ? j.orders.map(o => `<li><b>${label(o.product, o.vol)}</b><span>¥${o.pay_amount || o.amount}</span><s class="${o.status}">${o.status === 'pending' && o.claimed ? '待作者确认' : (ST[o.status] || o.status)}</s><em>${o.method === 'wechat' ? '微信 · ' : ''}${o.id}</em></li>`).join('') : '<li class="dim">还没有订单</li>';
    if (j.admin) $('.mehead > div').insertAdjacentHTML('beforeend', `<a class="dim" href="${R}admin/">→ 后台：确认微信到账</a>`);
    // 刚付完款回来：轮询到账
    const pend = localStorage.getItem('tome_pending');
    if (pend) {
      const box = $('#me-pending'); box.hidden = false;
      for (let i = 0; i < 30; i++) {
        const s = await api('orders/status?id=' + encodeURIComponent(pend)).catch(() => null);
        if (s?.status === 'paid') { localStorage.removeItem('tome_pending'); box.textContent = '付款已到账，秘典已为你开启。'; setTimeout(() => location.reload(), 1500); return; }
        if (!s?.ok || s.status !== 'pending') { localStorage.removeItem('tome_pending'); box.hidden = true; break; }
        await new Promise(r => setTimeout(r, 4000));
      }
      box.innerHTML = '还没收到付款结果。付过款的话稍等几分钟刷新；仍未开通请联系作者，附上订单号。';
    }
  });
  $('#redeem')?.addEventListener('submit', async e => {
    e.preventDefault(); const code = new FormData(e.target).get('code');
    const j = await api('redeem', { code }).catch(() => ({ error: '会员系统还没上线' }));
    if (j.ok) { toast('兑换成功'); setTimeout(() => location.reload(), 900); } else toast(j.error);
  });
  $('#logout')?.addEventListener('click', async () => { await api('logout', {}).catch(() => {}); go(''); });
  $('#pwform')?.addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.target);
    const j = await api('password', { old: f.get('old'), password: f.get('password') }).catch(() => ({ error: '网络错误' }));
    toast(j.ok ? '密码已修改，其他设备已退出' : j.error); if (j.ok) e.target.reset();
  });

  /* 后台：确认微信到账 */
  const adm = $('#admin');
  if (adm) ready.then(async j => {
    if (!ONLINE) { adm.innerHTML = '<p class="notice">后台需要会员服务器。</p>'; return; }
    if (!j) return go('login/?next=' + encodeURIComponent(location.pathname));
    if (!j.admin) { adm.innerHTML = '<p class="notice">这个账号没有后台权限（在 server/.env 的 ADMIN_EMAILS 里加上你的邮箱）。</p>'; return; }
    const t = s => s ? new Date(s * 1000).toLocaleString('zh-CN', { hour12: false }) : '';
    async function load() {
      const r = await api('admin/orders').catch(() => null); if (!r?.ok) return;
      $('#adm-list').innerHTML = r.orders.length ? r.orders.map(o => `<tr class="${o.claimed ? 'hot' : ''}">
        <td><b>¥${o.pay_amount || o.amount}</b></td><td>${label(o.product, o.vol)}</td><td>${esc(o.email)}</td>
        <td>${o.method === 'wechat' ? '微信' : '爱发电'}</td><td>${o.claimed ? '已点付款 ' + t(o.claimed) : '下单 ' + t(o.created)}</td>
        <td><button class="btn" data-ok="${o.id}" type="button">确认到账</button> <button class="btn ghost" data-no="${o.id}" type="button">作废</button></td></tr>`).join('')
        : '<tr><td colspan="6" class="dim">没有待确认的订单</td></tr>';
    }
    adm.addEventListener('click', async e => {
      const ok = e.target.closest('[data-ok]'), no = e.target.closest('[data-no]'); if (!ok && !no) return;
      const id = (ok || no).dataset.ok || (ok || no).dataset.no;
      if (!confirm(ok ? '确认这笔已经到账？会立刻开通。' : '作废这个订单？')) return;
      const r = await api(ok ? 'admin/confirm' : 'admin/cancel', { id }).catch(() => null);
      toast(r?.ok ? (ok ? '已开通' : '已作废') : (r?.result || r?.error || '失败')); load();
    });
    load(); setInterval(load, 20000);
  });

  /* 学习页 */
  const learn = $('#learn');
  if (learn) ready.then(async j => {
    const q = new URLSearchParams(location.search), v = +q.get('v') || 0, l = +q.get('l') || 1;
    const vol = T.volumes.find(x => x.no === v) || T.volumes[0];
    const lessons = vol.lessons.filter(x => !x.more), les = lessons[l - 1] || lessons[0];
    document.title = `卷${CN[vol.no]} 第${NUM[l - 1]}节 ${les.t} · ${T.name}`;
    $('#l-vol').textContent = `卷 ${CN[vol.no]} · ${vol.title}`; $('#l-vol').href = `${R}juan/${vol.no}/`;
    $('#l-title').textContent = `第${NUM[l - 1]}节　${les.t}`;
    $('#l-list').innerHTML = lessons.map((x, i) => `<li class="${i + 1 === l ? 'on' : ''}"><a href="?v=${vol.no}&l=${i + 1}"><em>${NUM[i]}</em>${esc(x.t)}<s data-p="${i + 1}"></s></a></li>`).join('');
    const prev = l > 1 ? `?v=${vol.no}&l=${l - 1}` : '', nxt = l < lessons.length ? `?v=${vol.no}&l=${l + 1}` : '';
    $('#l-nav').innerHTML = `${prev ? `<a href="${prev}">← 上一节</a>` : '<span></span>'}${nxt ? `<a href="${nxt}">下一节 →</a>` : `<a href="${R}juan/">回秘典目录</a>`}`;
    const stage = $('#l-stage'), video = $('video', stage);
    const own = vol.no === 0 || (j && j.vols.includes(vol.no));
    if (j) (j.progress || []).filter(p => p.vol === vol.no).forEach(p => { const s = $(`s[data-p="${p.lesson}"]`); if (s) s.textContent = p.pct >= 90 ? '✓' : p.pct + '%'; });
    if (!own) {
      stage.classList.add('locked');
      stage.insertAdjacentHTML('beforeend', `<div class="gate"><h3>这一节属于卷${CN[vol.no]}</h3><p>${j ? '入会或单买这一卷后即可观看。' : '请先登录；已经是会员的，登录后就能看。'}</p>
        ${j ? `<a class="btn" href="${R}juan/${vol.no}/">解锁卷${CN[vol.no]}</a>` : `<a class="btn" href="${R}login/?next=${encodeURIComponent(location.pathname + location.search)}">登录</a>`}</div>`);
      return;
    }
    // 动态水印：会员编号 + 邮箱前缀，位置每 20 秒随机漂移
    if (j) {
      const wm = document.createElement('div'); wm.className = 'wm';
      wm.textContent = `${T.name} · No.${String(j.user.id).padStart(5, '0')} · ${j.user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')}`;
      stage.append(wm);
      const move = () => { wm.style.left = (5 + Math.random() * 55) + '%'; wm.style.top = (6 + Math.random() * 78) + '%'; };
      move(); setInterval(move, 20000);
    }
    const src = `/api/media/${vol.no}/${l}/playlist.m3u8`;
    const head = ONLINE ? await fetch(src, { credentials: 'same-origin' }).then(r => r.status).catch(() => 0) : 0;
    if (head !== 200) {
      if (les.video) { video.src = `${R}video/${les.video}.mp4`; }
      else { stage.classList.add('locked'); stage.insertAdjacentHTML('beforeend', '<div class="gate"><h3>这一节还在录制</h3><p>录好后会第一时间上线，会员届时直接可看。</p></div>'); return; }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = src;
    else if (window.Hls && Hls.isSupported()) { const h = new Hls({ xhrSetup: x => { x.withCredentials = true; } }); h.loadSource(src); h.attachMedia(video); }
    else { toast('这个浏览器不支持播放，请换用 Chrome、Edge 或 Safari'); }
    // 进度
    if (j) {
      let last = 0;
      video.addEventListener('timeupdate', () => {
        if (!video.duration || Date.now() - last < 15000) return; last = Date.now();
        api('progress', { vol: vol.no, lesson: l, pct: video.currentTime / video.duration * 100 }).catch(() => {});
      });
      video.addEventListener('ended', () => api('progress', { vol: vol.no, lesson: l, pct: 100 }).catch(() => {}));
    }
  });
})();
