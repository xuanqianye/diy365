// ============================================================================
// diy365-auth  Cloudflare Worker  ——  白名单版（安全加固备份，2026-11-13）
// 部署位置：Cloudflare 控制台 → Workers 和 Pages → diy365-auth → 代码 → 全选替换 → 部署
// 作用：Decap CMS（/anan）的 GitHub OAuth 代理，仅允许白名单内的 GitHub 账号拿到 token。
// 注意：GITHUB_CLIENT_SECRET 走 Worker 环境变量（env.GITHUB_CLIENT_SECRET），不要写死在代码里。
//       白名单默认 "xuanqianye"，可在 Worker 设置→变量 里加 ALLOWED_GITHUB_LOGIN 覆盖（逗号分隔）。
// 策略：fail-closed —— 若 GitHub API 取不到用户名，一律拒绝登录（临时去掉白名单再部署即可进）。
// ============================================================================

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var CLIENT_ID = "Ov23liLP7IRGMwtDriB4";
var PROVIDER = "github";

function parseCookies(str) {
  const out = {};
  (str || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
__name(parseCookies, "parseCookies");

// 白名单：只有列表内的 GitHub 账号才能拿到 token（双保险）
function isAllowed(login, env) {
  const raw = (env && env.ALLOWED_GITHUB_LOGIN) || "xuanqianye";
  const list = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes((login || "").toLowerCase());
}
__name(isAllowed, "isAllowed");

function html(body, extraHeaders = {}) {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' + body + "</body></html>",
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders }
    }
  );
}
__name(html, "html");

var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const baseOrigin = url.origin;
    const clientId = env.GITHUB_CLIENT_ID || CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET || "";
    const callbackUri = baseOrigin + "/callback";
    if (url.pathname === "/auth") {
      const state = crypto.randomUUID();
      const scope = url.searchParams.get("scope") || "repo";
      const ghUrl = "https://github.com/login/oauth/authorize?" + new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUri,
        response_type: "code",
        scope,
        state
      }).toString();
      const body = '<script>try { if (window.opener) window.opener.postMessage("authorizing:' + PROVIDER + '", "*"); } catch (e) {}setTimeout(function(){ window.location = ' + JSON.stringify(ghUrl) + "; }, 60);<\/script>";
      return html(body, {
        "Set-Cookie": "oauth_state=" + state + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600"
      });
    }
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const cookies = parseCookies(request.headers.get("Cookie") || "");
      if (!code || !state || state !== cookies.oauth_state) {
        return html(
          '<script>document.body.textContent="Login failed (invalid state).";if(window.opener){window.opener.postMessage("authorization:' + PROVIDER + ':error:invalid_state", "*");}window.close();<\/script>'
        );
      }
      const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUri
        })
      });
      const data = await tokenResp.json();
      const accessToken = data.access_token;
      if (!accessToken) {
        return html(
          '<script>document.body.textContent="Token exchange failed: ' + JSON.stringify(data).replace(/</g, "") + '";window.close();<\/script>'
        );
      }
      // ===== 白名单校验：只允许指定 GitHub 账号拿到 token =====
      let login = "";
      try {
        const userResp = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: "Bearer " + accessToken,
            Accept: "application/vnd.github+json",
            "User-Agent": "diy365-auth"
          }
        });
        const user = await userResp.json();
        login = user.login || "";
      } catch (e) {
        login = "";
      }
      if (!isAllowed(login, env)) {
        return html(
          '<script>document.body.textContent="账号 ' + (login || "未知") + ' 不在允许列表，已拒绝登录。";if(window.opener){window.opener.postMessage("authorization:' + PROVIDER + ':error:not_allowed", "*");}window.close();<\/script>'
        );
      }
      // ===== 白名单通过，把 token 发回 Decap =====
      const msg = "authorization:" + PROVIDER + ":success:" + JSON.stringify({ token: accessToken, provider: PROVIDER });
      const body = "<script>try { if (window.opener) window.opener.postMessage(" + JSON.stringify(msg) + ', "*"); } catch (e) {}window.close();<\/script>';
      return html(body, {
        "Set-Cookie": "oauth_state=; Path=/; Max-Age=0"
      });
    }
    return new Response("diy365-auth worker is alive", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
