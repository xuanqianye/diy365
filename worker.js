// Cloudflare Worker entry for diy365.
// - Serves the Hugo static site via env.ASSETS (bound by [assets] in wrangler.toml).
// - Proxies image uploads to Superbed at /api/superbed-upload so the Superbed
//   token stays server-side (set with: wrangler secret put SUPERBED_TOKEN).
//   The browser calls only this same-origin endpoint.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/superbed-upload') {
      if (request.method !== 'POST') {
        return json({ error: 'Method Not Allowed' }, 405);
      }
      try {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') {
          return json({ error: 'no file provided' }, 400);
        }
        const fd = new FormData();
        fd.append('file', file, file.name || 'image.jpg');

        // Superbed authenticates via the X-API-Key header (not a form field).
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        let upstream;
        try {
          upstream = await fetch('https://api.superbed.cn/upload', {
            method: 'POST',
            headers: { 'X-API-Key': env.SUPERBED_TOKEN || '' },
            body: fd,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const text = await upstream.text();

        let urlOut = null;
        try {
          const j = JSON.parse(text);
          urlOut =
            (j && j.data && j.data.url) ||
            (j && j.url) ||
            (j && j.data && j.data.url) ||
            (j && j.src) ||
            null;
          if (urlOut && typeof urlOut === 'object') urlOut = urlOut.url;
        } catch (_) { /* not JSON */ }
        if (!urlOut) {
          const m = text.match(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif|bmp)/i);
          urlOut = m ? m[0] : null;
        }
        if (!urlOut) {
          return json({ error: 'superbed upload failed', upstream: text.slice(0, 400) }, 502);
        }
        return json({ url: urlOut }, 200);
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 500);
      }
    }

    // All other requests -> static site (Hugo output in ./public)
    return env.ASSETS.fetch(request);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
