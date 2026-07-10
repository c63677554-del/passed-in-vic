// enrich-prices.js — attach the current agent price guide AND live listing link
// (soho.com.au) to every property in data.js. Node-only, no API key.
// Parses soho's structured "The price of <addr> is <$X[ - $Y]>" statement; the
// listing URL is only stored when that statement matched (high-confidence page).
//   node enrich-prices.js                    # enrich all of data.js in place
//   node enrich-prices.js --limit=12 --dry   # test first 12 without writing
'use strict';
const fs = require('fs'), path = require('path');
const { expand, slug, priceOf, parsePriceRange, pool, readDataArray } = require('./lib');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data.js');
const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const LIMIT = +arg('limit', 0), CONC = +arg('conc', 6), DRY = argv.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fetchText = async url => { try { const r = await fetch(url, { headers: UA }); return r.ok ? await r.text() : ''; } catch { return ''; } };

async function guideFor(d) {
  const base = slug(expand(d.address) + ' ' + d.suburb + ' vic ' + (d.postcode || '') + ' australia');
  for (const kind of ['auction', 'sale']) {
    const url = 'https://soho.com.au/properties/' + kind + '/' + base;
    const html = await fetchText(url);
    await sleep(120);
    if (html.length > 5000) {
      const p = priceOf(html);
      // plausibility bounds: soho occasionally lists "$1"-style placeholders
      if (p) { const r = parsePriceRange(p); if (r && r.low >= 50000 && r.high <= 30000000) return { ...r, url }; }
      // page exists but no usable price statement -> try the other kind before giving up
    }
  }
  return null;
}

(async () => {
  const data = readDataArray(fs.readFileSync(DATA, 'utf8'));
  const work = LIMIT ? data.slice(0, LIMIT) : data;
  let done = 0, priced = 0;
  await pool(work, CONC, async d => {
    delete d.priceEst;
    const hasDomainUrl = !!(d.listUrl && /domain\.com\.au/i.test(d.listUrl));
    const g = await guideFor(d);
    d.listLow = g ? g.low : null;
    d.listHigh = g ? g.high : null;
    // Domain-sourced listing links are authoritative — never clobber them with
    // soho matches (or nulls); soho only fills the gap for REIV-sourced rows.
    if (!hasDomainUrl) d.listUrl = g ? g.url : null;
    if (g) priced++;
    if (++done % 40 === 0) console.log('  ', done, '/', work.length, '(' + priced + ' priced)');
  });
  console.log('priced', priced, 'of', work.length);
  if (DRY) { console.log(JSON.stringify(work.slice(0, 12).map(d => ({ a: d.address, s: d.suburb, low: d.listLow, high: d.listHigh, url: d.listUrl })), null, 1)); return; }
  const weeks = [...new Set(data.map(d => d.week))].sort().reverse();
  const priceCount = data.filter(d => d.listLow != null).length;
  const hdr = '// REAL passed-in results from REIV (reiv.com.au) with current agent price guides + listing links (soho.com.au).\n// ' + data.length + ' properties; ' + priceCount + ' with a price guide; weeks: ' + weeks.join(', ') + '.\n// Regenerate: node scripts/scrape-reiv.js --days=30 && node scripts/enrich-prices.js\n';
  const p2 = n => String(n).padStart(2, '0'); const nd = new Date(); const gen = nd.getFullYear() + '-' + p2(nd.getMonth() + 1) + '-' + p2(nd.getDate());
  fs.writeFileSync(DATA, hdr + 'const DATA_GENERATED = ' + JSON.stringify(gen) + ';\n' + 'const PASSED_IN = ' + JSON.stringify(data, null, 2) + ';\n');
  fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify({ generated: gen, properties: data })); // consumed by the mobile apps
  console.log('WROTE data.js + data.json:', priceCount, 'priced across', weeks.length, 'weeks');
})();
