const fs = require('fs'), path = require('path');
const t = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const data = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
const wk = data.filter(d => d.week === '2026-06-27');
const AB = { ct: 'court', st: 'street', rd: 'road', av: 'avenue', ave: 'avenue', dr: 'drive', pl: 'place', cr: 'crescent', cres: 'crescent', gr: 'grove', gv: 'grove', pde: 'parade', tce: 'terrace', cl: 'close', ln: 'lane', bvd: 'boulevard', blvd: 'boulevard', sq: 'square', wy: 'way', hwy: 'highway', cct: 'circuit', esp: 'esplanade', gdns: 'gardens', cir: 'circle', pkwy: 'parkway', hts: 'heights', rdg: 'ridge', vw: 'view', qy: 'quay', grn: 'green', mw: 'mews' };
const expand = a => a.split(/\s+/).map(w => AB[w.toLowerCase().replace(/[.,]/g,'')] || w).join(' ');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const rows = wk.map((d, i) => {
  const url = 'https://soho.com.au/properties/auction/' + slug(expand(d.address) + ' ' + d.suburb + ' vic ' + (d.postcode || '') + ' australia');
  return { key: (d.address + '|' + d.suburb).toLowerCase(), address: d.address, suburb: d.suburb, url };
});
fs.writeFileSync(path.join(__dirname, 'week-urls.json'), JSON.stringify(rows, null, 0));
console.log('generated', rows.length, 'urls');
// print in 3 batches for Exa
for (let b = 0; b < 3; b++) {
  const batch = rows.slice(b * 20, b * 20 + 20).map(r => r.url);
  console.log('\n=== BATCH ' + (b + 1) + ' (' + batch.length + ') ===');
  console.log(JSON.stringify(batch));
}