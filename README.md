# Handmade — 英文钩针图解站（Hugo 静态站）

技术栈：Hugo 静态生成 + Decap CMS 后台 + 瀑布流主题 + Google AdSense + superbed 图床 + Cloudflare/Netlify 部署。

> 品牌名：Handmade（与域名 diy365.cc 搭配）。法律页内容已从原线上站备份至 `backup/diy365-cc/`。

---

## 1. 目录结构

```
diy365静态钩针图解站/
├── hugo.toml                 # 站点配置（品牌、AdSense、superbed 引用）
├── content/
│   ├── _index.md             # 首页
│   ├── patterns/             # 图解文章（每篇 = 一个 .md）
│   └── pages/                # 法律页 + 投稿/联系/DMCA 表单页
├── layouts/                  # 自定义模板（baseof/list/single/taxonomy + partials + shortcodes）
├── static/                   # 静态资源（css / admin / ads.txt / robots.txt）
│   ├── admin/                # Decap CMS（index.html + config.yml）
│   └── css/style.css         # 瀑布流 + 响应式样式
├── archetypes/patterns.md    # 新建图解的文章模板
├── functions/submit.js       # Cloudflare Pages Function（投稿后端）
├── netlify/functions/submit.js  # Netlify Function（同逻辑，可切换部署）
├── backup/diy365-cc/         # 原线上站法律页备份（markdown）
├── .env                      # 本地环境变量（superbed token，勿提交）
└── .github/workflows/        # 自动构建部署（待创建，见下）
```

---

## 2. 本地预览

需先安装 Hugo（extended 版）：https://gohugo.io/install/

```bash
cd diy365静态钩针图解站
hugo server -D        # -D 包含草稿（draft:true 的投稿）
# 打开 http://localhost:1313
```

生成静态文件：`hugo`（输出到 `public/`）。

---

## 3. 部署方式（可切换，互不锁定）

### A. Cloudflare Pages（推荐 · 零服务器 · 全球 CDN）
1. 把本项目推到 GitHub。
2. Cloudflare Pages 新建项目 → 连接仓库 → Framework: Hugo → Build: `hugo` → 输出 `public`。
3. 域名 diy365.cc 的 DNS 接入 Cloudflare，添加 CNAME 指向 Pages。
4. 环境变量（Pages → Settings → Environment）：`GH_TOKEN` / `GH_REPO` / `GH_BRANCH`（投稿后端用）。
5. 表单提交指向 `/submit`（Cloudflare 自动路由到 `functions/submit.js`）。

### B. Netlify（备选）
- 同样推 GitHub，Netlify 导入 → Build: `hugo`。
- 表单 action 改为 `/.netlify/functions/submit`。
- 环境变量同 A。

### C. 自有服务器（nginx + 静态）
- 服务器装 nginx，`hugo` 生成 `public/` → 上传到 `/www/wwwroot/diy365`（或宝塔站点目录）。
- 配置 nginx 根目录指向 `public/`，开启 HTTPS（Let's Encrypt / 宝塔免费证书）。
- 投稿后端需另跑一个无服务器函数（仍可用 Cloudflare/Netlify 仅托管函数，或服务器上起一个小服务）。

---

## 4. 投稿后端（不注册 + 后台审核）

流程：用户访问 `/submit` 填表 → 表单 POST 到 Function → 函数把投稿写成 `content/patterns/<slug>.md` 且 `draft: true` → 触发重新构建（草稿不公开）→ **管理员在 Decap CMS 把 draft 改为 false 即发布**。

配置（GitHub 侧）：
1. 建一个 GitHub Personal Access Token（classic，勾 `repo`/`contents:write`）。
2. 在托管平台设置环境变量：`GH_TOKEN`、`GH_REPO=你的用户名/仓库`、`GH_BRANCH=main`。
3. DMCA / 联系表单走同一端点（`form_type` 区分，分别写入 `content/_dmca/`、`content/_contact/`）。

---

## 5. Decap CMS 后台（`/admin`）

1. 在 GitHub 创建一个 **OAuth App**（Settings → Developer settings），Authorization callback URL 填 `https://你的域名/admin/`。
2. 把 `static/admin/config.yml` 里的 `repo` 改成你的仓库，并填入 `client_id`。
3. 访问 `https://你的域名/admin`，用 GitHub 登录即可可视化发文/审核。

---

## 6. 部署前必填配置清单

| 配置项 | 位置 | 说明 |
|---|---|---|
| AdSense Publisher ID | `hugo.toml` → `adsensePublisher` | 占位 `ca-pub-000...` 需替换；列表/帖子广告位 Slot 填 `adsenseSlotList` / `adsenseSlotPost` |
| ads.txt | `static/ads.txt` | 把 `pub-000...` 换成你真实的 publisher id |
| superbed token | `.env`（已存） | 图床上传用；图片在文章里以 URL 引用，不进仓库 |
| GitHub OAuth | `static/admin/config.yml` | client_id 必填 |
| 投稿函数环境变量 | 托管平台后台 | GH_TOKEN / GH_REPO / GH_BRANCH |
| 域名 DNS | Cloudflare / 域名商 | diy365.cc → 部署平台 |
| Search Console / Pinterest 验证 | `hugo.toml` | `googleVerification` / `pinterestVerification`（可选） |

---

## 7. 图床（superbed / 聚合图床）

- 图片原图传到 superbed，文章 `cover` / `pinImage` / 正文里只写 superbed 返回的 URL。
- 建议开 **自定义域名 + 镜像回源**（Basic 套餐起），避免被图床锁定、便于迁移。
- **务必自己留一份原图主控副本**（本地 + 一份 COS/B2），superbed 不是备份。
- 站点的 HTML/代码在 git 仓库，图片在 superbed，两个故障域分离：Cloudflare 被封不影响图片。

---

## 8. 法律页

`content/pages/` 下 8 页（Privacy / Terms / About / Disclaimer / Copyright Policy / User Agreement / Contact / Copyright Removal Request），正文已从原线上站 `diy365.cc` 备份至 `backup/diy365-cc/`，并已套用。

---

## 9. 安全提醒

- 服务器 root 密码、宝塔密码等敏感凭据**不要写入本项目任何文件**，也不要在聊天中明文传递。
- 部署到生产服务器前，先备份现有站点数据；覆盖运行中站点属于破坏性操作。
- `draft: true` 的投稿不会公开，必须经 Decap 审核改为 `false` 才发布。
