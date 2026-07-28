// check-listings.js - re-check stored pass-in listings and mark each one
// available / under_offer / sold / removed, so the map stops sending users to
// dead listings. Writes status + statusAt back into the Supabase app_data row.
//
// WHY THIS RUNS HERE (not in the Supabase cron like the scrape): Domain's
// individual listing pages serve a bot-challenge stub (~2.6KB, no data) to
// datacenter IPs, even with a full browser header set - verified from the edge
// function on 28 Jul 2026. A residential IP gets the real 468KB page. So the
// status check must originate from a residential connection. It is BEST-EFFORT:
// the core weekly scrape runs in the cloud and is unaffected; if this doesn't
// run, statuses just go stale and nothing breaks.
//
//   node scripts/check-listings.js                 # check a batch, write back
//   node scripts/check-listings.js --batch=200      # bigger batch
//   node scripts/check-listings.js --dry            # classify + report, no write
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BATCH = +arg('batch', 160), CONC = +arg('conc', 4), DRY = argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = new Set(['sold', 'removed']);

const FULL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none',
  'sec-fetch-user': '?1', 'upgrade-insecure-requests': '1',
};

function readEnv() {
  const p = path.join(ROOT, '.passd-backend.env');
  if (!fs.existsSync(p)) return null;
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const KNOWN = new Set(['LIVE', 'NEW', 'CURRENT', 'ON_MARKET', 'SOLD', 'UNDER_OFFER', 'WITHDRAWN', 'OFF_MARKET', 'OFFMARKET', 'LEASED']);
function statusFromNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  let json; try { json = JSON.parse(m[1]); } catch { return null; }
  let found = null;
  const walk = (o, depth) => {
    if (found || !o || typeof o !== 'object' || depth > 7) return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'status' && typeof v === 'string' && KNOWN.has(v.toUpperCase())) { found = v.toUpperCase(); return; }
      if (v && typeof v === 'object') walk(v, depth + 1);
      if (found) return;
    }
  };
  walk(json, 0);
  return found;
}

// Map an outcome to a status, or null = "leave unchanged" (never downgrade on a
// soft failure; never mark removed without a hard 404/410 or explicit off-market).
function classify(http, token) {
  if (http === 404 || http === 410) return 'removed';
  if (http !== 200 || !token) return null;
  switch (token) {
    case 'SOLD': return 'sold';
    case 'UNDER_OFFER': return 'under_offer';
    case 'LIVE': case 'NEW': case 'CURRENT': case 'ON_MARKET': return 'available';
    case 'WITHDRAWN': case 'OFF_MARKET': case 'OFFMARKET': case 'LEASED': return 'removed';
    default: return null;
  }
}

// Returns { verdict, conclusive }. conclusive=false for a bot-challenge stub,
// 403/5xx, or timeout - those are transient, so the caller leaves statusAt alone
// and the row is retried on the next run instead of being parked for a full cycle.
async function checkOne(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: FULL_HEADERS, redirect: 'follow', signal: ctrl.signal });
    if (r.status === 404 || r.status === 410) { try { await r.body?.cancel(); } catch {} return { verdict: 'removed', conclusive: true }; }
    if (r.status !== 200) { try { await r.body?.cancel(); } catch {} return { verdict: null, conclusive: false }; } // 403/5xx -> transient
    const html = await r.text();
    if (html.length < 5000) return { verdict: null, conclusive: false, blocked: true }; // bot-challenge stub -> retry later
    return { verdict: classify(200, statusFromNextData(html)), conclusive: true }; // real page (token or not) -> checked
  } catch { return { verdict: null, conclusive: false }; } // timeout / network -> transient
  finally { clearTimeout(timer); }
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k]); }
  }));
}

(async () => {
  const env = readEnv();
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.log('check-listings: .passd-backend.env not configured - skipping'); return; }
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const hdr = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };

  const rowRes = await fetch(base + "/rest/v1/app_data?key=eq.passed_in&select=payload,generated", { headers: hdr });
  const rows = await rowRes.json();
  if (!Array.isArray(rows) || !rows[0]) { console.error('check-listings: could not read app_data'); process.exit(1); }
  const payload = rows[0].payload;
  const props = payload.properties || [];

  // Stalest first: never-checked (empty statusAt) ahead of everything, and among
  // those the OLDEST auction week first - older pass-ins are the ones most likely
  // to have since sold/been removed, so they carry the most user value to catch.
  const candidates = props
    .filter((p) => p.listUrl && /domain\.com\.au/i.test(p.listUrl) && !TERMINAL.has(p.status))
    .sort((a, b) => String(a.statusAt || '').localeCompare(String(b.statusAt || '')) || String(a.week || '').localeCompare(String(b.week || '')))
    .slice(0, BATCH);

  const counts = { available: 0, under_offer: 0, sold: 0, removed: 0, unchanged: 0 };
  let blocked = 0, done = 0;
  const now = new Date().toISOString();
  await pool(candidates, CONC, async (p) => {
    const { verdict, conclusive, blocked: b } = await checkOne(p.listUrl);
    if (b) blocked++;
    if (verdict && verdict !== p.status) { p.status = verdict; counts[verdict]++; } else counts.unchanged++;
    if (conclusive) p.statusAt = now; // only advance the round-robin on a real answer; retry blocked/transient next run
    await sleep(120 + Math.random() * 180); // polite jitter to stay under Domain's rate wall
    if (++done % 40 === 0) console.log('  ', done, '/', candidates.length);
  });

  const dist = {};
  for (const p of props) dist[p.status || 'unknown'] = (dist[p.status || 'unknown'] || 0) + 1;
  console.log('checked', candidates.length, '| changes', JSON.stringify(counts), '| blocked', blocked);
  console.log('distribution', JSON.stringify(dist));
  if (blocked > candidates.length / 2) console.error('WARNING: >50% blocked - are you on a residential IP? (datacenter IPs get Domain bot challenges)');

  if (DRY) { console.log('(dry run - not written)'); return; }
  const put = await fetch(base + "/rest/v1/app_data?key=eq.passed_in", {
    method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: { ...payload, properties: props }, updated_at: now }),
  });
  if (!put.ok) { console.error('check-listings: write failed', put.status, await put.text()); process.exit(1); }
  await fetch(base + "/rest/v1/app_data", {
    method: 'POST', headers: { ...hdr, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key: 'freshness_status', generated: rows[0].generated, payload: { ok: true, at: now, checked: candidates.length, changes: counts, blocked, distribution: dist }, updated_at: now }]),
  });
  console.log('check-listings: OK - wrote status for', candidates.length, 'listings');
})();
