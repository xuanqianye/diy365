/* ============================================================
   DIY365 submission backend (Cloudflare Worker + KV)
   - No secret needed to receive submissions: stored in KV, Markdown via /list
   - Optional GH_TOKEN also pushes a draft:true md file to GitHub
   - /captcha issues an HMAC token; submit verifies signature, answer, one-time use, TTL
   - Anti-spam: honeypot + max 3 submissions per IP per 10 minutes
   Routes:
     GET  /captcha[?reveal=1&key=ADMIN_KEY]   issue verification (reveal = admin self-test)
     POST /submit   accept form (urlencoded / multipart / json)
     GET  /list?key=...   admin: list submissions (HTML, legacy)
     GET  /delete?key=...&id=...   admin: delete one entry (HTML, legacy)
     GET  /admin/list?key=...   admin: list submissions (JSON, CMS panel)
     GET  /admin/delete?key=...&id=...   admin: delete one entry (JSON, CMS panel)
   ============================================================ */

const SITE = 'https://diy365.cc';
const MAX_IMAGES = 60;
const CAPTCHA_TTL = 5 * 60 * 1000;
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 3;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function yamlStr(s) {
  return '"' + String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ').slice(0, 400) + '"';
}
function slugify(s) {
  return (s || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/* ---------- verification ---------- */
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function b64url(s) { return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlBytes(buf) { return b64url(String.fromCharCode.apply(null, new Uint8Array(buf))); }

async function digest(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64urlBytes(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}
async function sha256(s) {
  return b64urlBytes(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function noiseChar() {
  return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rnd(0, 31)];
}
function captchaSvg(expr) {
  let real = '';
  expr.split('').forEach((ch, i) => {
    const x = 20 + i * 28 + rnd(-3, 3), y = 41 + rnd(-5, 5), rot = rnd(-16, 16);
    const color = ['#2d2a2e', '#c2536f', '#3a6d8c', '#8a5a00', '#2d2a2e'][i % 5];
    real += `<text x="${x}" y="${y}" font-size="25" font-family="monospace" font-weight="700" fill="${color}" transform="rotate(${rot} ${x} ${y})">${esc(ch)}</text>`;
  });
  let noise = '', lines = '';
  for (let i = 0; i < 16; i++) {
    noise += `<text x="${rnd(4, 220)}" y="${rnd(12, 56)}" font-size="${rnd(9, 15)}" fill="#e9ded9" font-family="monospace">${noiseChar()}</text>`;
  }
  for (let i = 0; i < 5; i++) {
    lines += `<line x1="${rnd(0, 230)}" y1="${rnd(4, 58)}" x2="${rnd(0, 230)}" y2="${rnd(4, 58)}" stroke="#f0e3e0" stroke-width="1.4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="60" viewBox="0 0 230 60"><rect width="230" height="60" rx="8" fill="#fffaf7"/>${lines}${noise}${real}</svg>`;
}
async function issueCaptcha(env) {
  const a = rnd(2, 9), b = rnd(2, 9), ans = a + b;
  const expr = `${a} + ${b} = ?`;
  const payload = b64url(JSON.stringify({
    exp: Date.now() + CAPTCHA_TTL,
    ans: await sha256(String(ans)),
    n: b64urlBytes(crypto.getRandomValues(new Uint8Array(12)))
  }));
  const token = payload + '.' + await digest(env.CAPTCHA_SECRET, payload);
  return { svg: captchaSvg(expr), token, answer: String(ans) };
}
async function verifyCaptcha(env, token, answer) {
  if (!token || !answer) return 'Please complete the verification';
  const parts = String(token).split('.');
  if (parts.length !== 2) return 'Invalid verification';
  const expect = await digest(env.CAPTCHA_SECRET, parts[0]);
  if (expect !== parts[1]) return 'Verification failed';
  let o;
  try { o = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch (e) { return 'Invalid verification'; }
  if (!o || Date.now() > o.exp) return 'Verification expired. Click "New question".';
  if ((await sha256(String(answer).trim())) !== o.ans) return 'Incorrect answer';
  if (await env.SUBMISSIONS.get('used:' + o.n)) return 'This verification was already used. Click "New question".';
  await env.SUBMISSIONS.put('used:' + o.n, '1', { expirationTtl: 600 });
  return null;
}

/* ---------- content builders ---------- */
function buildSubmission(d) {
  // Asia/Shanghai is a fixed UTC+8 (no DST). toISOString() alone would report
  // yesterday's date for submissions made between 00:00 and 08:00 Beijing time.
  const now = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const imgs = String(d.images || '').split(/\r?\n/).map(x => x.trim())
    .filter(u => /^https?:\/\//i.test(u)).slice(0, MAX_IMAGES);
  const cover = imgs[0] || '';
  const pins = imgs.slice(1);
  const cat = String(d.category || '').trim();

  let fm = '---\n';
  fm += 'title: ' + yamlStr(d.title) + '\n';
  fm += 'description: ' + yamlStr(d.description) + '\n';
  fm += 'date: ' + now + '\ndraft: true\n';
  fm += 'categories: [' + (cat ? yamlStr(cat) : '') + ']\ntags: []\n';
  fm += 'difficulty: ' + yamlStr(d.difficulty || 'Easy') + '\n';
  fm += 'yarn: ""\nhook: ""\nsize: ""\npdf: ""\n';
  fm += 'cover: ' + (cover ? '\n  - ' + cover : '""') + '\n';
  fm += 'pinImage: ' + (pins.length ? '\n' + pins.map(u => '  - ' + u).join('\n') : '""') + '\n';
  fm += 'author: "Handmade"\nsubmittedBy: ' + yamlStr(d.name) + '\n---\n\n';
  fm += '## Materials\n\n## Pattern\n\n' + String(d.steps || '').slice(0, 20000) + '\n';
  return fm;
}
function buildContact(d) {
  return `# Contact\n\n- Name: ${d.name || ''}\n- Email: ${d.email || ''}\n- Subject: ${d.subject || ''}\n- Message: ${d.message || ''}\n`;
}
function buildDmca(d) {
  return `# DMCA Removal Request\n\n- Name: ${d.name || ''}\n- Address: ${d.address || ''}\n- Phone: ${d.phone || ''}\n- Email: ${d.email || ''}\n- Work: ${d.work || ''}\n- Infringing URL(s): ${d.infringing || ''}\n- Good faith: ${d.goodfaith || ''}\n- Accuracy: ${d.accuracy || ''}\n- Signature: ${d.signature || ''}\n`;
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({}, cors, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    })
  });
}

function page(title, body, status) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>
body{margin:0;background:#fffaf7;color:#2d2a2e;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:640px;margin:8vh auto;padding:28px;background:#fff;border:1px solid #f0e3e0;border-radius:18px;box-shadow:0 12px 34px rgba(45,42,46,.08)}
h1{font-size:1.4rem;margin:0 0 12px}a{color:#c2536f}.btn{display:inline-block;margin-top:18px;padding:10px 20px;background:#d96b86;color:#fff;border-radius:999px;text-decoration:none;font-weight:700}
pre{white-space:pre-wrap;word-break:break-word;background:#faf5ef;padding:12px;border-radius:10px;font-size:12px}
small{color:#8a8288}</style></head><body><div class="wrap">${body}</div></body></html>`,
    { status: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors } });
}
function fail(msg) {
  return page('Check', `<h1>Submission not completed</h1><p>${esc(msg)}</p><p><a class="btn" href="${SITE}/submit/">Back to the form</a></p>`, 400);
}

async function parseBody(request) {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await request.json();
  if (ct.includes('multipart/form-data')) return Object.fromEntries((await request.formData()).entries());
  return Object.fromEntries(new URLSearchParams(await request.text()));
}

async function writeToGitHub(env, path, content) {
  const branch = env.GH_BRANCH || 'main';
  const repo = env.GH_REPO || 'xuanqianye/diy365';
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;
  const b64 = btoa(unescape(encodeURIComponent(content)));
  return fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`, 'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json', 'User-Agent': 'diy365-submit'
    },
    body: JSON.stringify({ message: `submission: ${path}`, content: b64, branch })
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* ---------- issue verification ---------- */
    if (request.method === 'GET' && url.pathname === '/captcha') {
      const c = await issueCaptcha(env);
      const body = { svg: c.svg, token: c.token };
      // answer is returned only with the admin key (end-to-end self-test)
      if (url.searchParams.get('reveal') === '1' && url.searchParams.get('key') === env.ADMIN_KEY) {
        body.answer = c.answer;
      }
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }
      });
    }

    /* ---------- accept submission ---------- */
    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/submit')) {
      let d;
      try { d = await parseBody(request); }
      catch (e) { return fail('Could not read the form data'); }

      if (d.website) return page('Received', '<h1>Thank you</h1><p>Your submission has been recorded.</p>' +
        `<p><a class="btn" href="${SITE}/">Back to the site</a></p>`);

      // per-IP rate limit (3 per 10 minutes)
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const bucket = Math.floor(Date.now() / RATE_WINDOW);
      const rateKey = `rate:${ip}:${bucket}`;
      const used = parseInt((await env.SUBMISSIONS.get(rateKey)) || '0', 10);
      if (used >= RATE_MAX) return fail('Too many submissions. Please try again in 10 minutes.');
      await env.SUBMISSIONS.put(rateKey, String(used + 1), { expirationTtl: 900 });

      const type = d.form_type || 'submission';
      // pattern form requires verification; contact / DMCA rely on honeypot + rate limit
      if (type === 'submission') {
        const captchaErr = await verifyCaptcha(env, d.captcha_token, d.captcha_answer);
        if (captchaErr) return fail(captchaErr);
      }

      if (type === 'submission' && (!d.title || !d.images)) return fail('Please provide a title and upload at least one image.');

      const slug = slugify(d.title || (d.name || 'msg') + '-' + Date.now());
      const md = type === 'submission' ? buildSubmission(d)
        : type === 'dmca' ? buildDmca(d) : buildContact(d);
      const id = `${Date.now()}-${slug}`;
      const record = {
        id, type, createdAt: new Date().toISOString(),
        title: String(d.title || d.subject || type).slice(0, 160),
        name: String(d.name || '').slice(0, 120),
        email: String(d.email || '').slice(0, 160), md, github: null
      };

      if (env.GH_TOKEN && type === 'submission') {
        try {
          const r = await writeToGitHub(env, `content/patterns/${slug}.md`, md);
          record.github = r.ok ? 'ok' : ('failed:' + r.status);
        } catch (e) { record.github = 'error:' + e.message; }
      }

      try { await env.SUBMISSIONS.put('sub:' + id, JSON.stringify(record)); }
      catch (e) { return fail('Storage is temporarily unavailable. Please try again later: ' + e.message); }

      // Per-form-type confirmation copy. A DMCA notice is never a pattern
      // submission, so it must never say "your pattern is pending review".
      if (type === 'dmca') {
        return page('Submission successful',
          '<h1>Submission successful!</h1>' +
          '<p>We will process your copyright removal request promptly. Any infringing content will be removed in a timely manner.</p>' +
          `<p><a class="btn" href="${SITE}/">Back to the site</a></p>`);
      }
      if (type === 'contact') {
        return page('Message received',
          '<h1>Thank you!</h1>' +
          '<p>We have received your message and will get back to you soon.</p>' +
          `<p><a class="btn" href="${SITE}/">Back to the site</a></p>`);
      }
      return page('Submitted', '<h1>Thank you!</h1>' +
        '<p>Your pattern is now <b>pending review</b> and will be published once a moderator approves it.</p>' +
        `<p><a class="btn" href="${SITE}/submit/">Submit another</a> &nbsp; <a href="${SITE}/">Back to the site</a></p>`);
    }

    /* ---------- admin ---------- */
    /* JSON API consumed by the embedded review panel inside /anan/.
       Legacy HTML endpoints below are kept for existing bookmarks. */
    if (url.pathname === '/admin/list') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return json({ ok: false, error: 'Invalid admin key' }, 403);
      }
      const listing = await env.SUBMISSIONS.list({ prefix: 'sub:', limit: 100 });
      const items = [];
      for (const k of listing.keys.slice().reverse()) {
        const raw = await env.SUBMISSIONS.get(k.name);
        if (!raw) continue;
        try {
          const r = JSON.parse(raw);
          items.push({
            id: k.name, createdAt: r.createdAt || '', type: r.type || '',
            title: r.title || '', name: r.name || '', email: r.email || '',
            md: r.md || '', github: r.github || null
          });
        } catch (e) { /* skip malformed record */ }
      }
      return json({ ok: true, count: items.length, items: items });
    }
    if (url.pathname === '/admin/delete') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return json({ ok: false, error: 'Invalid admin key' }, 403);
      }
      const id = url.searchParams.get('id') || '';
      if (!id.startsWith('sub:')) return json({ ok: false, error: 'Invalid id' }, 400);
      await env.SUBMISSIONS.delete(id);
      return json({ ok: true, deleted: id });
    }

    if (request.method === 'GET' && url.pathname === '/list') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
      const keys = await env.SUBMISSIONS.list({ prefix: 'sub:', limit: 100 });
      const rows = [];
      for (const k of keys.keys.slice().reverse()) {
        const raw = await env.SUBMISSIONS.get(k.name);
        if (!raw) continue;
        const r = JSON.parse(raw);
        rows.push(`<details><summary>${esc(r.createdAt)} · ${esc(r.type)} · ${esc(r.title)} · ${esc(r.name)}</summary>
<p><small>${esc(r.email)} · ${esc(r.github || 'KV only')}</small></p><pre>${esc(r.md)}</pre>
<a href="/delete?key=${encodeURIComponent(env.ADMIN_KEY)}&id=${encodeURIComponent(k.name)}">Delete this entry</a></details>`);
      }
      return page('Submissions', '<h1>Submissions (latest 100)</h1>' +
        '<p><small>Copy the Markdown below into the Decap CMS or content/patterns/ to publish.</small></p>' +
        (rows.join('') || '<p>No submissions yet.</p>'));
    }
    if (request.method === 'GET' && url.pathname === '/delete') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
      const id = url.searchParams.get('id') || '';
      if (id.startsWith('sub:')) await env.SUBMISSIONS.delete(id);
      return page('Deleted', '<h1>Deleted</h1><p><a class="btn" href="/list?key=' +
        encodeURIComponent(env.ADMIN_KEY) + '">Back to the list</a></p>');
    }

    // admin-only: clear self-test records and rate-limit counters
    if (request.method === 'GET' && url.pathname === '/cleanup') {
      if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
        return new Response('Forbidden', { status: 403, headers: cors });
      }
      const all = await env.SUBMISSIONS.list({ limit: 1000 });
      let n = 0;
      for (const k of all.keys) {
        if (/^(rate|used):/.test(k.name) || /wb-selftest/i.test(k.name)) {
          await env.SUBMISSIONS.delete(k.name); n++;
        }
      }
      return new Response('cleaned ' + n + ' keys', { headers: cors });
    }

    return page('DIY365 Submit', '<h1>DIY365 Submission API</h1>' +
      '<p>Handles pattern, contact and DMCA submissions from diy365.cc, with server-side verification and rate limiting. Records are stored in KV.</p>');
  }
};
