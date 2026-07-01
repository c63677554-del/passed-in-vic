// REIV passed-in scraper (v2): postcode extraction + pluggable geocoder.
//   node scrape-reiv.js --days=9                      # full run -> ../data.js
//   GEOCODER=mapbox MAPBOX_TOKEN=... node scrape-reiv.js --days=9
//   GEOCODER=google GOOGLE_MAPS_API_KEY=... node scrape-reiv.js --days=9
// Default geocoder is OSM Nominatim (cached, rate-limited) — fine for one-off; for the
// weekly production service set GEOCODER=mapbox|google with a key (no public-API limits).
const fs = require('fs'), path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const SITEMAP = 'https://reiv.com.au/sitemap.xml', BASE = 'https://reiv.com.au/market-insights/suburb/';
const ROOT = path.join(__dirname, '..'), CACHE = path.join(__dirname, 'geocache.json');
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const LIMIT = +arg('limit', 0), DAYS = +arg('days', 9), CONC = +arg('conc', 6), NOGEO = argv.includes('--no-geo');
const GEOCODER = (process.env.GEOCODER || 'nominatim').toLowerCase();
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN || '', GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => (s || '').replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const get = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
const cell = (row, c) => { const m = row.match(new RegExp('<td class="' + c + '[^"]*">([\\s\\S]*?)</td>')); return m ? strip(m[1]) : ''; };
function extractPostcode(html) { const i = html.search(/insights for/i); if (i < 0) return null; const seg = strip(html.slice(i, i + 260)); const m = seg.match(/insights for[^\d]{0,40}(\d{4})/i); return m ? m[1] : null; }
function parse(html) {
  const t = html.match(/<table[^>]*>([\s\S]*?)<\/table>/); if (!t) return [];
  const pc = extractPostcode(html);
  const out = [];
  for (const row of (t[1].match(/<tr[\s\S]*?<\/tr>/g) || [])) {
    if (/<th/.test(row)) continue;
    const method = cell(row, 'method'); if (!/passed in/i.test(method)) continue;
    const full = cell(row, 'address'), i = full.lastIndexOf(',');
    out.push({ address: i > 0 ? full.slice(0, i).trim() : full, suburb: i > 0 ? full.slice(i + 1).trim() : '', postcode: pc,
      beds: parseInt(cell(row, 'bedrooms'), 10) || null, type: cell(row, 'type') || null,
      method, saleDate: cell(row, 'sale_date'), agency: cell(row, 'agent') || null });
  }
  return out;
}
const parseDate = s => { const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
function weekSaturday(s) { const d = parseDate(s); if (!d) return null; const dow = d.getDay(); d.setDate(d.getDate() + (dow === 0 ? -1 : 6 - dow)); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const daysAgo = s => { const d = parseDate(s); return d ? (Date.now() - d) / 864e5 : 1e9; };
async function pool(items, n, fn) { const res = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { res[k] = await fn(items[k]); } catch { res[k] = null; } } })); return res; }
let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch {}
async function geocode(q) {
  if (q in cache) return cache[q];
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
    }
  } catch {}
  cache[q] = g; fs.writeFileSync(CACHE, JSON.stringify(cache));
  if (GEOCODER === 'nominatim') await sleep(1100);
  return g;
}
(async () => {
  console.log('Geocoder:', GEOCODER, '| fetching sitemap...');
  const sm = await get(SITEMAP);
  let slugs = [...new Set([...sm.matchAll(/\/market-insights\/suburb\/([^<\s"]+)/g)].map(m => m[1]))];
  if (LIMIT) slugs = slugs.slice(0, LIMIT);
  console.log('Suburbs:', slugs.length, '| recency:', DAYS, 'days | conc:', CONC);
  let done = 0;
  const all = (await pool(slugs, CONC, async slug => { const h = await get(BASE + slug); if (++done % 200 === 0) console.log('  fetched', done, '/', slugs.length); return parse(h); })).filter(Boolean).flat();
  console.log('Total passed-in rows:', all.length);
  let recent = all.filter(p => daysAgo(p.saleDate) <= DAYS);
  const seen = new Set();
  recent = recent.filter(p => { const k = (p.address + p.suburb).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  console.log('Passed-in within', DAYS, 'days (deduped):', recent.length, '| with postcode:', recent.filter(p => p.postcode).length);
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
  // Accumulate: merge this run into any existing data.js so the week dropdown
  // grows over time (dedup by address|suburb|week; keeps all past weeks).
  const dataPath = path.join(ROOT, 'data.js');
  let existing = [];
  try { const txt = fs.readFileSync(dataPath, 'utf8'); const a = txt.indexOf('['), b = txt.lastIndexOf(']'); if (a >= 0 && b > a) existing = JSON.parse(txt.slice(a, b + 1)); } catch {}
  const key = p => (p.address + '|' + p.suburb + '|' + p.week).toLowerCase();
  const merged = existing.slice(); const seenKeys = new Set(existing.map(key));
  for (const p of out) { const k = key(p); if (!seenKeys.has(k)) { seenKeys.add(k); merged.push(p); } }
  merged.sort((a, b) => (b.week || '').localeCompare(a.week || '') || (a.suburb || '').localeCompare(b.suburb || '') || a.address.localeCompare(b.address));
  const weeks = [...new Set(merged.map(o => o.week))].sort().reverse();
  const hdr = '// REAL passed-in auction results scraped from REIV per-suburb pages (reiv.com.au),\n// geocoded via ' + GEOCODER + ' (cached). Accumulates weekly. ' + merged.length + ' properties across ' + weeks.length + ' week(s): ' + weeks.join(', ') + '.\n// Regenerate: node scripts/scrape-reiv.js --days=' + DAYS + '\n';
  fs.writeFileSync(dataPath, hdr + 'const PASSED_IN = ' + JSON.stringify(merged, null, 2) + ';\n');
  console.log('WROTE data.js:', merged.length, 'total across', weeks.length, 'week(s) (+' + (merged.length - existing.length) + ' new)');
})();