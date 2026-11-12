#!/usr/bin/env node
/*
 * IndexNow proactive push for diy365 (Hugo static site on Cloudflare).
 *
 * After `hugo --minify --gc` (and ideally after `wrangler deploy`), run this to
 * notify Bing / Yandex / Seznam / others that the URLs in sitemap.xml exist and
 * should be (re)crawled. The key file `static/<key>.txt` is served at the site
 * root so search engines can verify ownership of the push.
 *
 * Usage:
 *   node scripts/indexnow-push.mjs            # read key from data/seo.json, push all sitemap URLs
 *   node scripts/indexnow-push.mjs --dry      # print the payload without sending
 *
 * Env overrides (optional):
 *   INDEXNOW_KEY            override the key
 *   INDEXNOW_KEY_LOCATION   override the key file URL
 *   SITEMAP                 path to sitemap.xml (default: public/sitemap.xml)
 *   INDEXNOW_ENDPOINT       default https://api.indexnow.org/indexnow
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

const dry = process.argv.includes('--dry');
const sitemapPath = process.env.SITEMAP || resolve(root, 'public/sitemap.xml');
const endpoint = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';

function fail(msg) {
  console.error('[indexnow] ' + msg);
  process.exit(1);
}

if (!existsSync(sitemapPath)) {
  fail('sitemap not found at ' + sitemapPath + ' — run `hugo --minify --gc` first.');
}

// --- Key: env > data/seo.json > scan static/<hex>.txt ---
let key = process.env.INDEXNOW_KEY || '';
let keyLocation = process.env.INDEXNOW_KEY_LOCATION || '';
const seoPath = resolve(root, 'data/seo.json');
if ((!key || !keyLocation) && existsSync(seoPath)) {
  try {
    const seo = JSON.parse(readFileSync(seoPath, 'utf8'));
    if (!key && seo.indexNowKey) key = seo.indexNowKey;
    if (!keyLocation && seo.indexNowKeyLocation) keyLocation = seo.indexNowKeyLocation;
  } catch (e) { /* ignore */ }
}
if (!keyLocation) {
  // fall back to scanning static/ for a <32hex>.txt key file
  const fs = await import('node:fs');
  const files = fs.readdirSync(resolve(root, 'static'));
  const hit = files.find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (hit) keyLocation = 'https://diy365.cc/' + hit;
  if (!key && hit) key = readFileSync(resolve(root, 'static', hit), 'utf8').trim();
}
if (!key || !keyLocation) fail('could not determine IndexNow key / keyLocation.');

// --- Parse URLs from sitemap ---
const xml = readFileSync(sitemapPath, 'utf8');
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean);
if (!urls.length) fail('no <loc> URLs found in sitemap.');

const host = keyLocation.replace(/^https?:\/\//, '').split('/')[0];

const payload = {
  host,
  key,
  keyLocation,
  urlList: urls,
};

console.log('[indexnow] host=' + host + ' urls=' + urls.length + ' keyLocation=' + keyLocation);
if (dry) {
  console.log('[indexnow] DRY RUN — payload:');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

try {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log('[indexnow] HTTP ' + res.status + ' ' + res.statusText);
  if (body) console.log(body.slice(0, 500));
  if (res.status >= 400) process.exit(1);
  console.log('[indexnow] OK — ' + urls.length + ' URLs submitted.');
} catch (e) {
  fail('request failed: ' + e.message);
}
