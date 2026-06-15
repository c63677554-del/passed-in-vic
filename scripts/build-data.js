// Parse REAL "passed in" auction results (view.com.au / REIV feed) and geocode
// them via free OpenStreetMap Nominatim. Run: node build-data.js <exaFile> [--write]
const fs = require('fs');
const path = require('path');
const EXA = process.argv[2];
const WRITE = process.argv.includes('--write');
const text = JSON.parse(fs.readFileSync(EXA, 'utf8')).map(d => d.text || '').join('\n');

const TYPES = ['Townhouse', 'Apartment', 'House', 'Unit', 'Villa', 'Land'];
const re = /(?:\[|##\s*)([0-9][^,\n\]]{1,45}?,\s*[A-Za-z .'\-]+,\s*VIC\s*(\d{4}))/g;
const seen = new Set();
const props = [];
let m;
while ((m = re.exec(text)) !== null) {
  const win = text.slice(m.index, m.index + 240);
  if (!/Passed in/.test(win)) continue;
  const full = m[1].replace(/\s+/g, ' ').trim();
  const key = full.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  const parts = full.split(',').map(s => s.trim());
  const type = TYPES.find(t => new RegExp('\\b' + t + '\\b').test(win)) || null;
  const beds = (win.match(/(\d+)\s*Beds/) || [])[1];
  const post = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
  let agency = (post.match(/##\s*([^\n#\[]{2,55})/) || [])[1] || null;
  if (agency) { agency = agency.split(/[\[\(]/)[0].trim(); if (/VIC|^\d/.test(agency)) agency = null; }
  props.push({ address: parts[0], suburb: parts[1], postcode: m[2],
    type, beds: beds ? +beds : null, agency, vendor: /Vendor Bid/.test(win) });
}
console.log('PARSED passed-in:', props.length);
console.log(JSON.stringify(props, null, 1));

if (!WRITE) { console.log('\n(dry run — pass --write to geocode + emit data.js)'); process.exit(0); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function geo(q) {
  const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&q=' + encodeURIComponent(q);
  try { const r = await fetch(u, { headers: { 'User-Agent': 'passed-in-vic/1.0 (personal auction map)' } });
    if (!r.ok) return null; const j = await r.json(); return j[0] ? { lat: +(+j[0].lat).toFixed(6), lng: +(+j[0].lon).toFixed(6) } : null;
  } catch { return null; }
}
(async () => {
  const out = [];
  for (const p of props) {
    let g = await geo(`${p.address}, ${p.suburb} VIC ${p.postcode}, Australia`); await sleep(1100);
    if (!g) { g = await geo(`${p.suburb} VIC ${p.postcode}, Australia`); await sleep(1100); }
    if (!g) { console.log('  NO GEOCODE:', p.address, p.suburb); continue; }
    out.push({ address: p.address, suburb: p.suburb, postcode: p.postcode, lat: g.lat, lng: g.lng,
      type: p.type, beds: p.beds, baths: null, cars: null, price: null, vendor: null,
      agency: p.agency, week: '2026-05-09' });
    console.log('  ok:', p.address + ',', p.suburb, '->', g.lat, g.lng);
  }
  const hdr = '// REAL passed-in results from view.com.au (REIV-sourced data), geocoded via\n// OpenStreetMap Nominatim. ' + out.length + ' properties, week ending Sat 9 May 2026.\n// Regenerate with: node scripts/build-data.js <exaFile> --write\n';
  fs.writeFileSync(path.join(__dirname, '..', 'data.js'), hdr + 'const PASSED_IN = ' + JSON.stringify(out, null, 2) + ';\n');
  console.log('WROTE data.js with', out.length, 'real properties');
})();
