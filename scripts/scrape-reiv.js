// REIV passed-in scraper: fetch every VIC suburb's auction table, keep "Passed in"
// rows, geocode, and write ../data.js (accumulating past weeks). Run
// scripts/enrich-prices.js afterward to attach agent price guides. Pipeline: npm run build:data.
//   node scrape-reiv.js --days=30 --min-rows=15          # full run -> ../data.js
//   GEOCODER=mapbox MAPBOX_TOKEN=... node scrape-reiv.js --days=30   (or GEOCODER=google)
// Default geocoder is OSM Nominatim (cached, rate-limited) with a photon.komoot.io
// fallback; for heavier automated use set a Mapbox/Google key.
// Guards (so automation fails loudly instead of publishing junk):
//   --min-rows=N   exit 2 if fewer than N passed-in rows parse (REIV markup change / outage)
//   geocode floor  exit 3 if <50% of rows geocode (geocoder outage) — data.js left untouched
//   retention      weeks older than --retain-days (default 84) are dropped from data.js
'use strict';
const fs = require('fs'), path = require('path');
const { parseSuburbPage, weekSaturday, daysAgo, pool, inVic, readDataArray } = require('./lib');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const SITEMAP = 'https://reiv.com.au/sitemap.xml', BASE = 'https://reiv.com.au/market-insights/suburb/';
const ROOT = path.join(__dirname, '..'), CACHE = path.join(__dirname, 'geocache.json');
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const LIMIT = +arg('limit', 0), DAYS = +arg('days', 9), CONC = +arg('conc', 6), NOGEO = argv.includes('--no-geo');
const MIN_ROWS = +arg('min-rows', 0), RETAIN_DAYS = +arg('retain-days', 84);
const GEOCODER = (process.env.GEOCODER || 'nominatim').toLowerCase();
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '', GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };

let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
async function geocode(q) {
  if (q in cache && cache[q]) return cache[q]; // reuse past hits; retry past misses
  let g = null;
  try {
    if (GEOCODER === 'mapbox' && MAPBOX_TOKEN) {
      const r = await fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(q) + '.json?country=au&limit=1&access_token=' + MAPBOX_TOKEN);
      if (r.ok) { const j = await r.json(); if (j.features && j.features[0]) { const c = j.features[0].center; g = { lat: +c[1].toFixed(6), lng: +c[0].toFixed(6) }; } }
    } else if (GEOCODER === 'google' && GOOGLE_KEY) {
      const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?region=au&address=' + encodeURIComponent(q) + '&key=' + GOOGLE_KEY);
      if (r.ok) { const j = await r.json(); if (j.results && j.results[0]) { const l = j.results[0].geometry.location; g = { lat: +l.lat.toFixed(6), lng: +l.lng.toFixed(6) }; } }
    } else {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=' + encodeURIComponent(q), { headers: UA });
      if (r.ok) { const j = await r.json(); if (j[0]) g = { lat: +(+j[0].lat).toFixed(6), lng: +(+j[0].lon).toFixed(6) }; }
      await sleep(1100); // nominatim usage policy: max 1 req/s
      if (!g) { // free keyless fallback when nominatim misses or blocks us
        try {
          const r2 = await fetch('https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q), { headers: UA });
          if (r2.ok) { const j2 = await r2.json(); const f = j2.features && j2.features[0]; if (f && f.geometry) { const c = f.geometry.coordinates; g = { lat: +c[1].toFixed(6), lng: +c[0].toFixed(6) }; } }
        } catch {}
      }
    }
  } catch {}
  if (g && !inVic(g.lat, g.lng)) g = null; // a wrong-state match is worse than no match
  cache[q] = g; fs.writeFileSync(CACHE, JSON.stringify(cache));
  return g;
}

(async () => {
  console.log('Geocoder:', GEOCODER, '| fetching sitemap...');
  const sm = await get(SITEMAP);
  let slugs = [...new Set([...sm.matchAll(/\/market-insights\/suburb\/([^<\s"]+)/g)].map(m => m[1]))];
  if (LIMIT) slugs = slugs.slice(0, LIMIT);
  console.log('Suburbs:', slugs.length, '| recency:', DAYS, 'days | conc:', CONC);
  let done = 0;
  const all = (await pool(slugs, CONC, async slug => { const h = await get(BASE + slug); if (++done % 200 === 0) console.log('  fetched', done, '/', slugs.length); return parseSuburbPage(h); })).filter(Boolean).flat();
  console.log('Total passed-in rows:', all.length);
  let recent = all.filter(p => daysAgo(p.saleDate) <= DAYS);
  const seen = new Set();
  recent = recent.filter(p => { const k = (p.address + p.suburb).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  console.log('Passed-in within', DAYS, 'days (deduped):', recent.length, '| with postcode:', recent.filter(p => p.postcode).length);
  if (MIN_ROWS && recent.length < MIN_ROWS) {
    console.error(`FATAL: only ${recent.length} recent passed-in rows (< --min-rows=${MIN_ROWS}). REIV markup change or outage? data.js left untouched.`);
    process.exit(2);
  }
  if (NOGEO) { console.log(JSON.stringify(recent.slice(0, 5), null, 1)); return; }

  console.log('Geocoding', recent.length, '...');
  const out = []; let gc = 0;
  for (const p of recent) {
    let g = await geocode(`${p.address}, ${p.suburb} VIC ${p.postcode || ''}, Australia`);
    if (!g) g = await geocode(`${p.suburb} VIC ${p.postcode || ''}, Australia`);
    if (++gc % 25 === 0) console.log('  geocoded', gc, '/', recent.length);
    if (!g) continue;
    out.push({ address: p.address, suburb: p.suburb, postcode: p.postcode, lat: g.lat, lng: g.lng, type: p.type, beds: p.beds, baths: null, cars: null, price: null, vendor: null, agency: p.agency, method: p.method, saleDate: p.saleDate, week: weekSaturday(p.saleDate) });
  }
  if (recent.length >= 20 && out.length < recent.length * 0.5) {
    console.error(`FATAL: geocoded only ${out.length}/${recent.length} rows — geocoder outage? data.js left untouched.`);
    process.exit(3);
  }

  // Accumulate: merge this run into any existing data.js so the week dropdown
  // grows over time (dedup by address|suburb|week; retention keeps payload bounded).
  const dataPath = path.join(ROOT, 'data.js');
  let existing = [];
  try { existing = readDataArray(fs.readFileSync(dataPath, 'utf8')); } catch {}
  const key = p => (p.address + '|' + p.suburb + '|' + p.week).toLowerCase();
  const byKey = new Map(existing.map(p => [key(p), p]));
  for (const p of out) { const prev = byKey.get(key(p)); byKey.set(key(p), prev ? { ...prev, ...p } : p); } // fresh scrape wins; enriched fields survive until enrich reruns
  let merged = [...byKey.values()];
  const cutoff = Date.now() - RETAIN_DAYS * 864e5;
  merged = merged.filter(p => { const d = p.week ? new Date(p.week + 'T00:00:00') : null; return d && d.getTime() >= cutoff; });
  merged.sort((a, b) => (b.week || '').localeCompare(a.week || '') || (a.suburb || '').localeCompare(b.suburb || '') || a.address.localeCompare(b.address));
  const weeks = [...new Set(merged.map(o => o.week))].sort().reverse();
  const p2 = n => String(n).padStart(2, '0'); const nd = new Date(); const gen = nd.getFullYear() + '-' + p2(nd.getMonth() + 1) + '-' + p2(nd.getDate());
  const hdr = '// REAL passed-in auction results scraped from REIV per-suburb pages (reiv.com.au),\n// geocoded via ' + GEOCODER + ' (cached). Accumulates weekly, retains ' + RETAIN_DAYS + ' days. ' + merged.length + ' properties across ' + weeks.length + ' week(s): ' + weeks.join(', ') + '.\n// Regenerate: node scripts/scrape-reiv.js --days=' + DAYS + ' && node scripts/enrich-prices.js\n';
  fs.writeFileSync(dataPath, hdr + 'const DATA_GENERATED = ' + JSON.stringify(gen) + ';\nconst PASSED_IN = ' + JSON.stringify(merged, null, 2) + ';\n');
  console.log('WROTE data.js:', merged.length, 'total across', weeks.length, 'week(s) (' + (merged.length - existing.length >= 0 ? '+' : '') + (merged.length - existing.length) + ' vs previous)');
})();
