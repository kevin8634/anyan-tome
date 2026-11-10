// 暗岩秘典 · 静态站生成器（零依赖）。用法：node src/build.mjs  → 输出到 docs/
import { mkdirSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, stats, pricing, volumes, services, faq, prices, ladder } from './data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'static'), OUT, { recursive: true });
writeFileSync(join(OUT, '.nojekyll'), '');
writeFileSync(join(OUT, 'prices.json'), JSON.stringify({ single: prices.single.toFixed(2), full: prices.full.toFixed(2), mentor: prices.mentor.toFixed(2) }));

const NUM = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const corners = '<i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i>';
// 购买按钮：有后端时由 member.js 下单跳转；纯静态托管时退回 site.pay 里的链接或入会页
const payBtn = (id, label, r, cls = 'btn', vol) =>
  `<a class="${cls}" href="${r}join/#open" data-buy="${id}"${vol ? ` data-vol="${vol}"` : ''}${site.pay[id] ? ` data-fallback="${esc(site.pay[id])}"` : ''}>${label}</a>`;
const realLessons = v => v.lessons.filter(l => !l.more).length + (v.lessons.find(l => l.more) ? 10 : 0);

function page({ path, title, desc, active, body, r, data = false, noindex = false }) {
  const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${r}img/hero-bell.jpg"><meta name="theme-color" content="#07090a">
<link rel="icon" href="${r}img/favicon.svg" type="image/svg+xml">
<link rel="preload" href="${r}fonts/tome.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${r}css/tome.css">
<meta name="tome-root" content="${r}">${noindex ? '\n<meta name="robots" content="noindex">' : ''}
${data ? `<script>window.TOME=${JSON.stringify({ name: site.name, volumes })}</script>` : ''}
</head><body data-prices='${JSON.stringify({ single: prices.single, full: prices.full, mentor: prices.mentor })}'>
<header class="nav"><div class="wrap">
 <a class="brand" href="${r}"><span class="sigil"><i></i></span><span class="gold">${site.name}</span></a>
 <ul>
  <li><a href="${r}" class="${active === 'home' ? 'on' : ''}">首页</a></li>
  <li><a href="${r}juan/0/" class="${active === 'free' ? 'on' : ''}">免费第一课</a></li>
  <li><a href="${r}juan/" class="${active === 'juan' ? 'on' : ''}">秘典目录</a></li>
  <li><a href="${r}forge/" class="${active === 'forge' ? 'on' : ''}">外包与合作</a></li>
  <li><a href="${r}join/" class="${active === 'join' ? 'on' : ''}">入会</a></li>
 </ul>
 <a class="join" href="${r}join/">开启秘典</a>
 <button class="burger" aria-label="菜单">☰</button>
</div></header>
<main>${body}</main>
<footer><div class="wrap">
 <span>${site.name} · ${site.author} · ${site.game}开发全录</span>
 <nav><a href="${r}join/#faq">退款说明</a><a href="${r}forge/#contact">联系</a>${site.icp ? `<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${esc(site.icp)}</a>` : ''}</nav>
</div></footer>
<script src="${r}js/tome.js" defer></script>
${active === 'learn' ? `<script src="${r}js/vendor/hls.light.min.js" defer></script>` : ''}
<script src="${r}js/member.js" defer></script>
</body></html>`;
  const file = join(OUT, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const head = (kicker, h2, p = '') => `<div class="head rv"><div class="kicker">${kicker}</div><h2>${h2}</h2><div class="rule"></div>${p ? `<p>${p}</p>` : ''}</div>`;

const player = (r) => `<div class="player frame">${corners}
  <video preload="none" playsinline poster="${r}img/hook60-poster.jpg"><source src="${r}video/hook60.mp4" type="video/mp4"></video>
  <div class="cover" style="background-image:url(${r}img/hook60-poster.jpg)"><div class="play"><i></i></div></div>
 </div>`;

const volCard = (v, r) => `<a class="vol rv" href="${r}juan/${v.slug}/">
  <div class="img" style="background-image:url(${r}img/${v.img}.jpg)"></div>
  <span class="lock ${v.free ? 'free' : ''}">${v.free ? '免费' : v.status === 'open' ? '会员' : '筹备中'}</span>
  <div class="in"><div class="num">卷 ${v.cn} · 第 ${v.no + 1} 期</div><h4>${v.title}</h4><p>${v.tagline}</p>
  <div class="meta">${realLessons(v)} 节${v.free ? ' · 全部免费' : ''}</div></div></a>`;

const issues = (r) => `<div class="issues rv">${volumes.map(v => `<a class="issue ${v.status}" href="${r}juan/${v.slug}/">
  <div class="dot"></div><b>第 ${v.no + 1} 期</b><span>卷${v.cn} · ${v.title.split('：')[0]}</span><i>${v.status === 'open' ? '已开放' : '筹备中'}</i></a>`).join('')}</div>`;

const tiers = (r) => `<div class="prices">${pricing.map(t => `<div class="tier rv ${t.main ? 'main' : ''}">${t.ribbon ? `<div class="ribbon">${t.ribbon}</div>` : ''}
  <h5>${t.name}</h5><div class="p">${t.price}<small>${t.unit}</small></div><div class="was">${t.was}</div>
  <ul>${t.perks.map(p => `<li>${p}</li>`).join('')}</ul>
  ${t.id === 'single' ? `<a class="btn ghost" href="${r}juan/">选择一卷</a>` : payBtn(t.id, t.main ? '开启秘典' : '预约名额', r, t.main ? 'btn' : 'btn ghost')}</div>`).join('')}</div>`;

/* ───────── 首页 ───────── */
{
  const r = './';
  const v0 = volumes[0];
  page({
    path: '', r, active: 'home', title: `${site.name} · 一个人加 AI，二十五天做出一款 3D RPG`,
    desc: `${site.game}开发全录：AI 编程、3D 生成、绑骨压缩、多窗口交接与踩坑。免费第一课，开卷即看。`,
    body: `
<section class="hero" style="padding:0"><div class="bg"></div><div class="shade"></div><canvas id="embers"></canvas>
 <div class="wrap copy">
  <div class="kicker">${site.game}开发全录</div>
  <h1>一个人，二十五天，<br>铸成一座深渊。</h1>
  <p class="lead">没有美术，没有外包。只靠 AI 和一套反复打磨的流程，做出一款打开浏览器就能玩的 3D RPG。这本秘典把每一步都拆开给你。</p>
  <div class="ctas"><a class="btn" href="#free">免费看第一课</a><a class="btn ghost" href="${r}join/">开启秘典 · ¥${prices.single} 起</a></div>
 </div>
 <div class="wrap stats">${stats.map(s => `<div><b>${s.n}</b><span>${s.t}</span></div>`).join('')}</div>
 <i class="scrollcue"></i>
</section>

<section id="free" style="padding-top:90px"><div class="wrap">
 ${head('卷〇 · 免费开放', '一句话，铸神兵')}
 <div class="free rv">
  ${player(r)}
  <div class="scroll-list parch"><div class="seal">鉴</div>
   <h3>起步篇 · 迷你全流程</h3><div class="sub">从一句话，到浏览器里会发光的 3D 武器</div>
   <ol>${v0.lessons.map((l, i) => `<li><a href="${r}juan/0/"><em>${NUM[i]}</em>${l.t}<s>${l.video ? '可播放' : '录制中'}</s></a></li>`).join('')}</ol>
   <a class="more" href="${r}juan/0/">进入卷〇 →</a>
  </div>
 </div>
</div></section>

<section style="padding-top:40px"><div class="wrap">
 ${head('分期开卷', '秘典六卷', '一卷就是一期，录好一卷开放一卷。全卷会员包含之后开放的每一期。全卷价每开一卷涨 ¥${ladder.step}，封顶 ¥${ladder.cap}。')}
 ${issues(r)}
 <div class="tomes">${volumes.map(v => volCard(v, r)).join('')}</div>
</div></section>

<section id="price" style="padding-top:70px"><div class="wrap">
 ${head('入会方式', '择一而入')}
 ${tiers(r)}
 <p class="note">购买 7 天内、学习进度不到 20%，可全额退款。</p>
</div></section>

<section style="padding-top:60px"><div class="wrap">
 <div class="author">
  <div class="shots rv"><img src="${r}img/ingame-1.jpg" alt="游戏实机画面" loading="lazy"><img src="${r}img/ingame-2.jpg" alt="游戏实机画面" loading="lazy"><img src="${r}img/ingame-3.jpg" alt="游戏实机画面" loading="lazy"></div>
  <div class="rv">
   <div class="kicker" style="margin-bottom:22px">写在秘典之前</div>
   <blockquote>我不是美术，也没有团队。<br>能做出暗岩，靠的是一套方法，不是天赋。</blockquote>
   <p>二十五天里，我每天做的事情很简单：把想要的东西说清楚，交给 AI 去做，自己验收，再把经验记下来。十万行代码、两百多个模型，都是这样一点点叠起来的。这套方法能教，所以我把它写成了这本秘典。</p>
   <div class="sig">—— ${site.author}</div>
  </div>
 </div>
</div></section>

<section style="padding-top:60px"><div class="wrap">
 ${head('承接委托', '同一座铸造台，也为你开炉')}
 <div class="forge rv"><div class="pic"></div><div class="txt"><h3>网页 3D 外包</h3>
  <p>品牌活动、游戏化营销、产品 3D 展示。用做暗岩的同一套流程，交付快，打开浏览器就能用。</p>
  <div class="svc">${services.map(s => `<div><b>${s.t}</b><span>→</span></div>`).join('')}</div>
  <p class="dim" style="font-size:15px">小单数千元起 · 完整活动一至两万起</p>
  <a class="btn" style="margin-top:18px" href="${r}forge/">看案例与报价</a></div></div>
</div></section>

<section id="faq" style="padding-top:60px"><div class="wrap">
 ${head('答疑', '入卷之前')}
 <div class="faq rv">${faq.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}</div>
</div></section>

<section class="call"><div class="wrap rv">
 <h2>深渊的门，开着一条缝。</h2><p>先看免费的卷〇，走得通，再往下读。</p>
 <div class="ctas"><a class="btn" href="${r}juan/0/">免费看第一课</a><a class="btn ghost" href="${r}join/">开启秘典</a></div>
</div></section>`,
  });
}

/* ───────── 秘典目录 ───────── */
{
  const r = '../';
  page({
    path: 'juan', r, active: 'juan', title: `秘典目录 · ${site.name}`, desc: '暗岩秘典六卷分期课程目录。',
    body: `<section style="padding-top:150px"><div class="wrap">
 ${head('分期开卷', '秘典目录', '六卷六期。卷〇 免费，卷一至卷五为会员内容，录好一卷开放一卷。')}
 ${issues(r)}
 <div class="cat">${volumes.map(v => `<a class="row rv" href="${r}juan/${v.slug}/">
  <div class="img" style="background-image:url(${r}img/${v.img}.jpg)"></div>
  <div class="mid"><div class="num">卷 ${v.cn} · 第 ${v.no + 1} 期 · ${v.free ? '免费' : v.status === 'open' ? '会员' : '筹备中'}</div>
  <h3>${v.title}</h3><p>${v.tagline}</p><div class="meta">${realLessons(v)} 节</div></div>
  <div class="go">展开此卷 →</div></a>`).join('')}</div>
</div></section>`,
  });
}

/* ───────── 每一卷 ───────── */
for (const v of volumes) {
  const r = '../../';
  const prev = volumes[v.no - 1], next = volumes[v.no + 1];
  const hasVideo = v.lessons.some(l => l.video);
  const syll = v.lessons.map((l, i) => {
    if (l.more) return `<li class="more"><em>${NUM[i]}+</em><b>${l.t}</b><s>入会可见</s></li>`;
    const tag = l.video ? '<s class="f">免费 · 播放</s>' : l.free ? '<s class="f">免费 · 录制中</s>' : v.status === 'open' ? '<s>会员</s>' : '<s>筹备中</s>';
    return `<li data-l="${i + 1}" class="${l.video ? 'playable' : ''}" ${l.video ? 'data-play' : ''}><em>第${NUM[i]}节</em><b>${l.t}</b>${tag}</li>`;
  }).join('');
  const aside = v.free
    ? `<div class="aside rv"><h4>卷〇 · 免费</h4><div class="p">¥0<small>不用登录</small></div>
        <p class="dim" style="margin-top:12px;font-size:15px">看完卷〇，如果这条路你走得通，再往下读。</p>
        <a class="btn" href="${r}juan/1/">看下一卷</a><div class="or">或 <a href="${r}join/">直接开启全卷秘典</a></div></div>`
    : `<div class="aside rv"><h4>解锁卷${v.cn}</h4><div class="p">¥99<small>/ 本卷</small></div>
        <p class="dim" style="margin-top:12px;font-size:15px">${v.status === 'open' ? '永久可看，含本卷全部附件。' : '本卷筹备中。现在入会，开卷当天即可看。'}</p>
        ${payBtn('single', '单买本卷', r, 'btn', v.no)}<div class="or">或 <a href="${r}join/">¥${prices.full} ${prices.capped ? '' : '早鸟'}开启全卷</a></div></div>`;
  page({
    path: `juan/${v.slug}`, r, active: v.free ? 'free' : 'juan',
    title: `卷${v.cn} ${v.title} · ${site.name}`, desc: v.tagline,
    body: `<div class="vhero"><div class="bg" style="background-image:url(${r}img/${v.img}.jpg)"></div><div class="wrap">
  <div class="crumb"><a href="${r}">首页</a> ／ <a href="${r}juan/">秘典目录</a> ／ 卷${v.cn}</div>
  <div class="num">卷 ${v.cn} · 第 ${v.no + 1} 期</div><h1>${v.title}</h1><p>${v.intro}</p>
  <div class="chips"><span class="chip ${v.status === 'open' ? 'ok' : ''}">${v.status === 'open' ? '已开放' : '筹备中'}</span><span class="chip">${realLessons(v)} 节</span><span class="chip ${v.free ? 'ok' : ''}">${v.free ? '免费' : '会员'}</span></div>
 </div></div>
 <div class="wrap vbody">
  <div>
   ${hasVideo ? `<div class="vplayer rv">${player(r)}</div>` : ''}
   <h3>学完这一卷</h3><ul class="gains">${v.gains.map(g => `<li>${g}</li>`).join('')}</ul>
   <h3>本卷章节</h3><ol class="syll" data-vol="${v.no}">${syll}</ol>
   <div class="vnav">${prev ? `<a href="${r}juan/${prev.slug}/"><small>上一卷</small>卷${prev.cn} ${prev.title}</a>` : '<span></span>'}${next ? `<a href="${r}juan/${next.slug}/" style="text-align:right"><small>下一卷</small>卷${next.cn} ${next.title}</a>` : '<span></span>'}</div>
  </div>
  ${aside}
 </div>`,
  });
}

/* ───────── 外包与合作 ───────── */
{
  const r = '../';
  const c = site.contact;
  const lines = [c.email && `邮箱：${esc(c.email)}`, c.wechat && `微信：${esc(c.wechat)}`, c.bilibili && `B 站：${esc(c.bilibili)}`, c.xiaohongshu && `小红书：${esc(c.xiaohongshu)}`].filter(Boolean);
  page({
    path: 'forge', r, active: 'forge', title: `外包与合作 · ${site.name}`, desc: '网页 3D 外包：铸造台一句话生成 3D 物件、3D 产品展示、H5 小游戏。',
    body: `<div class="vhero"><div class="bg" style="background-image:url(${r}img/forge-overview.jpg)"></div><div class="wrap">
  <div class="crumb"><a href="${r}">首页</a> ／ 外包与合作</div>
  <div class="num">承接委托</div><h1>同一座铸造台，<br>也为你开炉。</h1>
  <p>做暗岩用的整套流程，也能用在你的品牌活动、产品展示和小游戏上。网页直接打开，手机电脑都能用，不用下载。</p>
  <div class="ctas"><a class="btn" href="#contact">发来需求</a></div>
 </div></div>
 <section style="padding-top:40px"><div class="wrap">
  ${head('能做什么', '三种委托')}
  <div class="cases">${services.map((s, i) => `<div class="case rv"><div class="pic" style="background-image:url(${r}img/${s.img}.jpg)"></div>
   <div class="txt"><b>委托 ${NUM[i]}</b><h3>${s.t}</h3><p>${s.d}</p></div></div>`).join('')}</div>
 </div></section>
 <section style="padding-top:20px"><div class="wrap">
  ${head('怎么合作', '四步交付')}
  <div class="steps">
   <div class="step rv"><h4>说需求</h4><p>想做什么、给谁看、什么时候要。</p></div>
   <div class="step rv"><h4>出概念</h4><p>先出概念图和报价，你点头再开工。</p></div>
   <div class="step rv"><h4>做与改</h4><p>边做边给你看可以点开的版本。</p></div>
   <div class="step rv"><h4>交付上线</h4><p>交付网页与源码，帮你上线。</p></div>
  </div>
 </div></section>
 <section id="contact" style="padding-top:20px"><div class="wrap">
  <div class="quote rv"><div class="big">小单数千元起 · 完整活动一至两万起</div>
   <p>${lines.length ? lines.join('　·　') : '联系方式待公布'}</p>
   ${c.email ? `<a class="btn" style="margin-top:24px" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('网页 3D 委托')}">发邮件说需求</a>` : ''}
  </div>
 </div></section>`,
  });
}

/* ───────── 入会 ───────── */
{
  const r = '../';
  const open = true; // 微信收款码随时可用
  page({
    path: 'join', r, active: 'join', title: `入会 · ${site.name}`, desc: '暗岩秘典入会方式：单卷、全卷秘典、秘典亲授。',
    body: `<section style="padding-top:150px"><div class="wrap">
  ${head('入会方式', '择一而入', '单买一卷，或一次开启全部六卷。全卷每开放一卷涨 ¥${ladder.step}，越早越便宜。')}
  ${tiers(r)}
  ${open ? '' : '<div class="notice" id="open">收款通道正在开通，开放当天会在这里和各平台主页同步通知。先去看免费的卷〇吧。</div>'}
  <div class="flow">
   <div class="step rv"><h4>看卷〇</h4><p>免费，不用登录，先确认适合你。</p></div>
   <div class="step rv"><h4>选方案</h4><p>单卷或全卷，微信扫码或去爱发电付款。</p></div>
   <div class="step rv"><h4>开通</h4><p>爱发电付款自动开通；微信扫码由作者核对到账后开通，一般当天内。</p></div>
   <div class="step rv"><h4>开卷就看</h4><p>新卷开放当天，会员直接可看。</p></div>
  </div>
 </div></section>
 <section id="faq" style="padding-top:40px"><div class="wrap">
  ${head('答疑', '入卷之前')}
  <div class="faq rv">${faq.map(f => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}</div>
 </div></section>`,
  });
}


/* ───────── 登录 / 注册 ───────── */
page({ path: 'login', r: '../', active: 'login', noindex: true, title: `登录 · ${site.name}`, desc: '登录暗岩秘典',
  body: `<section class="authwrap"><div class="wrap">
  <form id="auth" class="authbox parch" data-mode="login" autocomplete="on">${corners}
   <div class="seal">典</div>
   <div class="tabs"><button type="button" class="on" data-mode="login">登录</button><button type="button" data-mode="register">注册</button></div>
   <label>邮箱<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"></label>
   <label>密码<input name="password" type="password" required minlength="8" autocomplete="current-password" placeholder="至少 8 位"></label>
   <label class="pw2" hidden>再输一次密码<input name="password2" type="password" minlength="8" autocomplete="new-password"></label>
   <button class="btn" type="submit">登录</button>
   <p class="hint">忘记密码请联系作者重置。登录即表示同意购买 7 天内、进度不到 20% 可退款的规则。</p>
  </form>
 </div></section>` });

/* ───────── 后台（只有 ADMIN_EMAILS 能用） ───────── */
page({ path: 'admin', r: '../', active: 'me', data: true, noindex: true, title: `后台 · ${site.name}`, desc: '后台',
  body: `<section style="padding-top:140px"><div class="wrap" id="admin">
  <div class="kicker">后台</div><h1>待确认的订单</h1>
  <p class="dim" style="margin-top:10px">打开微信收款记录，按<b>金额（含角分）</b>对上订单，再点确认到账。高亮的是买家已经点了「我已付款」的。</p>
  <table class="admtable"><thead><tr><th>金额</th><th>方案</th><th>账号</th><th>方式</th><th>时间</th><th></th></tr></thead><tbody id="adm-list"></tbody></table>
 </div></section>` });

/* ───────── 我的秘典 ───────── */
page({ path: 'me', r: '../', active: 'me', data: true, noindex: true, title: `我的秘典 · ${site.name}`, desc: '我的秘典',
  body: `<section style="padding-top:140px"><div class="wrap" id="me">
  <div class="mehead"><div><div class="kicker">我的秘典</div><h1 id="me-email">……</h1><div class="dim" id="me-dev"></div></div>
   <button class="btn ghost" id="logout" type="button">退出登录</button></div>
  <div class="notice" id="me-pending" hidden>正在确认付款结果……付完款回到这里，几秒到一两分钟内会自动开通。</div>
  <h3 class="mh">六卷</h3><div class="mvols" id="me-vols"></div>
  <div class="mecols">
   <div><h3 class="mh">订单</h3><ul class="morders" id="me-orders"></ul></div>
   <div>
    <h3 class="mh">兑换码</h3><form id="redeem" class="inline"><input name="code" required placeholder="AY-XXXX-XXXX-XXXX"><button class="btn" type="submit">兑换</button></form>
    <h3 class="mh">修改密码</h3><form id="pwform" class="stack"><input name="old" type="password" required placeholder="原密码" autocomplete="current-password"><input name="password" type="password" required minlength="8" placeholder="新密码，至少 8 位" autocomplete="new-password"><button class="btn ghost" type="submit">修改</button></form>
   </div>
  </div>
 </div></section>` });

/* ───────── 学习页 ───────── */
page({ path: 'learn', r: '../', active: 'learn', data: true, noindex: true, title: `学习 · ${site.name}`, desc: '暗岩秘典学习页',
  body: `<section style="padding-top:110px"><div class="wrap learn" id="learn">
  <aside class="lside"><a id="l-vol" class="lvol" href="#"></a><ol id="l-list"></ol></aside>
  <div class="lmain">
   <div class="stage frame" id="l-stage">${corners}<video controls playsinline controlslist="nodownload" oncontextmenu="return false"></video></div>
   <h1 id="l-title"></h1>
   <div class="lnav" id="l-nav"></div>
  </div>
 </div></section>` });

/* ───────── 404 ───────── */
writeFileSync(join(OUT, '404.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>迷失深渊 · ${site.name}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07090a;color:#d9c9a3;font-family:"Noto Serif SC",serif;text-align:center}h1{font-size:40px;letter-spacing:8px;color:#e6c67a}a{color:#9ff0c4}</style></head>
<body><div><h1>此页已沉入深渊</h1><p><a href="/">回到首页</a></p></div></body></html>`);

console.log('built →', OUT);
