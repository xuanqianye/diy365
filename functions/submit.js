// ============================================================
// Cloudflare Pages Function — 处理投稿 / 联系 / DMCA 表单
// 部署：放到项目根 /functions/submit.js，Cloudflare Pages 自动识别
// 环境变量（CF Pages → Settings → Environment variables）：
//   GH_TOKEN   GitHub Personal Access Token（需 contents:write 权限）
//   GH_REPO    owner/repo  (例如 your-username/diy365)
//   GH_BRANCH  main
// 每次写入会触发 GitHub Actions 重新构建并部署（draft 投稿不会公开，待管理员审核）
// ============================================================

// --- 频率限制（同进程兜底；真正跨节点限流请在 Cloudflare 控制台 WAF → Rate Limiting Rules 对 /submit 配置）---
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 秒窗口
const RATE_LIMIT_MAX = 10;              // 同 IP 窗口内最多 10 次提交
const _rateHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = _rateHits.get(ip) || { start: now, count: 0 };
  if (now - rec.start > RATE_LIMIT_WINDOW_MS) { rec.start = now; rec.count = 0; }
  rec.count++;
  _rateHits.set(ip, rec);
  return rec.count > RATE_LIMIT_MAX;
}

export async function onRequestPost({ request, env }) {
  try {
    // 频率限制：同 IP 60 秒内最多 10 次，超限直接返回 429
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
    if (rateLimited(ip)) {
      return new Response("Too many requests, please try again later.", { status: 429 });
    }
    const form = await request.formData();
    const d = Object.fromEntries(form.entries());
    const type = form.get("form_type") || "submission";
    const slug = slugify(d.title || "item-" + Date.now());
    let path, content;
    if (type === "submission") {
      path = `content/patterns/${slug}.md`;
      content = buildSubmission(d);
    } else if (type === "dmca") {
      path = `content/_dmca/${slug}.md`;
      content = buildDmca(d);
    } else {
      path = `content/_contact/${slug}.md`;
      content = buildContact(d);
    }
    const r = await writeToGitHub(env, path, content);
    if (!r.ok) {
      const t = await r.text();
      return new Response("Submit failed: " + t.slice(0, 300), { status: 502 });
    }
    const msg = type === "submission"
      ? "Thank you! Your pattern is pending review."
      : "Thank you! We have received your message.";
    return new Response(msg, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (e) {
    return new Response("Error: " + e.message, { status: 500 });
  }
}

function slugify(s) {
  return (s || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
}
function esc(s) { return (s || "").replace(/"/g, '\\"').replace(/\n/g, " "); }
function b64(s) {
  return typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, "utf8").toString("base64");
}

function buildSubmission(d) {
  const now = new Date().toISOString().slice(0, 10);
  const imgs = (d.images || "").split("\n").map(x => x.trim()).filter(Boolean);
  const cover = imgs[0] || "";
  const imgMd = imgs.map(u => `![step](${u})`).join("\n\n");
  return `---\ntitle: "${esc(d.title)}"\ndescription: "${esc(d.description || "")}"\ndate: ${now}\ndraft: true\ncategories: [${d.category ? `"${esc(d.category)}"` : ""}]\ntags: []\ndifficulty: "${d.difficulty || "Easy"}"\nyarn: ""\nhook: ""\nsize: ""\npdf: ""\ncover: "${cover}"\npinImage: ""\nauthor: "Handmade"\nsubmittedBy: "${esc(d.name || "")}"\n---\n\n## Materials\n\n## Pattern\n\n${d.steps || ""}\n\n${imgMd}\n`;
}
function buildDmca(d) {
  return `# DMCA Removal Request\n\n- Name: ${d.name}\n- Address: ${d.address}\n- Phone: ${d.phone}\n- Email: ${d.email}\n- Copyrighted work: ${d.work}\n- Infringing URL(s): ${d.infringing}\n- Good faith: ${d.goodfaith}\n- Accuracy: ${d.accuracy}\n- Signature: ${d.signature}\n`;
}
function buildContact(d) {
  return `# Contact\n\n- Name: ${d.name}\n- Email: ${d.email}\n- Subject: ${d.subject || ""}\n- Message: ${d.message}\n`;
}
async function writeToGitHub(env, path, content) {
  const branch = env.GH_BRANCH || "main";
  const url = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}?ref=${branch}`;
  const body = JSON.stringify({ message: `submit: ${path}`, content: b64(content), branch });
  return fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json"
    },
    body
  });
}
