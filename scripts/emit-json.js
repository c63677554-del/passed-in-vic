// emit-json.js — one-off/standby: regenerate data.json from the current data.js.
// (The scrape and enrich scripts also write data.json at the end of every run.)
'use strict';
const fs = require('fs'), path = require('path');
const { readDataArray } = require('./lib');
const ROOT = path.join(__dirname, '..');
const t = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
const gen = (t.match(/DATA_GENERATED = "(\d{4}-\d{2}-\d{2})"/) || [])[1] || null;
const properties = readDataArray(t);
fs.writeFileSync(path.join(ROOT, 'data.json'), JSON.stringify({ generated: gen, properties }));
console.log('data.json written:', gen, '|', properties.length, 'properties');
