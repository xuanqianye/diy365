# diy365.cc 站点运维清单（建站 · 功能 · 安全 · 应急）

> 最后更新：2026-11-14
> 用途：站点全部功能部署上线后的总归档。日后需要**重建、排障、应对封站/故障**时，按本清单操作。
> 适用对象：站长本人（xuanqianye）。所有代码均位于 GitHub 仓库 `xuanqianye/diy365`。

---

## 0. 一句话架构

```
Hugo 静态站点  →  GitHub 仓库(xuanqianye/diy365, main)  →  GitHub Actions 自动构建
             →  Cloudflare Pages 发布  →  自定义域 diy365.cc / www.diy365.cc
后台 Decap CMS(/anan) 经 GitHub OAuth 代理 Worker(diy365-auth) 直推 GitHub 触发 CI
投稿/联系/DMCA 走 Cloudflare Worker `diy365-submit` → 存 KV（不写 GitHub 仓库）
后台 /anan/ 右下角三个面板读 KV：投稿审核 / 版权投诉 / 标签预设
```

纯静态、无后端数据库。内容即 Markdown 文件（在 `content/patterns/`）。

---

## 1. 关键资产与位置（先记这组，丢了就找不回）

| 资产 | 位置 / 说明 |
|---|---|
| GitHub 仓库 | `https://github.com/xuanqianye/diy365`（main 分支，**公开**） |
| 本地主工作目录 | `E:/diy365静态钩针图解站`（与 GitHub 同步；另有工作区副本 `C:/Users/47282/WorkBuddy/2026-11-11-22-39-18/diy365`） |
| Cloudflare 账户 | 托管域名 `diy365.cc` + Pages 项目 `diy365`（域 `diy365.pages.dev`）+ Worker `diy365-auth` |
| 域名注册商 | `diy365.cc` 的注册商（改 NS / 续费 / 转移用） |
| 部署凭证（Secret，**勿泄露、勿进 git**） | GitHub Actions Secret：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`；Worker 环境变量：`GITHUB_CLIENT_SECRET`（diy365-auth）、可选 `ALLOWED_GITHUB_LOGIN` |
| Superbed token | 本地 `.env`（历史确认未入 git；确保 `.gitignore` 排除） |
| GitHub OAuth App | Client ID `Ov23liLP7IRGMwtDriB4`（公开，无需保密）；Secret 走 Worker 环境变量 |

> **红线**：任何 Secret/Token 绝不写进仓库源码或提交历史。轮换方式见 §6.4。

---

## 2. 建站过程 & 功能清单（已全量部署）

建站起点：基于 **Hugo 静态站点生成器** + **Decap CMS** 后台，部署到 **Cloudflare Pages**，后续按需求迭代以下功能（均为已上线状态）：

| # | 功能 | 关键文件 / 说明 | 提交(参考) |
|---|---|---|---|
| 1 | **图片灯箱 Lightbox** | `static/js/lightbox.js`、`static/css/lightbox.css`；点击放大/缩放/拖拽/上下张/Esc 关闭；移动端双指捏合、滑动切换、双击放大。绑定封面/步骤图/正文/related/gallery | 6445418 |
| 2 | **移动端封面网格一排两个** | `static/css/style.css` 的 masonry 媒体查询（手机端 `grid-template-columns:repeat(2,1fr)`）；桌面 4→3 列 | c5556de |
| 3 | **Feed 数据修复** | `static/js/feed.js` 两处 `force-cache`→`no-cache`（修复手机缓存旧 JSON 缺文章 bug） | c5556de |
| 4 | **Decap 后台瘦身** | `static/anan/config.yml` 删除 noindex/difficulty/yarn/hook/size 5 字段；`head.html` 保留 noindex 渲染兼容旧文；`single.html`/`pattern-card.html` 清显示 | 0573f79 |
| 5 | **封面默认首图 + 作者留空** | `pinImage` 改 `widget:list`（多张+拖拽排序，首位=默认封面）；`cover` 保留手动覆盖；`author` 去默认 DIY365 留空 | 0a8c866 |
| 6 | **批量发布页 `/anan/batch`** | `static/anan/batch.html`；粘贴多行（标题\|封面\|步骤图\|分类\|短链）解析预览→走 GitHub Git Tree API 一次生成多篇 | 7643477 |
| 7 | **SEO：JSON-LD 富摘要** | `layouts/partials/seo-schema.html`：Article + BreadcrumbList + WebSite（jsonify 防注入） | ed3daf6 |
| 8 | **SEO：GA4 统计** | `hugo.toml` `googleAnalytics = "G-K9VCKX9RVS"`；`head.html` 用 `site.Params` 直接读（勿用 `with $seo.xxx` 门控，会不渲染） | f433398 / 3998d83 |
| 9 | **SEO：Bing 验证占位** | `hugo.toml` `bingVerification` 参数 + `head.html` 的 `msvalidate.01` meta 门控（填值部署即生效） | 2cb0dcb |
| 10 | **GSC 提交** | Google Search Console 提交 `https://diy365.cc/sitemap.xml`（已验证域名属性） | 早期 |
| 11 | **Cookie 同意横幅（GDPR 门控）** | `static/js/cookie-consent.js` + `static/css/cookie-consent.css`；Accept 才注入 GA4+51.la，英文文案，左下角卡片 | b00967c / 5a32e3f |
| 12 | **后台发布提示** | `static/anan/deploy-notice.js`（"已经发布成功，看一看前端有没有上线"）+ 常驻同步提示 `sync-notice.js` | 9a9dd9b / 672a8ec |
| 13 | **自动退出（1h 无操作）** | `static/anan/idle-timeout.js`；登录态后 1 小时无操作清登录态刷新，到期前 5 分钟黄色提示 | 7e2bbec |
| 14 | **auth 白名单故障提示条** | `static/anan/whitelist-notice.js`（琥珀色常驻，提示 GitHub API 故障 fail-closed 时临时去白名单部署） | ddd4edc |
| 15 | **阅读量计数** | **已撤销**（用户嫌 KV 绑定麻烦，保持现状）；如未来要做，见 §7 备注 | revert 9a08a32 |
| 16 | **投稿审核 / 版权投诉分离** | `static/anan/review-panel.js`：投稿审核只列 `submission`/`contact`，版权投诉独立按钮+独立面板（只列 `dmca`、无发布按钮、可标记已处理并显示待处理角标）；`publish()` 加类型硬校验，DMCA 绝不能写进 `content/patterns/` | 2026-11-14 |
| 17 | **版权表单证明材料上传** | `layouts/shortcodes/form.html` 的 dmca 分支 + `static/js/submit-uploader.js` 第二段：最多 5 张 JPG/PNG/WebP 直传 Superbed，URL 随 `infringing` 字段进 KV；后台版权投诉面板解析成缩略图 | 2026-11-14 |
| 18 | **标签预设免密钥 + 工具条不重叠** | `functions/api/tag-presets.js` / `static/anan/tag-presets.js`：复用 Decap 的 GitHub 登录态（`X-GH-Token`），不再要求 Cloudflare 配 `GH_TOKEN`；三个浮动按钮统一放进 `#wbAdminBar` 竖排，面板上移到 `bottom:160px` | 2026-11-14 |

> 提交号来自工作日志，仅作追溯参考；以 `git log` 实际为准。

---

## 3. 安全防护措施（已上线）

| 措施 | 状态 | 说明 |
|---|---|---|
| **GitHub 2FA** | ✅ 已开 | 登录本就走 GitHub OAuth，开 2FA 即在认证环节要验证码，等同二次验证；`diy365-auth` Worker 不改 |
| **自动退出** | ✅ 已上线 | 后台 1 小时无操作强退（commit 7e2bbec） |
| **`/submit` 双重限流** | ✅ 已生效 | 代码层 `functions/submit.js`（同 IP 60秒/10次→429）+ Cloudflare 规则 `limit-submit`（10秒/10次→阻止），互补拦突发+慢速 |
| **auth 白名单** | ✅ 已部署 | `diy365-auth` Worker 仅放行 `xuanqianye`（环境变量 `ALLOWED_GITHUB_LOGIN` 可扩展）；非白名单拒发 token |
| **Cookie 同意门控** | ✅ 已上线 | 同意前不加载 GA4/51.la，合规 |
| **部署凭证隔离** | ✅ | Token 走 GitHub Secret / Worker 环境变量，不硬编码 |
| **Cloudflare 配置备份** | ✅ | `cloudflare-backup/` 目录（见 §7）已进 git |

---

## 4. 已知漏洞 / 风险点（诚实列出，按优先级）

| 优先级 | 风险 | 现状与缓解 |
|---|---|---|
| 🔴 中 | **`/submit` 为公开写接口** | 任何人可 POST，用 GH_TOKEN 写仓库；虽有双重限流，理论上可被"慢速+多 IP"绕过。投稿为 `draft:true` 不公开，主要风险是**仓库污染 + 构建流水线滥用**。→ 长期建议加 Cloudflare Turnstile 人机验证 |
| 🔴 中 | **批量发布页 `/anan/batch` 无独立鉴权** | 公网可直接访问，靠页面读 localStorage 的 GitHub token 才能发帖；无 token 进不来，但页面本身暴露 | 
| 🟠 低 | **fail-closed 可能误伤本人** | Worker 取 `api.github.com/user` 失败即拒绝登录（含站长本人）。已有后台提示条告知；临时去白名单部署即可进 | 
| 🟠 低 | **旧 Worker `diy365`（`diy365.binan2046.workers.dev`）未删** | 已被 Pages 取代、不伺服任何域名，占坑风险低，但建议择机删除 | 
| 🟠 低 | **Cloudflare Free 限流窗口仅 10 秒** | 慢速攻击靠 `submit.js` 代码层（60秒/10次）兜底；升级付费版可改 1 分钟窗口 | 
| 🟡 注意 | **测试文章 `pattern-mwdlmsdy`（标题「测试更新」）仍在线上** | 内容残留，建议决定删/留 | 
| 🟡 注意 | **Superbed token 在本地 `.env`** | 历史确认未入 git；确保 `.gitignore` 持续排除，勿误提交 | 
| 🟡 注意 | **单一协作者 + 账号安全依赖 2FA** | 仅 `xuanqianye` 一个协作者；账号本身安全=2FA 强度 | 
| 🟡 注意 | **AI 训练爬虫屏蔽可能不全** | `robots.txt` 已屏蔽 GPTBot/CCBot/ClaudeBot 等常见 AI bot，但新型 bot 可能漏网 | 
| 🟢 限制 | **GA4 数据收集未激活** | 代码正确，但大陆 GFW 屏蔽 Google 域名，且尚未收到海外真实访问；非漏洞，待海外访问激活 | 
| 🟢 已修复 | **DMCA 投诉曾被误发布为图解文章**（2026-11-14） | 旧投稿审核面板对 KV 中**所有类型**都显示「直接发布」，一条测试投诉被写成 `content/patterns/dmca-mwghkg8p.md` 并上线。已删除该文件、面板按 type 分流、`publish()` 加类型硬校验。注意：发布成功后面板会删除 KV 记录，合规留档请勿只依赖 KV | 

---

## 5. 待办 / 暂缓项

- [ ] **Bing 站长工具**：因微软 2026-11-13 大规模宕机登录受阻，等恢复后做（代码已备 `bingVerification` + `msvalidate.01`，填值部署即可；或走 GSC 导入）
- [ ] **测试文章 `pattern-mwdlmsdy` 删/留**
- [ ] **旧 Worker `diy365` 是否删除**
- [ ] **阅读量计数**：用户决定保持现状（如未来做，需在 Cloudflare 控制台建 KV 命名空间 `VIEW_KV` 绑到 Pages 项目，再重部署）
- [ ] **GA4 激活**：用 VPN/海外网络打开一次 diy365.cc，GA 实时报告出现访问即通
- [ ] **AdSense 获批后填回 `static/ads.txt`**：占位版 `pub-0000000000000000` 已于 2026-11-14 删除。原因：Google 抓到全 0 的 pub ID 会判定「该域名未授权任何有效卖家」，比不提供 ads.txt 更糟；ads.txt 本身不是申请硬性条件。
  - 删除后该路径**不是严格 404**：`wrangler.toml` 的 `not_found_handling = "404-page"` 会让它返回 200 + 404 页 HTML（站点所有不存在的路径都如此）。实测已不含任何 `pub-` 声明；官方「缺发布商 ID 停止购买广告」的后果针对 Ad Manager 程序化竞价，AdSense 直投不受影响，无需为此改动全站 404 行为。
  - 账号批准后在 AdSense 后台「账号 → 设置 → 账号信息」取 16 位发布商 ID；
  - 新建 `static/ads.txt`，**只写一行**：`google.com, pub-<你的16位ID>, DIRECT, f08c47fec0942fa0`；
  - `git add static/ads.txt && commit && push` 部署后，用 `curl https://diy365.cc/ads.txt` 确认返回该行；
  - **申请审核期间不要提前放任何占位文件**，也不要把 pub ID 写进其它页面。

---

## 6. 站点被封 / 故障后重新部署上线方法（应急手册）

> 核心信心来源：**源码在 GitHub + 本地 E 盘双备份；Cloudflare 配置在 `cloudflare-backup/` 有存档**。任何单点失效都能重建。

### 6.1 场景 A：Cloudflare 账号或 diy365.cc 在 CF 侧被封
1. 注册**新 Cloudflare 账号**（不同邮箱/Payment 信息，避免关联封禁）。
2. 在**域名注册商**处把 `diy365.cc` 的 Nameserver 改为新 CF 提供的 NS。
3. 新 CF 账号内：
   - 添加站点 `diy365.cc`；
   - 创建 **Pages 项目**，连接 GitHub 仓库 `xuanqianye/diy365`，构建命令 `hugo --minify`、输出目录 `public`（或沿用仓库 `deploy.yml` 的 wrangler 流程）；
   - 配置自定义域 `www` + apex，等 DNS/SSL 生效；
   - **重建安全配置**：从 `cloudflare-backup/` 部署 `diy365-auth` Worker（填 `GITHUB_CLIENT_SECRET` 环境变量）、建 `limit-submit` Rate Limiting 规则、设 `ALLOWED_GITHUB_LOGIN=xuanqianye`。
4. 触发一次部署（push main 或手动跑 Actions）。

### 6.2 场景 B：域名 `diy365.cc` 被墙 / 注册商暂停 / 过期
1. 注册**新域名**（如 `diy365x.cc` / `diy366.cc`）。
2. 改 `hugo.toml` 的 `baseURL` 为新域，`git commit && push` 重新构建。
3. 新域接入 Cloudflare（同 §6.1 步骤 3），CNAME 到 `diy365.pages.dev` 或设自定义域。
4. 检查 `static/anan/config.yml` 等有无硬编码旧域名，一并改。
5. 通过自有渠道（如有）通知读者新地址。

### 6.3 场景 C：GitHub 账号或仓库不可用
- 本地 `E:/diy365静态钩针图解站` 是**完整源码 + git 历史**：
  - 在新 GitHub/GitLab 账号建空仓库 → `git remote set-url origin <新地址>` → `git push -u origin main`。
  - 或直接从 E 盘源码新建仓库。
- 重新连 Cloudflare Pages 到新仓库，配 GitHub Actions Secret（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）。
- 若仅仓库被删但账号在：从 E 盘 `git push` 即可恢复。

### 6.4 场景 D：被攻击 / 凭证泄露后的恢复
1. 立即改 **GitHub 密码** + 确认 2FA 开启。
2. **轮换** GitHub Actions Secret `CLOUDFLARE_API_TOKEN`（CF 控制台 regenerate）→ 更新仓库 Secret。
3. **轮换** `diy365-auth` 的 `GITHUB_CLIENT_SECRET`（GitHub OAuth App 重置 client secret）→ 更新 Worker 环境变量 → 重新部署 Worker。
4. 检查 `git log` 有无异常提交，必要时 `git revert` 回滚 + 设分支保护。
5. 重新部署一次。

### 6.5 场景 E：本地源码丢失
- `git clone https://github.com/xuanqianye/diy365.git` 到新机器即恢复全部（公开仓库）。
- 若仓库被设为 private/删除，用 E 盘本地副本兜底。

---

## 7. 备份盘点 & 快速排障

### 当前备份状态（截至 2026-11-13）
- **代码**：GitHub 仓库（异地）+ E 盘本地 ✅
- **Cloudflare 配置**：`cloudflare-backup/diy365-auth.worker.js`（白名单 Worker 完整可部署代码）+ `cloudflare-backup/rate-limiting-limit-submit.md`（限流规则参数+重建步骤），已进 git ✅
- **未进备份**：GitHub 2FA 设置（账号端开关，恢复码自行保管）；Superbed token（本地 `.env`，勿提交）

### 日常运维速查
- 本地改完 → `git add` / `commit` / `push` → 自动部署（几分钟生效）
- 后台 `/anan` 改内容 → Decap 提交 → 自动部署
- **查线上某功能是否生效**：`curl -sL https://diy365.cc/anan/ | grep -F 'idle-timeout'`（跟 308 重定向）；或隐身窗口实测
- **登录后台**：隐身窗口 + GitHub 2FA；白名单放行 `xuanqianye`
- **查是否被 Bing 收录**：Bing 搜 `site:diy365.cc`（robots.txt 已 Allow 所有爬虫 + 声明 sitemap，会自动收录）

### 备注：阅读量计数如需重做
1. Cloudflare 控制台 Pages 项目 → Settings → Functions → KV namespace bindings，建命名空间绑到变量名 `VIEW_KV`；
2. 重新部署一次让绑定生效；
3. 前端 `single.html` 阅读量显示逻辑此前已 revert，需重新加回（参考 `git log` 中 `b9039b0` 的反向变更）。
