// ============================================================
// Cloudflare Pages Function — 文章阅读量计数（按 IP 当天去重）
// 路由：/api/view  （functions/api/view.js 自动识别）
//
// 去重规则：同一个 IP + 同一篇文章 + 同一个「上海时间自然日」只 +1。
//   - 当天内反复刷新 / 多次打开：不计重复。
//   - 隔天再访问：再 +1。
//   - 不同 IP：各算各的。
//
// 存储：Cloudflare KV，绑定名 VIEW_KV（在 Cloudflare 控制台
//       Pages 项目 → Settings → Functions → KV namespace bindings 里创建并绑定）。
//   键结构：
//     count:<path>                  -> 总阅读量（整数，持久）
//     seen:<path>:<YYYY-MM-DD>:<ipHash> -> "1"，TTL 到当天上海午夜自动过期
//
// 降级：若未绑定 VIEW_KV，返回 { count: null, disabled: true }，前端显示「—」，不影响页面。
//
// 接口：
//   POST /api/view  { "path": "/patterns/xxx/" }  -> 记录一次（去重后）+ 返回最新 count
//   GET  /api/view?path=/patterns/xxx/            -> 仅读取 count，不记录
// ============================================================

const TZ = "Asia/Shanghai";

// 常见爬虫 UA，直接读 count 不计数，避免机器人刷高阅读量
const BOT_RE = /bot|crawler|spider|crawl|curl|wget|facebookexternalhit|slurp|baiduspider|googlebot|bingbot/i;

function getClientIp(request) {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "0.0.0.0";
}

// 上海时区日期 YYYY-MM-DD
function shanghaiDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}`;
}

// 到「上海时间当天 24:00」的剩余秒数（用于 seen 键 TTL）
function secondsUntilShanghaiMidnight(d = new Date()) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  const next = new Date(local);
  next.setDate(local.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(60, Math.floor((next - local) / 1000));
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function extractPath(request, url) {
  let path = url.searchParams.get("path") || url.searchParams.get("slug") || "";
  if (!path && request.method === "POST") {
    try {
      const ct = request.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await request.json();
        path = body.path || body.slug || "";
      } else {
        const form = await request.formData();
        path = form.get("path") || form.get("slug") || "";
      }
    } catch (_) { /* ignore */ }
  }
  path = (path || "").trim();
  // 只接受以 / 开头的站内路径，避免被滥用写入任意键
  if (!path.startsWith("/")) return "";
  return path.slice(0, 300);
}

async function readCount(kv, path) {
  const v = await kv.get("count:" + path);
  return v ? parseInt(v, 10) || 0 : 0;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const path = await extractPath(request, url);
  if (!path) return json({ error: "missing path" }, 400);
  if (!env.VIEW_KV) return json({ count: null, disabled: true });
  return json({ count: await readCount(env.VIEW_KV, path) });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const path = await extractPath(request, url);
  if (!path) return json({ error: "missing path" }, 400);

  const kv = env.VIEW_KV;
  if (!kv) return json({ count: null, disabled: true });

  // 爬虫 / 预览器：只读不计数
  const ua = request.headers.get("user-agent") || "";
  if (BOT_RE.test(ua)) {
    return json({ count: await readCount(kv, path), bot: true });
  }

  const ip = getClientIp(request);
  const ipHash = await sha256Hex(ip);
  const date = shanghaiDate();
  const seenKey = `seen:${path}:${date}:${ipHash}`;

  // 当天该 IP 已计过 -> 直接返回当前值，不再 +1
  if (await kv.get(seenKey)) {
    return json({ count: await readCount(kv, path) });
  }

  // 未计过 -> 累加，并写入「已计」标记（TTL 到当天上海午夜）
  const count = (await readCount(kv, path)) + 1;
  await kv.put("count:" + path, String(count));
  await kv.put(seenKey, "1", { expirationTtl: secondsUntilShanghaiMidnight() });
  return json({ count });
}
