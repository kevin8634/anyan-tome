# 暗岩秘典 · 独立站

《暗岩传说：深渊回响》开发全录课程站。纯静态，不依赖任何框架，可以直接放到 GitHub Pages。

## 目录
- `src/data.mjs`：**所有文案都在这里**，包括数据条、六卷分期课程与章节、价格、外包服务、答疑、收款链接、联系方式和备案号
- `src/build.mjs`：生成器，零依赖，会把页面输出到 `docs/`
- `static/`：样式、脚本、图片、字体、视频，构建时原样复制到 `docs/`
- `docs/`：生成好的网站，GitHub Pages 直接发布这个目录
- `tools/subset-font.py`：标题字体裁剪（只保留站内用到的字，约 250KB）
- `tools/shot.sh`：无头浏览器截图预览

## 本地预览
```bash
npm run build          # 生成 docs/
npm run dev            # 生成并在 http://localhost:4321 预览
```

## 发布到 GitHub Pages
1. 仓库：https://github.com/kevin8634/anyan-tome ，站点地址 https://kevin8634.github.io/anyan-tome/ 。`docs/` 要一起提交
2. 打开仓库 Settings → Pages → Source 选 *Deploy from a branch*，分支选 `main`，目录选 `/docs`
3. 页面之间都用相对路径，放在 `用户名.github.io/仓库名/` 这样的子路径下也能用

> 注意：GitHub Pages 在国内访问不稳定。正式卖课时按方案迁到香港服务器，或在备案后迁到大陆。迁移时把 `docs/` 整个拷过去即可。

## 常见改动
- **加课或改章节**：编辑 `src/data.mjs` 里的 `volumes`。`status: 'open'` 表示已开放，`'soon'` 表示筹备中。给某一节加 `video: 'xxx'` 后，把 `static/video/xxx.mp4` 放进去就能播放（目前播放器只会读 hook60，多个视频需要再扩展）
- **开通收款**：把爱发电等收款方案链接填进 `site.pay`，按钮会自动从「即将开放」变成跳转付款
- **新增了文字后**：运行 `python3 tools/subset-font.py <NotoSerifSC.ttf 路径>` 重新裁字体，再 `npm run build`。不裁也能用，新字会退回系统宋体

## 还没做（需要后端，下一阶段）
登录注册、付款后自动解锁、会员视频加密播放（HLS + 签名地址 + 水印）、学习进度、答疑区。现在这一版是公开展示站：卷〇 免费可看，会员卷只展示目录。

---

# 会员后端（v2）

零依赖：只要 Node ≥ 22.5（用自带的 `node:sqlite`），不用 `npm install`。

## 功能
- 邮箱 + 密码注册 / 登录（scrypt 加密存储），会话 Cookie（HttpOnly），每个账号最多 2 台设备，第 3 台登录会把最久没用的那台挤下线
- 下单 → 跳爱发电付款页（链接带 `custom_order_id`）→ 爱发电 Webhook 回调 → **回查爱发电接口核实**（订单存在、交易成功、方案对、金额够）→ 自动开通
- 每 10 分钟对账一次；用户在「我的秘典」页等待时也会主动回查，回调丢了也能补开通
- 兑换码（送朋友、做活动、处理补差价）
- 会员视频：AES-128 加密 HLS，播放列表要登录 + 有该卷权益，分片地址 10 分钟过期签名，密钥只发给有权限的会员；画面上有会员编号和邮箱的漂移水印
- 学习进度、订单列表、修改密码
- 纯静态托管（GitHub Pages）时，这些功能自动隐藏，站点照常展示

## 本地跑起来
```bash
npm start            # http://localhost:8787 ，开发模式会提示 SECRET 未设置
npm test             # 端到端自测：假爱发电（校验签名）+ 真后端，29 项
```

## 上线前要做的
1. 爱发电：开通开发者，建三个方案（单卷 99、全卷 199、亲授 299），记下 user_id、API Token、三个 plan_id；Webhook 地址填 `https://你的域名/api/afdian/webhook`
2. `cp server/.env.example server/.env`，填好；`SECRET` 用 `openssl rand -base64 48` 生成
3. `npm run admin ping` 测签名通不通
4. 课程视频：`tools/pack-hls.sh 卷一第1节.mp4 1 1`，产出在 `media/1/1/`（media 不进 Git，直接传到服务器）
5. 服务器上用 systemd 常驻，前面挂 Caddy 或 Nginx 做 HTTPS：
```
# /etc/systemd/system/tome.service
[Service]
WorkingDirectory=/srv/tome
ExecStart=/usr/bin/node server/server.mjs
Restart=always
User=tome
[Install]
WantedBy=multi-user.target

# Caddyfile
你的域名 {
  reverse_proxy 127.0.0.1:8787
}
```
6. 备份：每天把 `data/tome.db` 拷一份走（SQLite 单文件）

## 静态版会员（现在在用：GitHub Pages + 微信收款码 + 解锁码，不需要服务器）

- 买家点购买 → 弹出微信收款码，按页面价格付款，备注写微信号或邮箱 → 你核对到账后用**发码器**生成专属解锁码发给他 → 他在入会页 `join/#unlock` 或卷页侧栏输入就能看。
- 付费正文写在 `course/<卷>/<节>.md`（**不进 Git**），构建时用总钥加密成 `docs/locked/<卷>/<节>.json`；卷〇（免费）写明文。只有卷的 `status` 是 `open` 才会发布，筹备中的卷不会上线。
- 视频：`tools/pack-locked.sh 视频.mp4 卷 节` 切片加密到 `static/locked/`，再在讲义里单独一行写 `[[视频]]`。
- 总钥 `keys/master.key` 和网页版发码器 `keys/发码器.html` **不进 Git**，务必另存备份；总钥丢了，已发的码全部失效。
- 发码：`npm run code full "备注"`（亲授 `mentor`，单卷 `1`–`5`），或双击 `keys/发码器.html`（`npm run code html` 生成）。
- 有人外传解锁码：`npm run code revoke <码或编号>`，重新构建推送后，这个码就不能再解锁新设备。
- 限制：解锁码可以转给别人用（只能事后拉黑）；已解锁的人能自己录屏或保存正文。这是不用服务器的代价，以后上服务器可切回会员后端。
- 构建并推送：`tools/publish.sh "说明"`（会检查 course/、keys/ 没有进仓库）。

## 早鸟阶梯价

全卷价在 `src/data.mjs` 的 `ladder` 里：起价 ¥199，每把一卷付费卷的 `status` 改成 `open`，全卷自动涨 ¥50，封顶 ¥299；亲授 = 全卷 + ¥100；单卷 ¥99。
重新构建后，页面、收款码弹窗和服务器（读 `docs/prices.json`）都会用新价格。**爱发电后台的方案价格要你手动改成一样**，否则回调金额对不上。

## 微信收款码（人工确认）

个人收款码没有到账通知，所以流程是：

1. 买家选「微信扫码」，页面给出**带随机角分的金额**（如 ¥199.37，48 小时内不重复）和你的收款码；
2. 买家付款后点「我已付款」，订单在后台高亮；
3. 你打开微信收款记录，按金额对上订单，在 `https://你的域名/admin/` 点「确认到账」（或 `npm run admin confirm 199.37`），立刻开通。

设置：`server/.env` 里 `ADMIN_EMAILS=你的邮箱`（先在站上注册这个邮箱），收款码图片在 `static/img/wechat-pay.webp`，换码直接覆盖同名文件。`WECHAT_PAY=0` 可关闭。
爱发电建好方案并填好配置后，买家会看到两种方式可选；没配爱发电时只显示微信。

纯静态托管（GitHub Pages，没有后端）时，购买按钮直接弹出收款码，按基础价付款、备注写邮箱，由你手动发兑换码。

## 后台命令

- `npm run admin pending`：待确认的微信订单
- `npm run admin confirm <订单号|金额>`：确认到账并开通
- `npm run admin cancel <订单号>`：作废
```bash
npm run admin codes full 10 "B站抽奖"     # 生成 10 个全卷兑换码
npm run admin codes single 2 1           # 生成 1 个卷二兑换码
npm run admin grant 某人@qq.com full      # 手动开通
npm run admin refund AYxxxx              # 标记退款并收回权限（钱要在爱发电后台退）
npm run admin orders / users / events
npm run admin reset-password 某人@qq.com  # 生成新密码
```

## 已知限制（不是 bug，后面再做）
- 忘记密码要找作者重置（没接邮件发送）
- 「单卷补全卷抵扣」没自动化：爱发电方案价格是固定的，目前用兑换码手动处理
- `AFDIAN_PRODUCT_TYPE` 默认 0（官方示例写法）；如果在爱发电建的是「售卖」类商品，按后台给出的购买链接核对
- 加密 + 水印只能挡住随手下载和外传，挡不住录屏
- 数据都在一台机器上，适合起步规模（几千会员以内）
