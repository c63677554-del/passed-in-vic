// enrich-prices.js — attach current agent price guide (soho.com.au) to every property in data.js.
// Node-only, no API key. Parses soho's structured "The price of <addr> is <$X[ - $Y]>" statement.
//   node enrich-prices.js                    # enrich all of data.js in place
//   node enrich-prices.js --limit=12 --dry   # test first 12 without writing
const fs = require('fs'), path = require('path');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data.js');
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const LIMIT = +arg('limit', 0), CONC = +arg('conc', 6), DRY = argv.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AB = { ct: 'court', st: 'street', rd: 'road', av: 'avenue', ave: 'avenue', dr: 'drive', pl: 'place', cr: 'crescent', cres: 'crescent', gr: 'grove', gv: 'grove', pde: 'parade', tce: 'terrace', cl: 'close', ln: 'lane', bvd: 'boulevard', blvd: 'boulevard', sq: 'square', wy: 'way', hwy: 'highway', cct: 'circuit', esp: 'esplanade', gdns: 'gardens', cir: 'circle', pkwy: 'parkway', hts: 'heights', rdg: 'ridge', vw: 'view', qy: 'quay', grn: 'green', mw: 'mews' };
const expand = a => a.split(/\s+/).map(w => AB[w.toLowerCase().replace(/[.,]/g, '')] || w).join(' ');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const priceOf = html => { const m = html.match(/price of [^.<]{3,70}? is (\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?)/i); return m ? m[1] : null; };
const parse = s => { const n = [...s.matchAll(/\$([\d,]+)/g)].map(m => +m[1].replace(/,/g, '')); return n.length ? { low: Math.min(...n), high: Math.max(...n) } : null; };
const fetchText = async url => { try { const r = await fetch(url, { headers: UA }); return r.ok ? await r.text() : ''; } catch { return ''; } };
async function guideFor(d) {
  const base = slug(expand(d.address) + ' ' + d.suburb + ' vic ' + (d.postcode || '') + ' australia');
  for (const kind of ['auction', 'sale']) {
    const html = await fetchText('https://soho.com.au/properties/' + kind + '/' + base);
    await sleep(120);
    if (html.length > 5000) { const p = priceOf(html); return p ? parse(p) : null; }
  }
  return null;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { await fn(items[i++]); } })); }
(async () => {
  const t = fs.readFileSync(DATA, 'utf8');
  const data = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
  const work = LIMIT ? data.slice(0, LIMIT) : data;
  let done = 0, priced = 0;
  await pool(work, CONC, async d => { delete d.priceEst; const g = await guideFor(d); d.listLow = g ? g.low : null; d.listHigh = g ? g.high : null; if (g) priced++; if (++done % 40 === 0) console.log('  ', done, '/', work.length, '(' + priced + ' priced)'); });
  console.log('priced', priced, 'of', work.length);
  if (DRY) { console.log(JSON.stringify(work.slice(0, 12).map(d => ({ a: d.address, s: d.suburb, low: d.listLow, high: d.listHigh })))); return; }
  const weeks = [...new Set(data.map(d => d.week))].sort().reverse();
  const priceCount = data.filter(d => d.listLow != null).length;
  const hdr = '// REAL passed-in results from REIV (reiv.com.au) with current agent price guides (soho.com.au).\n// ' + data.length + ' properties; ' + priceCount + ' with a price guide; weeks: ' + weeks.join(', ') + '.\n// Regenerate: node scripts/scrape-reiv.js --days=30 && node scripts/enrich-prices.js\n';
  const p2 = n => String(n).padStart(2, '0'); const nd = new Date(); const gen = nd.getFullYear() + '-' + p2(nd.getMonth() + 1) + '-' + p2(nd.getDate());
  fs.writeFileSync(DATA, hdr + 'const DATA_GENERATED = ' + JSON.stringify(gen) + ';\n' + 'const PASSED_IN = ' + JSON.stringify(data, null, 2) + ';\n');
  console.log('WROTE data.js:', priceCount, 'priced across', weeks.length, 'weeks');
})();