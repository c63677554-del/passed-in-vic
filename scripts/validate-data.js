// validate-data.js — sanity-check data.js before deploying. Exits non-zero on
// structural problems so the weekly pipeline fails loudly instead of publishing junk.
'use strict';
const fs = require('fs'), path = require('path');
const { inState, readDataArray, parseDate, weekSaturday } = require('./lib');

const txt = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const gen = (txt.match(/const DATA_GENERATED = "(\d{4}-\d{2}-\d{2})"/) || [])[1];
const arr = readDataArray(txt);

const errs = [], warns = [];
if (!gen) errs.push('DATA_GENERATED missing or malformed');
if (!Array.isArray(arr) || arr.length === 0) errs.push('PASSED_IN is empty');

const seen = new Set();
for (const p of arr) {
  const tag = `${p.address}, ${p.suburb} (${p.week})`;
  const k = (p.address + '|' + p.suburb + '|' + p.week).toLowerCase();
  if (seen.has(k)) errs.push('duplicate: ' + tag); seen.add(k);
  if (!p.address || !p.suburb) errs.push('missing address/suburb: ' + JSON.stringify(p).slice(0, 100));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.week || '')) errs.push('bad week: ' + tag);
  else if (p.saleDate && weekSaturday(p.saleDate) !== p.week) errs.push('week does not match saleDate: ' + tag);
  if (!inState(p.state || 'VIC', p.lat, p.lng)) errs.push('geocode outside ' + (p.state || 'VIC') + ': ' + tag + ' @ ' + p.lat + ',' + p.lng);
  if (!/passed in/i.test(p.method || '')) errs.push('non-passed-in row leaked in: ' + tag);
  if (p.listLow != null && p.listHigh != null && p.listHigh < p.listLow) errs.push('listHigh < listLow: ' + tag);
  if (p.listLow != null && (p.listLow < 50000 || p.listLow > 30000000)) warns.push('implausible guide $' + p.listLow + ': ' + tag);
  if (p.listUrl && !/^https:\/\/(soho\.com\.au|www\.domain\.com\.au)\//.test(p.listUrl)) errs.push('unexpected listUrl origin: ' + tag);
  if (p.saleDate && !parseDate(p.saleDate)) errs.push('unparseable saleDate: ' + tag);
}

const weeks = [...new Set(arr.map(p => p.week))].sort();
const priced = arr.filter(p => p.listLow != null).length;
const linked = arr.filter(p => p.listUrl).length;
console.log(`validate: ${arr.length} properties | weeks: ${weeks.join(', ')} | ${priced} priced (${Math.round(priced / (arr.length || 1) * 100)}%) | ${linked} with listing link | generated ${gen}`);
for (const w of warns.slice(0, 12)) console.warn('WARN:', w);
if (errs.length) {
  for (const e of errs.slice(0, 25)) console.error('ERROR:', e);
  console.error(`validate: FAILED with ${errs.length} error(s)`);
  process.exit(1);
}
console.log('validate: OK');
