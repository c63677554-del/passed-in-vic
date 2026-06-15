// REIV per-suburb auction scraper. Keeps "Passed in" rows, geocodes (cached), writes data.js.
//   node scrape-reiv.js --test=caulfield,brunswick      # parse+print only
//   node scrape-reiv.js --days=14 [--limit=N]           # real run -> data.js
// NOTE: OSM Nominatim isn't for bulk/automated use; fine one-off, use a real geocoder in prod.
const fs = require('fs'), path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const BASE = 'https://reiv.com.au/market-insights/suburb/';
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const TEST = arg('test', null), LIMIT = +arg('limit', 0), DAYS = +arg('days', 14), CONC = +arg('conc', 8);
const strip = s => (s || '').replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const get = async u => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
const cell = (row, cls) => { const m = row.match(new RegExp('<td class="' + cls + '[^"]*">([\\s\\S]*?)</td>')); return m ? strip(m[1]) : ''; };
function parseRows(html) {
  const t = html.match(/<table[^>]*>([\s\S]*?)<\/table>/); if (!t) return { rows: [], firstRaw: null };
  const postcode = (html.match(/insights for [^<0-9]*?(\d{4})/) || [])[1] || null;
  const trs = t[1].match(/<tr[\s\S]*?<\/tr>/g) || [];
  const out = []; let firstRaw = null;
  for (const row of trs) {
    if (/<th/.test(row)) continue;
    if (!firstRaw) firstRaw = row.slice(0, 420);
    const method = cell(row, 'method'); if (!/passed in/i.test(method)) continue;
    const full = cell(row, 'address'); const i = full.lastIndexOf(',');
    out.push({ address: i > 0 ? full.slice(0, i).trim() : full, suburb: i > 0 ? full.slice(i + 1).trim() : '', postcode,
      beds: parseInt(cell(row, 'bedrooms'), 10) || null, type: cell(row, 'type') || null,
      method, saleDate: cell(row, 'sale_date'), agency: cell(row, 'agent') || null });
  }
  return { rows: out, firstRaw };
}
(async () => {
  const slugs = TEST.split(',');
  for (const slug of slugs) {
    try {
      const html = await get(BASE + slug);
      const { rows, firstRaw } = parseRows(html);
      console.log(`\n### ${slug}  (passed-in: ${rows.length})`);
      if (slug === slugs[0]) console.log('FIRST DATA ROW RAW:', strip(firstRaw).slice(0, 300));
      rows.forEach(r => console.log(`  ${r.address}, ${r.suburb} ${r.postcode||''} | ${r.beds||'?'}bd ${r.type} | ${r.method} | ${r.saleDate} | ${r.agency}`));
    } catch (e) { console.log(slug, 'ERROR', e.message); }
  }
})();
