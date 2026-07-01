const fs = require('fs'), path = require('path');
const t = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const data = JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
const wk = data.filter(d => d.week === '2026-06-27');
console.log('June 27 week properties:', wk.length);
console.log('suburbs:', [...new Set(wk.map(d => d.suburb))].length);
wk.slice(0, 8).forEach(d => console.log('  ', d.address + ', ' + d.suburb + ' ' + (d.postcode || '') + ' | ' + d.type + ' ' + (d.beds || '?') + 'bd'));