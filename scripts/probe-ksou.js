const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  const idxUrl = 'https://www.ksouhome.com/auction-results/VIC/2026-06-27/R/';
  const r = await fetch(idxUrl, { headers: UA }); const body = r.ok ? await r.text() : '';
  console.log('weekly index:', r.status, '| len', body.length);
  const links = [...new Set([...body.matchAll(/\/property-auction-result\/VIC\/\d+\/[^"'\s)>]+/g)].map(m => m[0]))];
  console.log('property links found:', links.length);
  console.log('sample:', links.slice(0, 3).join('\n        '));
  // test 3 per-property pages for List price
  for (const ln of links.slice(0, 3)) {
    const purl = 'https://www.ksouhome.com' + ln;
    const pr = await fetch(purl, { headers: UA }); const pb = pr.ok ? await pr.text() : '';
    const t = strip(pb);
    const lm = t.match(/List:\s*(\$[\d,]+(?:\s*-\s*\$[\d,]+)?)/i);
    const addr = (ln.match(/\/\d+\/(.+?)\/?$/) || [])[1];
    console.log('  ', addr, '| status', pr.status, '| List:', lm ? lm[1] : '(none)');
  }
})();