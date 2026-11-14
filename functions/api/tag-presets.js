// ============================================================
// Cloudflare Pages Function — 标签预设读写（存于仓库 data/tag-presets.json）
// 路由：/api/tag-presets
//   GET  -> {"presets":[{name,tags}]}
//   POST -> {action:"save"|"delete", name, tags}
//
// 凭据来源（二选一，优先前者）：
//   1. 环境变量 GH_TOKEN / GH_REPO / GH_BRANCH（可选，旧方案）
//   2. 后台浏览器把 Decap 的 GitHub 登录态放在 X-GH-Token 请求头里
//      —— 编辑器已经登录 GitHub，无需再在 Cloudflare 配任何密钥。
// 写入走 GitHub Contents API，预设存在仓库里，跨设备共享。
// ============================================================

// 频率限制（CF 控制台 Rate Limiting 未覆盖 /api/*，这里做基本防护）
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
const DEFAULT_REPO = "xuanqianye/diy365";

function tokenOf(request, env) {
  return String(env.GH_TOKEN || request.headers.get("X-GH-Token") || "").trim();
}
function repoOf(env) { return String(env.GH_REPO || DEFAULT_REPO).trim(); }
function branchOf(env) { return String(env.GH_BRANCH || "main").trim(); }

function ghHeaders(request, env) {
  return {
    Authorization: `Bearer ${tokenOf(request, env)}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": "diy365-tag-presets"
  };
}
function sameSite(request) {
  const o = request.headers.get("Origin") || request.headers.get("Referer") || "";
  if (!o) return true;                       // curl / same-origin without Origin
  return /diy365/i.test(o) || /localhost|127\.0\.0\.1/i.test(o);
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function b64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function decodeB64(s) {
  const bin = atob(String(s).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// 读取当前预设文件 -> {presets, sha}
async function readPresets(request, env) {
  const url = `https://api.github.com/repos/${repoOf(env)}/contents/${DATA_PATH}?ref=${branchOf(env)}`;
  const r = await fetch(url, { headers: ghHeaders(request, env) });
  if (r.status === 404) return { presets: [], sha: null };
  if (!r.ok) throw new Error("GET data failed: " + r.status);
  const j = await r.json();
  let presets = [];
  try { presets = (JSON.parse(decodeB64(j.content))).presets || []; }
  catch (e) { presets = []; }
  return { presets, sha: j.sha };
}

// 写回预设文件（带 sha 做乐观并发；冲突时调用方负责重试）
async function writePresets(request, env, presets, sha) {
  const body = {
    message: "tag-presets: update",
    content: b64(JSON.stringify({ presets }, null, 2)),
    branch: branchOf(env)
  };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${repoOf(env)}/contents/${DATA_PATH}?ref=${branchOf(env)}`;
  return fetch(url, {
    method: "PUT",
    headers: ghHeaders(request, env),
    body: JSON.stringify(body)
  });
}

export async function onRequestGet({ request, env }) {
  if (!tokenOf(request, env)) {
    return json({ presets: [], error: "need_login" });
  }
  try {
    const { presets } = await readPresets(request, env);
    return json({ presets });
  } catch (e) {
    return json({ presets: [], error: e.message });
  }
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);
  if (!sameSite(request)) return json({ ok: false, error: "bad_origin" }, 403);
  if (!tokenOf(request, env)) return json({ ok: false, error: "need_login" }, 401);

  let body;
  try { body = await request.json(); }
  catch (e) { return json({ ok: false, error: "bad_json" }, 400); }
  const action = body && body.action;
  if (action !== "save" && action !== "delete") {
    return json({ ok: false, error: "bad_action" }, 400);
  }
  try {
    let { presets, sha } = await readPresets(request, env);
    const name = String((body && body.name) || "").trim();
    if (!name) return json({ ok: false, error: "empty_name" }, 400);
    if (action === "save") {
      const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
      const i = presets.findIndex(p => p.name === name);
      const rec = { name, tags };
      if (i >= 0) presets[i] = rec; else presets.push(rec);
    } else {
      presets = presets.filter(p => p.name !== name);
    }
    // 写回；若并发冲突(409)则重读一次再写
    let r = await writePresets(request, env, presets, sha);
    if (r.status === 409 && sha) {
      const cur = await readPresets(request, env);
      if (action === "save") {
        const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
        const i = cur.presets.findIndex(p => p.name === name);
        const rec = { name, tags };
        if (i >= 0) cur.presets[i] = rec; else cur.presets.push(rec);
        presets = cur.presets;
      } else {
        presets = cur.presets.filter(p => p.name !== name);
      }
      r = await writePresets(request, env, presets, cur.sha);
    }
    if (!r.ok) {
      const t = await r.text();
      return json({ ok: false, error: "gh_write_failed", detail: t.slice(0, 200) }, 502);
    }
    return json({ ok: true, presets });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
