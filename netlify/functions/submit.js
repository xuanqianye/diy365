// ============================================================
// Netlify Function — 与 Cloudflare 版逻辑相同，仅入口格式不同
// 部署：netlify/functions/submit.js（Netlify 自动识别）
// 环境变量（Netlify → Site settings → Environment variables）：
//   GH_TOKEN / GH_REPO / GH_BRANCH
// 表单 action 指向 /.netlify/functions/submit
// ============================================================

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    const params = new URLSearchParams(event.body);
    const d = Object.fromEntries(params.entries());
    const type = d.form_type || "submission";
    const slug = slugify(d.title || "item-" + Date.now());
    let path, content;
    if (type === "submission") { path = `content/patterns/${slug}.md`; content = buildSubmission(d); }
    else if (type === "dmca") { path = `content/_dmca/${slug}.md`; content = buildDmca(d); }
    else { path = `content/_contact/${slug}.md`; content = buildContact(d); }
    const r = await writeToGitHub(process.env, path, content);
    if (!r.ok) { const t = await r.text(); return { statusCode: 502, body: "Failed: " + t.slice(0, 300) }; }
    return { statusCode: 200, body: "Thank you! Your submission is pending review." };
  } catch (e) { return { statusCode: 500, body: "Error: " + e.message }; }
};

function slugify(s) {
  return (s || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
}
function esc(s) { return (s || "").replace(/"/g, '\\"').replace(/\n/g, " "); }
function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }

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
