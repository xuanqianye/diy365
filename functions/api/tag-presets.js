// ============================================================
// Cloudflare Pages Function — 标签预设读写（存于仓库 data/tag-presets.json）
// 路由：/api/tag-presets
//   GET  -> 返回当前预设列表 {"presets":[{name,tags}]}
//   POST -> 修改预设，body(JSON)：
//            {action:"save",   name, tags}   新增/覆盖一个预设
//            {action:"delete", name}         删除一个预设
// 复用 submit.js 的 GitHub 环境变量（项目级，所有 Function 共享）：
//   GH_TOKEN  （contents:write）
//   GH_REPO   owner/repo
//   GH_BRANCH main
// 写入会触发 GitHub Actions 重新构建（仅改 data 文件，不影响前台内容）。
// ============================================================

// 频率限制（同进程兜底；CF 控制台 Rate Limiting 规则未覆盖 /api/*，这里做基本防护）
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const _rateHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = _rateHits.get(ip) || { start: now, count: 0 };
  if (now - rec.start > RATE_LIMIT_WINDOW_MS) { rec.start = now; rec.count = 0; }
  rec.count++;
  _rateHits.set(ip, rec);
  return rec.count > RATE_LIMIT_MAX;
}

const DATA_PATH = "data/tag-presets.json";

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json"
  };
}
function b64(s) {
  return typeof btoa !== "undefined"
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, "utf8").toString("base64");
}

// 读取当前预设文件 -> {presets, sha}
async function readPresets(env) {
  const branch = env.GH_BRANCH || "main";
  const url = `https://api.github.com/repos/${env.GH_REPO}/contents/${DATA_PATH}?ref=${branch}`;
  const r = await fetch(url, { headers: ghHeaders(env) });
  if (r.status === 404) return { presets: [], sha: null };
  if (!r.ok) throw new Error("GET data failed: " + r.status);
  const j = await r.json();
  let presets = [];
  try {
    presets = (JSON.parse(Buffer.from(j.content, "base64").toString("utf8"))).presets || [];
  } catch (e) { presets = []; }
  return { presets, sha: j.sha };
}

// 写回预设文件（带 sha 做乐观并发；冲突时调用方负责重试）
async function writePresets(env, presets, sha) {
  const branch = env.GH_BRANCH || "main";
  const content = b64(JSON.stringify({ presets }, null, 2));
  const body = { message: "tag-presets: update", content, branch };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${env.GH_REPO}/contents/${DATA_PATH}?ref=${branch}`;
  return fetch(url, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(body) });
}

export async function onRequestGet({ env }) {
  if (!env.GH_TOKEN || !env.GH_REPO) {
    return new Response(JSON.stringify({ presets: [], error: "not_configured" }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const { presets } = await readPresets(env);
    return new Response(JSON.stringify({ presets }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ presets: [], error: e.message }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
      status: 429, headers: { "Content-Type": "application/json" }
    });
  }
  if (!env.GH_TOKEN || !env.GH_REPO) {
    return new Response(JSON.stringify({ ok: false, error: "not_configured" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: "bad_json" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }
  const action = body && body.action;
  if (action !== "save" && action !== "delete") {
    return new Response(JSON.stringify({ ok: false, error: "bad_action" }), {
      status: 400, headers: { "Content-Type": "application/json" }
    });
  }
  try {
    let { presets, sha } = await readPresets(env);
    if (action === "save") {
      const name = (body.name || "").trim();
      if (!name) return new Response(JSON.stringify({ ok: false, error: "empty_name" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
      const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
      const i = presets.findIndex(p => p.name === name);
      const rec = { name, tags };
      if (i >= 0) presets[i] = rec; else presets.push(rec);
    } else if (action === "delete") {
      const name = (body.name || "").trim();
      presets = presets.filter(p => p.name !== name);
    }
    // 写回；若并发冲突(409)则重读一次再写
    let r = await writePresets(env, presets, sha);
    if (r.status === 409 && sha) {
      const cur = await readPresets(env);
      if (action === "save") {
        const name = (body.name || "").trim();
        const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
        const i = cur.presets.findIndex(p => p.name === name);
        const rec = { name, tags };
        if (i >= 0) cur.presets[i] = rec; else cur.presets.push(rec);
        presets = cur.presets;
      } else {
        const name = (body.name || "").trim();
        presets = cur.presets.filter(p => p.name !== name);
      }
      r = await writePresets(env, presets, cur.sha);
    }
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ ok: false, error: "gh_write_failed", detail: t.slice(0, 200) }), {
        status: 502, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true, presets }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
}
