const fs = require('fs'), path = require('path');
// Real listing price guides pulled from soho.com.au (agent Statement-of-Information ranges), keyed by listing URL.
const PRICES = {
  "https://soho.com.au/properties/auction/6-iramoo-court-albanvale-vic-3021-australia": "$680,000 - $720,000",
  "https://soho.com.au/properties/auction/101-maxweld-street-ardeer-vic-3022-australia": "$700,000 - $750,000",
  "https://soho.com.au/properties/auction/57-winton-road-ashburton-vic-3147-australia": "$2,200,000 - $2,400,000",
  "https://soho.com.au/properties/auction/2-37-aylmer-street-balwyn-north-vic-3104-australia": "$1,400,000 - $1,540,000",
  "https://soho.com.au/properties/auction/18-templestowe-road-bulleen-vic-3105-australia": "$840,000 - $920,000",
  "https://soho.com.au/properties/auction/85-settlement-road-bundoora-vic-3083-australia": "$720,000 - $792,000",
  "https://soho.com.au/properties/auction/15-kerr-crescent-camberwell-vic-3124-australia": "$2,450,000 - $2,695,000",
  "https://soho.com.au/properties/auction/33-eunice-drive-cheltenham-vic-3192-australia": "$930,000 - $1,020,000",
  "https://soho.com.au/properties/auction/60-ronald-street-coburg-north-vic-3058-australia": "$1,250,000",
  "https://soho.com.au/properties/auction/26-kernan-court-craigieburn-vic-3064-australia": "$629,000",
  "https://soho.com.au/properties/auction/50-scenery-drive-craigieburn-vic-3064-australia": "$740,000 - $760,000",
  "https://soho.com.au/properties/auction/3-christine-court-doncaster-vic-3108-australia": "$1,475,000 - $1,575,000",
  "https://soho.com.au/properties/auction/73-church-road-doncaster-vic-3108-australia": "$1,695,000 - $1,850,000",
  "https://soho.com.au/properties/auction/7-16-shepparson-avenue-carnegie-vic-3163-australia": "$430,000",
  "https://soho.com.au/properties/auction/4-20-fosbery-avenue-caulfield-north-vic-3161-australia": "$1,000,000 - $1,100,000"
};
const urls = JSON.parse(fs.readFileSync(path.join(__dirname, 'week-urls.json'), 'utf8'));
const byKey = {}; for (const u of urls) if (PRICES[u.url]) byKey[u.key] = PRICES[u.url];
const parse = s => { const n = [...s.matchAll(/\$([\d,]+)/g)].map(m => +m[1].replace(/,/g, '')); return n.length ? { low: Math.min(...n), high: Math.max(...n) } : null; };
const dp = path.join(__dirname, '..', 'data.js'); const t = fs.readFileSync(dp, 'utf8');
const data = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
let set = 0;
for (const d of data) {
  delete d.priceEst;                       // drop the suburb-median estimate
  const k = (d.address + '|' + d.suburb).toLowerCase();
  if (byKey[k]) { const p = parse(byKey[k]); d.listLow = p.low; d.listHigh = p.high; set++; }
  else { d.listLow = null; d.listHigh = null; }
}
const weeks = [...new Set(data.map(d => d.week))].sort().reverse();
const hdr = '// REAL passed-in results from REIV; this week\'s homes carry the agent price guide (soho.com.au).\n// ' + data.length + ' properties; ' + set + ' with a listed price; weeks: ' + weeks.join(', ') + '.\n';
fs.writeFileSync(dp, hdr + 'const PASSED_IN = ' + JSON.stringify(data, null, 2) + ';\n');
console.log('matched + set listing price on', set, 'of', urls.length, 'this-week homes');