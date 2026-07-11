// Domain auction-results scraper: Sydney, Brisbane, Adelaide, Canberra
// (Melbourne stays on REIV to avoid double-counting). Parses the public
// results pages' embedded __NEXT_DATA__ JSON - per-listing coordinates and
// listing URLs included, so no geocoding is needed.
//   node scrape-domain.js --min-rows=30        # full run -> merge into ../data.js
//   node scrape-domain.js --dry                # parse + count, write nothing
// Runs weekly after scrape-reiv.js (scripts/weekly-refresh.ps1); the merge is
// the same accumulate-by-(address|suburb|week) used by the REIV scraper.
'use strict';
const fs = require('fs'), path = require('path');
const { mapDomainListing, daysAgo, pool, inState, dedupeKey, readDataArray } = require('./lib');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 'Accept': 'text/html', 'Accept-Language': 'en-AU,en;q=0.9' };
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const DAYS = +arg('days', 30), MIN_ROWS = +arg('min-rows', 0), RETAIN_DAYS = +arg('retain-days', 84);
const DRY = argv.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Melbourne is scraped from Domain too (direct listing links + coordinates);
// running AFTER scrape-reiv.js means Domain fields win on shared homes while
// REIV-only reports survive as gap-fill. dedupeKey() keeps pins single.
const CITIES = [
  { slug: 'melbourne', city: 'Melbourne', state: 'VIC' },
  { slug: 'sydney', city: 'Sydney', state: 'NSW' },
  { slug: 'brisbane', city: 'Brisbane', state: 'QLD' },
  { slug: 'adelaide', city: 'Adelaide', state: 'SA' },
  { slug: 'canberra', city: 'Canberra', state: 'ACT' },
];

async function scrapeCity(c) {
  const r = await fetch('https://www.domain.com.au/auction-results/' + c.slug + '/', { headers: UA });
  if (!r.ok) { console.error('  ' + c.city + ': HTTP ' + r.status); return []; }
  const t = await r.text();
  const m = t.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) { console.error('  ' + c.city + ': __NEXT_DATA__ missing (markup change?)'); return []; }
  let cp;
  try { cp = JSON.parse(m[1]).props.pageProps.componentProps; } catch { console.error('  ' + c.city + ': JSON parse failed'); return []; }
  const auctionDate = cp.auctionDate;
  const listings = (cp.salesListings || []).flatMap(s => s.listings || []);
  const rows = listings.map(l => mapDomainListing(l, auctionDate, c.city)).filter(Boolean)
    .filter(p => inState(c.state, p.lat, p.lng)) // drop mis-geocoded strays
    .filter(p => daysAgo(p.saleDate) <= DAYS);
  const summary = cp.citySummaryData || {};
  console.log(`  ${c.city}: auction ${String(auctionDate).slice(0, 10)} | listings ${listings.length} | passed-in kept ${rows.length} (site reports ${summary.numberPassedIn ?? '?'})`);
  await sleep(400); // politeness gap between city pages
  return rows;
}

(async () => {
  console.log('Domain auction results -', CITIES.map(c => c.city).join(', '));
  const out = [];
  for (const c of CITIES) { try { out.push(...await scrapeCity(c)); } catch (e) { console.error('  ' + c.city + ' FAILED: ' + e.message); } }
  console.log('Total passed-in rows:', out.length);
  if (MIN_ROWS && out.length < MIN_ROWS) {
    console.error(`FATAL: only ${out.length} rows (< --min-rows=${MIN_ROWS}). Domain markup change or outage? data.js left untouched.`);
    process.exit(2);
  }
  if (DRY) { console.log(JSON.stringify(out.slice(0, 3), null, 1)); return; }

  const dataPath = path.join(ROOT, 'data.js');
  let existing = [];
  try { existing = readDataArray(fs.readFileSync(dataPath, 'utf8')); } catch {}
  const byKey = new Map(existing.map(p => [dedupeKey(p), p]));
  for (const p of out) { const prev = byKey.get(dedupeKey(p)); byKey.set(dedupeKey(p), prev ? { ...prev, ...p } : p); }
  let merged = [...byKey.values()];
  const cutoff = Date.now() - RETAIN_DAYS * 864e5;
  merged = merged.filter(p => { const d = p.week ? new Date(p.week + 'T00:00:00') : null; return d && d.getTime() >= cutoff; });
  merged.sort((a, b) => (b.week || '').localeCompare(a.week || '') || (a.suburb || '').localeCompare(b.suburb || '') || a.address.localeCompare(b.address));
  const weeks = [...new Set(merged.map(o => o.week))].sort().reverse();
  const p2 = n => String(n).padStart(2, '0'); const nd = new Date(); const gen = nd.getFullYear() + '-' + p2(nd.getMonth() + 1) + '-' + p2(nd.getDate());
  const hdr = '// REAL passed-in auction results: REIV (Melbourne/VIC) + Domain public results\n// (Sydney, Brisbane, Adelaide, Canberra). Accumulates weekly, retains ' + RETAIN_DAYS + ' days.\n// ' + merged.length + ' properties across ' + weeks.length + ' week(s): ' + weeks.join(', ') + '.\n// Regenerate: node scripts/scrape-reiv.js --days=30 && node scripts/scrape-domain.js && node scripts/enrich-prices.js\n';
  fs.writeFileSync(dataPath, hdr + 'const DATA_GENERATED = ' + JSON.stringify(gen) + ';\nconst PASSED_IN = ' + JSON.stringify(merged, null, 2) + ';\n');
  fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify({ generated: gen, properties: merged }));
  console.log('WROTE data.js + data.json:', merged.length, 'total across', weeks.length, 'week(s) (+' + (merged.length - existing.length) + ' vs previous)');
})();
