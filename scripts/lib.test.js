// lib.test.js — unit tests for the shared pipeline helpers (node --test scripts/).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSuburbPage, extractPostcode, weekSaturday, daysAgo, priceOf, parsePriceRange, expand, slug, inVic, readDataArray } = require('./lib');

// A miniature REIV suburb page matching the real markup contract.
const FIXTURE = `
<h1>Market insights for Brunswick, 3056</h1>
<table class="results">
  <tr><th class="address">Address</th><th class="method">Method</th></tr>
  <tr>
    <td class="address">12 Smith Court, Brunswick</td>
    <td class="bedrooms">3</td>
    <td class="type">House</td>
    <td class="method">Passed in - vendor bid</td>
    <td class="sale_date">27/06/2026</td>
    <td class="agent">Nelson Alexander</td>
  </tr>
  <tr>
    <td class="address">4/9 Hope St, Brunswick</td>
    <td class="bedrooms">2</td>
    <td class="type">Apartment</td>
    <td class="method">Sold at auction</td>
    <td class="sale_date">27/06/2026</td>
    <td class="agent">Jellis Craig</td>
  </tr>
  <tr>
    <td class="address">88 Albert St, Brunswick</td>
    <td class="bedrooms"></td>
    <td class="type">Townhouse</td>
    <td class="method">Passed in</td>
    <td class="sale_date">28/06/2026</td>
    <td class="agent"></td>
  </tr>
</table>`;

test('parseSuburbPage keeps only passed-in rows and splits address/suburb', () => {
  const rows = parseSuburbPage(FIXTURE);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    address: '12 Smith Court', suburb: 'Brunswick', postcode: '3056',
    beds: 3, type: 'House', method: 'Passed in - vendor bid',
    saleDate: '27/06/2026', agency: 'Nelson Alexander',
  });
  assert.equal(rows[1].beds, null);
  assert.equal(rows[1].agency, null);
});

test('parseSuburbPage returns [] when there is no results table', () => {
  assert.deepEqual(parseSuburbPage('<html><body>No auctions</body></html>'), []);
});

test('extractPostcode reads the 4-digit code near "insights for"', () => {
  assert.equal(extractPostcode(FIXTURE), '3056');
  assert.equal(extractPostcode('<p>nothing here</p>'), null);
});

test('weekSaturday maps any day to its auction Saturday (local dates, no UTC drift)', () => {
  assert.equal(weekSaturday('27/06/2026'), '2026-06-27'); // Saturday stays
  assert.equal(weekSaturday('28/06/2026'), '2026-06-27'); // Sunday belongs to the Saturday before
  assert.equal(weekSaturday('24/06/2026'), '2026-06-27'); // midweek rolls forward
  assert.equal(weekSaturday('13/06/2026'), '2026-06-13');
  assert.equal(weekSaturday('not a date'), null);
});

test('daysAgo measures from an injectable now', () => {
  const now = new Date(2026, 6, 1).getTime(); // 1 Jul 2026 local
  assert.equal(Math.round(daysAgo('27/06/2026', now)), 4);
  assert.ok(daysAgo('', now) > 1e8); // unparseable -> huge (filtered out)
});

test('priceOf finds the structured soho price statement', () => {
  assert.equal(priceOf('<p>The price of 12 Smith Court is $1,150,000 - $1,250,000.</p>'), '$1,150,000 - $1,250,000');
  assert.equal(priceOf('<p>The price of 88 Albert St is $940,000.</p>'), '$940,000');
  assert.equal(priceOf('<p>No price statement here, just $5 chips.</p>'), null);
});

test('parsePriceRange handles single prices and ranges', () => {
  assert.deepEqual(parsePriceRange('$940,000'), { low: 940000, high: 940000 });
  assert.deepEqual(parsePriceRange('$1,150,000 - $1,250,000'), { low: 1150000, high: 1250000 });
  assert.equal(parsePriceRange('no dollars'), null);
});

test('expand + slug build soho listing slugs from REIV addresses', () => {
  assert.equal(slug(expand('12 Smith Ct') + ' brunswick vic 3056 australia'), '12-smith-court-brunswick-vic-3056-australia');
  assert.equal(slug(expand('4/9 Hope St') + ' brunswick vic 3056 australia'), '4-9-hope-street-brunswick-vic-3056-australia');
});

test('inVic bounds check', () => {
  assert.ok(inVic(-37.81, 144.96));   // Melbourne CBD
  assert.ok(!inVic(-33.87, 151.21));  // Sydney
  assert.ok(!inVic(null, 144.96));
});

test('readDataArray extracts the array from data.js source text', () => {
  const arr = readDataArray('// header\nconst DATA_GENERATED = "2026-07-01";\nconst PASSED_IN = [{"a":1},{"a":2}];\n');
  assert.equal(arr.length, 2);
});
