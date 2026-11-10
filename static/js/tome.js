// 暗岩秘典 · 交互：导航、滚动显现、视频封面、余烬粒子
(() => {
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = document.querySelector('.burger');
  burger && burger.addEventListener('click', () => nav.classList.toggle('open'));

  // 滚动显现
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .12 }) : null;
  document.querySelectorAll('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));

  // 视频封面：点击后开播
  document.querySelectorAll('.player').forEach(p => {
    const cover = p.querySelector('.cover'), v = p.querySelector('video');
    if (!cover || !v) return;
    cover.addEventListener('click', () => { cover.remove(); v.controls = true; v.play(); });
  });
  document.querySelectorAll('[data-play]').forEach(li => li.addEventListener('click', () => {
    const p = document.querySelector('.player'); if (!p) return;
    p.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const c = p.querySelector('.cover'); c ? c.click() : p.querySelector('video').play();
  }));

  // 余烬粒子
  const cv = document.getElementById('embers');
  if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = cv.getContext('2d'); let W, H, ps = [];
  const size = () => { W = cv.width = cv.offsetWidth * devicePixelRatio; H = cv.height = cv.offsetHeight * devicePixelRatio; };
  size(); addEventListener('resize', size);
  const spawn = (y) => ({ x: Math.random() * W, y: y ?? H + 10, r: (Math.random() * 1.6 + .4) * devicePixelRatio,
    vy: -(Math.random() * .5 + .15) * devicePixelRatio, vx: (Math.random() - .5) * .25 * devicePixelRatio,
    a: Math.random() * .6 + .2, g: Math.random() < .28, t: Math.random() * 6.28 });
  for (let i = 0; i < 70; i++) ps.push(spawn(Math.random() * H));
  const tick = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.t += .02; p.x += p.vx + Math.sin(p.t) * .2; p.y += p.vy;
      if (p.y < -10) Object.assign(p, spawn());
      const fl = p.a * (.7 + .3 * Math.sin(p.t * 3));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
      ctx.fillStyle = p.g ? `rgba(159,240,196,${fl})` : `rgba(240,196,110,${fl})`;
      ctx.shadowBlur = 8 * devicePixelRatio; ctx.shadowColor = p.g ? '#6fe8ad' : '#e6a64a'; ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  tick();
})();
