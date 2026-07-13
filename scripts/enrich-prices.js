// enrich-prices.js - attach the current agent price guide AND live listing link
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
// CONC default 2 (was 6): 6 parallel connections in a sustained burst tripped
// McAfee's network protection and silently killed node mid-run (exit 127). 2 is
// slower but survives. Raise only in a clean environment (e.g. GitHub Actions).
const LIMIT = +arg('limit', 0), CONC = +arg('conc', 2), DRY = argv.includes('--dry');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Best-effort enrichment must never take the process down: a single bad
// response cannot be allowed to abort the whole weekly run.
process.on('unhandledRejection', e => console.error('enrich: unhandledRejection (ignored):', e && e.message || e));
const FETCH_TIMEOUT_MS = 10000;
const fetchText = async url => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: UA, signal: ac.signal });
    // CRITICAL: drain the body on non-ok. soho 404s for ~90% of addresses, and
    // an un-consumed undici body keeps its socket alive until GC. Over ~2000
    // requests that leak exhausted handles/memory and hard-crashed node
    // (exit 0xC0000409), which aborted the pipeline before validate + upload.
    if (!r.ok) { try { await r.body?.cancel(); } catch {} return ''; }
    return await r.text();
  } catch { return ''; }
  finally { clearTimeout(timer); }
};

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

function writeOut(data) {
  const weeks = [...new Set(data.map(d => d.week))].sort().reverse();
  const priceCount = data.filter(d => d.listLow != null).length;
  const hdr = '// REAL passed-in results from REIV (reiv.com.au) with current agent price guides + listing links (soho.com.au).\n// ' + data.length + ' properties; ' + priceCount + ' with a price guide; weeks: ' + weeks.join(', ') + '.\n// Regenerate: node scripts/scrape-reiv.js --days=30 && node scripts/enrich-prices.js\n';
  const p2 = n => String(n).padStart(2, '0'); const nd = new Date(); const gen = nd.getFullYear() + '-' + p2(nd.getMonth() + 1) + '-' + p2(nd.getDate());
  fs.writeFileSync(DATA, hdr + 'const DATA_GENERATED = ' + JSON.stringify(gen) + ';\n' + 'const PASSED_IN = ' + JSON.stringify(data, null, 2) + ';\n');
  fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify({ generated: gen, properties: data })); // consumed by the mobile apps
  return { priceCount, weeks };
}

(async () => {
  const data = readDataArray(fs.readFileSync(DATA, 'utf8'));
  const work = LIMIT ? data.slice(0, LIMIT) : data;
  let done = 0, priced = 0;
  await pool(work, CONC, async d => {
    try {
      delete d.priceEst;
      const hasDomainUrl = !!(d.listUrl && /domain\.com\.au/i.test(d.listUrl));
      const g = await guideFor(d);
      d.listLow = g ? g.low : null;
      d.listHigh = g ? g.high : null;
      // Domain-sourced listing links are authoritative - never clobber them with
      // soho matches (or nulls); soho only fills the gap for REIV-sourced rows.
      if (!hasDomainUrl) d.listUrl = g ? g.url : null;
      if (g) priced++;
    } catch { /* one bad address must never abort the whole enrichment run */ }
    if (++done % 40 === 0) console.log('  ', done, '/', work.length, '(' + priced + ' priced)');
    // Checkpoint: persist progress so a mid-run kill keeps the guides gathered
    // so far (enrichment is best-effort; partial is strictly better than none).
    if (!DRY && done % 200 === 0) writeOut(data);
  });
  console.log('priced', priced, 'of', work.length);
  if (DRY) { console.log(JSON.stringify(work.slice(0, 12).map(d => ({ a: d.address, s: d.suburb, low: d.listLow, high: d.listHigh, url: d.listUrl })), null, 1)); return; }
  const { priceCount, weeks } = writeOut(data);
  console.log('WROTE data.js + data.json:', priceCount, 'priced across', weeks.length, 'weeks');
})();
