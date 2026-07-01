const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' };
const strip = s => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function money(s) {
  if (!s || s === '-') return null;
  const m = s.replace(/,/g, '').match(/\$?([\d.]+)\s*(mil|m|k)?/i); if (!m) return null;
  let n = parseFloat(m[1]); const u = (m[2] || '').toLowerCase();
  if (u === 'mil' || u === 'm') n *= 1e6; else if (u === 'k') n *= 1e3;
  return Math.round(n);
}
const parseRows = txt => { const rows = {}; for (const r of txt.matchAll(/(\d+)\s+(\$[\d,]+|-)\s+(\$[\d,]+|-)/g)) { const b = +r[1], sub = money(r[2]); if (sub) rows[b] = sub; } return rows; };
function parseMedians(html) {
  const t = strip(html);
  const sales = [...t.matchAll(/Median sale price\s+(\$[\d.]+\s*(?:mil|m|k)?)[\s\S]{0,300}?Bedrooms\s+.+?\s+Metro comparison\s+((?:\d+\s+(?:\$[\d,]+|-)\s+(?:\$[\d,]+|-)\s*){1,6})/gi)];
  const house = sales[0] ? { headline: money(sales[0][1]), byBed: parseRows(sales[0][2]) } : null;
  const unit = sales[1] ? { headline: money(sales[1][1]), byBed: parseRows(sales[1][2]) } : null;
  return { house, unit };
}
(async () => {
  for (const slug of ['caulfield', 'reservoir', 'hawthorn', 'brunswick', 'toorak']) {
    const html = await (await fetch('https://reiv.com.au/market-insights/suburb/' + slug, { headers: UA })).text();
    console.log(slug, '->', JSON.stringify(parseMedians(html)));
  }
})();