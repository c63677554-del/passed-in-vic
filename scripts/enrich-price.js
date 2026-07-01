// Backfill priceEst on every record in data.js from REIV suburb medians (no geocoding).
const fs = require('fs'), path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const SITEMAP = 'https://reiv.com.au/sitemap.xml', BASE = 'https://reiv.com.au/market-insights/suburb/';
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data.js');
const get = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
function money(s) { if (!s || s === '-') return null; const m = String(s).replace(/,/g, '').match(/\$?([\d.]+)\s*(mil|m|k)?/i); if (!m) return null; let n = parseFloat(m[1]); const u = (m[2] || '').toLowerCase(); if (u === 'mil' || u === 'm') n *= 1e6; else if (u === 'k') n *= 1e3; return Math.round(n); }
function parseMedians(html) {
  const t = html.replace(/<!--.*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const bedRows = txt => { const rows = {}; for (const r of txt.matchAll(/(\d+)\s+(\$[\d,]+|-)\s+(\$[\d,]+|-)/g)) { const b = +r[1], sub = money(r[2]); if (sub) rows[b] = sub; } return rows; };
  const sales = [...t.matchAll(/Median sale price\s+(\$[\d.]+\s*(?:mil|m|k)?)[\s\S]{0,300}?Bedrooms\s+.+?\s+Metro comparison\s+((?:\d+\s+(?:\$[\d,]+|-)\s+(?:\$[\d,]+|-)\s*){1,6})/gi)];
  const sect = i => sales[i] ? { headline: money(sales[i][1]), byBed: bedRows(sales[i][2]) } : null;
  return { house: sect(0), unit: sect(1) };
}
function estPrice(med, type, beds) {
  if (!med) return null;
  const isUnit = /unit|apartment|flat|townhouse|villa/i.test(type || '');
  const order = isUnit ? [med.unit, med.house] : [med.house, med.unit];
  for (const s of order) { if (!s) continue; if (beds && s.byBed[beds]) return s.byBed[beds]; if (s.headline) return s.headline; }
  return null;
}
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
(async () => {
  const txt = fs.readFileSync(DATA, 'utf8'); const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  const data = JSON.parse(txt.slice(a, b + 1));
  const sm = await get(SITEMAP);
  const slugs = [...new Set([...sm.matchAll(/\/market-insights\/suburb\/([^<\s"]+)/g)].map(m => m[1]))];
  const slugByNorm = {}; for (const sl of slugs) slugByNorm[norm(decodeURIComponent(sl))] = sl;
  const subs = [...new Set(data.map(d => d.suburb).filter(Boolean))];
  const medBySub = {}; let fetched = 0; const missing = [];
  for (const sub of subs) {
    const slug = slugByNorm[norm(sub)]; if (!slug) { missing.push(sub); continue; }
    try { medBySub[sub] = parseMedians(await get(BASE + slug)); } catch { medBySub[sub] = null; }
    if (++fetched % 25 === 0) console.log('  fetched', fetched, '/', subs.length);
  }
  let filled = 0; for (const d of data) { d.priceEst = estPrice(medBySub[d.suburb], d.type, d.beds); if (d.priceEst != null) filled++; }
  const weeks = [...new Set(data.map(d => d.week))].sort().reverse();
  const hdr = '// REAL passed-in results from REIV (reiv.com.au), geocoded; priceEst = suburb median by type/beds.\n// ' + data.length + ' properties across ' + weeks.length + ' week(s): ' + weeks.join(', ') + '.\n';
  fs.writeFileSync(DATA, hdr + 'const PASSED_IN = ' + JSON.stringify(data, null, 2) + ';\n');
  console.log('Enriched priceEst:', filled, '/', data.length, '| suburbs:', subs.length, '| missing slug:', missing.length, missing.slice(0, 8).join(', '));
})();