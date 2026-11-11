// 暗岩秘典 · 站点数据。改文案、加课、换价格，只改这个文件，然后 `node src/build.mjs`。

export const site = {
  name: '暗岩秘典',
  author: 'Rhett',
  game: '《暗岩传说：深渊回响》',
  // 收款链接：开通爱发电（或其他收款方）后填进来。留空时按钮显示「即将开放」。
  pay: {
    single: '',   // 单卷 ¥99
    full: '',     // 全卷秘典
    mentor: '',   // 秘典 · 亲授
  },
  // 联系方式：留空则页面显示「联系方式待公布」。
  contact: {
    email: '',
    wechat: '',
    bilibili: '',
    xiaohongshu: '',
  },
  icp: '', // ICP 备案号，备案后填写
};

export const stats = [
  { n: '108,000', t: '行代码' },
  { n: '566', t: '次提交' },
  { n: '240', t: '个 3D 模型' },
  { n: '25', t: '天' },
  { n: '0', t: '美术 · 外包' },
];

export const pricing = [
  {
    id: 'single', name: '单卷', price: '¥99', unit: '/ 卷', was: '',
    perks: ['任选一卷，永久可看', '该卷全部讲义、脚本与附件', '之后补全卷可抵扣已付'],
  },
  {
    id: 'full', name: '全卷秘典', price: '', unit: '/ 全部', was: '', ribbon: '早鸟阶梯价', main: true,
    perks: ['卷一至卷五，开一卷看一卷', '模板库与后续更新', '会员答疑区'],
  },
  {
    id: 'mentor', name: '秘典 · 亲授', price: '', unit: '/ 全部', was: '',
    perks: ['全卷秘典全部权益', '一次 30 分钟项目诊断', '新卷抢先看'],
  },
];

// 分期课程：一卷就是一期。status: open 已开放 / soon 筹备中
// lesson.free = 免费可看；lesson.video = 有视频即可在页面播放
export const volumes = [
  {
    no: 0, cn: '〇', slug: '0', title: '起步：一句话铸神兵', status: 'open', free: true,
    img: 'hero-bell', tagline: '一小时走完迷你全流程，先确认这条路你走得通。',
    intro: '从一句话开始，到浏览器里一把会发光的 3D 武器。这一卷不讲大道理，只把整条链路完整走一遍：AI 写代码、AI 生成模型、压缩、放进网页、点亮。走完你就知道，后面五卷各自在解决哪一段。',
    gains: ['看懂「一个人 + AI」做 3D 网页游戏的完整链路', '跑通第一段由 AI 写出的 three.js 法阵', '拿到一把自己的 3D 武器，并在网页里点亮'],
    lessons: [
      { t: '六十秒看完整条链路', free: true, video: 'hook60' },
      { t: '让 AI 写出第一个法阵', free: true },
      { t: '一句话生成武器模型', free: true },
      { t: '压缩、入网页、点亮', free: true },
      { t: '你该从哪一卷学起', free: true },
    ],
  },
  {
    no: 1, cn: '一', slug: '1', title: '指挥 AI 写十万行', status: 'open',
    img: 'cellar', tagline: '需求拆法、提示词结构，怎样让 AI 改代码而不毁代码。',
    intro: '十万行代码不是一次写出来的，是一次次「说清楚—让它做—验收—记下来」叠出来的。这一卷讲我每天怎么给 AI 派活：需求拆到多细，提示词长什么样，怎么让它自己截图检查画面，出错了怎么回滚。',
    gains: ['一套能复用的派活格式：目标、约束、验收', '让 AI 动大工程而不把旧功能改坏', '用无头截图让 AI 自己检查画面'],
    lessons: [
      { t: '先写交接文档，再写代码' },
      { t: '把需求拆成 AI 一步能做完的活' },
      { t: '提示词骨架：目标、约束、验收' },
      { t: '让 AI 改代码而不毁代码' },
      { t: '无头截图：让 AI 自己看画面' },
      { t: '版本号、开发记录与回滚' },
    ],
  },
  {
    no: 2, cn: '二', slug: '2', title: '铸器：从 Lux3D 到网页', status: 'soon',
    img: 'forge-moment', tagline: '生成 → T 字姿势 → 绑骨 → 压缩 → 入 three.js，一条龙。',
    intro: '暗岩里 240 个模型，没有一个是手工建的。这一卷把整条铸器流水线拆开：提示词怎么写才不出怪东西，模型怎么立正、怎么绑骨、怎么压到网页吃得下，最后在 three.js 里用材质和泛光把它点亮。',
    gains: ['写出稳定出货的 3D 生成提示词', '模型立正、归一、绑骨、配动作', '把模型压到网页能流畅加载的体积'],
    lessons: [
      { t: 'Lux3D 提示词：要什么，更要写清不要什么' },
      { t: '立起来：T 字姿势与朝向归一' },
      { t: '绑骨与动作库' },
      { t: '压缩：贴图、网格与体积预算' },
      { t: '入 three.js：材质、环境反射与泛光' },
      { t: '溶解成形：铸造台的那一下' },
    ],
  },
  {
    no: 3, cn: '三', slug: '3', title: '多窗口交接术', status: 'soon',
    img: 'cross', tagline: '几个 AI 窗口同时开工，靠交接文档接力，不断档、不打架。',
    intro: '一个对话窗口装不下一款游戏。我把开发、宣发、变现分在不同窗口里并行，用一个仓库当所有窗口的共同记忆。这一卷讲交接文档的固定格式、分工方法，以及两个 AI 想改同一处时怎么办。',
    gains: ['交接文档模板：新窗口五分钟接上活', '多条线并行而不互相覆盖', '用一个仓库做所有窗口的记忆'],
    lessons: [
      { t: '为什么一个窗口不够' },
      { t: '交接文档的固定格式' },
      { t: '分工：开发、宣发、变现各开一线' },
      { t: '一个仓库，当所有窗口的记忆' },
      { t: '冲突与合并：别让两个 AI 改同一处' },
    ],
  },
  {
    no: 4, cn: '四', slug: '4', title: '深渊踩坑十六条', status: 'soon',
    img: 'well', tagline: '每一条都花过真实的时间和积分，附现场与修法。',
    intro: '这些坑我都实打实掉进去过，有的花了一个下午，有的白烧了一批生成积分。每一条都写清楚：当时发生了什么、为什么、怎么修、以后怎么避开。',
    gains: ['提前避开最贵的十六个坑', '每条都有现场记录和修法', '一份可以贴在工位上的检查清单'],
    lessons: [
      { t: '写「石像」，模型就会长出底座' },
      { t: '「巨魔兄弟」：一个模型里生出两只怪' },
      { t: '改了一张职业表，整套校验报错' },
      { t: '临时目录一重置，打包产物全没了' },
      { t: '无头浏览器一秒只有 1–3 帧' },
      { t: '生成并发有上限，排队比生成还久' },
      { t: '另外十条', more: true },
    ],
  },
  {
    no: 5, cn: '五', slug: '5', title: '脚本与模板库', status: 'soon',
    img: 'bell', tagline: '压缩、绑骨、批量导出、交接模板，拿来即用，持续更新。',
    intro: '前面几卷用到的脚本和模板，全部整理成可以直接拿走的版本，配上用法说明。会员可以提需求，常用的会补进来。',
    gains: ['开箱即用的脚本，省掉从零摸索', '交接文档、提示词模板', '持续更新，会员可提需求'],
    lessons: [
      { t: '交接文档模板' },
      { t: '3D 批量生成脚本' },
      { t: '绑骨与修骨脚本' },
      { t: '模型压缩与导出脚本' },
      { t: '无头截图测试脚本' },
      { t: '持续更新 · 会员提需求' },
    ],
  },
];

export const services = [
  { t: '铸造台 · 一句话生成 3D 物件', d: '用户输入一句话，网页里当场铸出一件 3D 物件。适合品牌活动、节日营销。', img: 'forge-overview' },
  { t: '3D 产品 / 场景展示', d: '产品或空间放进网页，可旋转、可拆解、可点亮，手机打开就能看。', img: 'forge-moment' },
  { t: 'H5 小游戏与互动活动', d: '活动小游戏、抽奖、闯关，浏览器直接玩，不用下载。', img: 'portal' },
];

export const faq = [
  { q: '没写过代码能学吗？', a: '能。卷〇 就是为零基础准备的，看完它再决定要不要入会。整套方法的核心是「把话说清楚、让 AI 做、自己验收」，不要求你会手写代码。' },
  { q: '要准备什么工具？', a: '一台能上网的电脑、一个 AI 编程工具。3D 生成工具按卷二的说明开通，费用在课里写明，可以先不买。' },
  { q: '买了能看多久？', a: '买下的卷永久可看，后续更新免费。' },
  { q: '能退款吗？', a: '购买 7 天内联系作者，可以全额退款，退款后解锁码同时停用。' },
  { q: '为什么课程分卷、分期开放？', a: '一卷就是一期，录好一卷开放一卷，保证每一卷都是认真打磨过的。现在买全卷，后续开放的每一卷都包含在内。全卷价每开放一卷涨 ¥50，涨到 ¥299 为止，越早买越便宜。' },
];

// 早鸟阶梯价：每开放一卷付费卷，全卷涨 ladder.step，封顶 ladder.cap；亲授 = 全卷 + mentorPlus
// 改这里或改卷的 status 后重新构建，价格会写进页面和 docs/prices.json（服务器以它为准，.env 的 PRICE_* 可覆盖）
export const ladder = { start: 199, step: 50, cap: 299, mentorPlus: 100, single: 99 };
const openedPaid = volumes.filter(v => !v.free && v.status === 'open').length;
const fullNow = Math.min(ladder.start + ladder.step * openedPaid, ladder.cap);
const fullNext = Math.min(fullNow + ladder.step, ladder.cap);
export const prices = { single: ladder.single, full: fullNow, mentor: fullNow + ladder.mentorPlus, fullNext, capped: fullNow >= ladder.cap };
for (const t of pricing) t.price = '¥' + prices[t.id];
Object.assign(pricing.find(t => t.id === 'full'), prices.capped
  ? { ribbon: '', was: '' }
  : { was: `下一卷开放后 ¥${fullNext} · 正价 ¥${ladder.cap}` });
