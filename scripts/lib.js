// lib.js — shared pure helpers for the Passd data pipeline.
// Used by scrape-reiv.js, enrich-prices.js, validate-data.js and lib.test.js.
'use strict';

// ---------- HTML parsing (REIV per-suburb auction tables) ----------
const strip = s => (s || '').replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const cell = (row, c) => { const m = row.match(new RegExp('<td class="' + c + '[^"]*">([\\s\\S]*?)</td>')); return m ? strip(m[1]) : ''; };

function extractPostcode(html) {
  const i = html.search(/insights for/i); if (i < 0) return null;
  const seg = strip(html.slice(i, i + 260));
  const m = seg.match(/insights for[^\d]{0,40}(\d{4})/i);
  return m ? m[1] : null;
}

// Parse one REIV suburb page -> passed-in rows only.
function parseSuburbPage(html) {
  const t = html.match(/<table[^>]*>([\s\S]*?)<\/table>/); if (!t) return [];
  const pc = extractPostcode(html);
  const out = [];
  for (const row of (t[1].match(/<tr[\s\S]*?<\/tr>/g) || [])) {
    if (/<th/.test(row)) continue;
    const method = cell(row, 'method'); if (!/passed in/i.test(method)) continue;
    const full = cell(row, 'address'), i = full.lastIndexOf(',');
    out.push({
      address: i > 0 ? full.slice(0, i).trim() : full,
      suburb: i > 0 ? full.slice(i + 1).trim() : '',
      postcode: pc,
      beds: parseInt(cell(row, 'bedrooms'), 10) || null,
      type: cell(row, 'type') || null,
      method,
      saleDate: cell(row, 'sale_date'),
      agency: cell(row, 'agent') || null,
    });
  }
  return out;
}

// ---------- dates ----------
const parseDate = s => { const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };

// Any date -> ISO of its auction Saturday (Sunday belongs to the Saturday before).
// Built from local date parts, NOT toISOString, to avoid UTC off-by-one.
function weekSaturday(s) {
  const d = parseDate(s); if (!d) return null;
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -1 : 6 - dow));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const daysAgo = (s, now = Date.now()) => { const d = parseDate(s); return d ? (now - d) / 864e5 : 1e9; };

// ---------- soho.com.au slugs + price guides ----------
const AB = { ct: 'court', st: 'street', rd: 'road', av: 'avenue', ave: 'avenue', dr: 'drive', pl: 'place', cr: 'crescent', cres: 'crescent', gr: 'grove', gv: 'grove', pde: 'parade', tce: 'terrace', cl: 'close', ln: 'lane', bvd: 'boulevard', blvd: 'boulevard', sq: 'square', wy: 'way', hwy: 'highway', cct: 'circuit', esp: 'esplanade', gdns: 'gardens', cir: 'circle', pkwy: 'parkway', hts: 'heights', rdg: 'ridge', vw: 'view', qy: 'quay', grn: 'green', mw: 'mews' };
const expand = a => a.split(/\s+/).map(w => AB[w.toLowerCase().replace(/[.,]/g, '')] || w).join(' ');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// soho publishes a structured "The price of <addr> is $X[ - $Y]" statement.
const priceOf = html => { const m = html.match(/price of [^.<]{3,70}? is (\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?)/i); return m ? m[1] : null; };
const parsePriceRange = s => { const n = [...s.matchAll(/\$([\d,]+)/g)].map(m => +m[1].replace(/,/g, '')); return n.length ? { low: Math.min(...n), high: Math.max(...n) } : null; };

// ---------- misc ----------
// Bounded-concurrency map; per-item failures resolve to null instead of aborting the pool.
async function pool(items, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { res[k] = await fn(items[k], k); } catch { res[k] = null; } }
  }));
  return res;
}

// Victoria bounding box (with slack) — geocode + data sanity checks.
const VIC_BOUNDS = { latMin: -39.9, latMax: -33.8, lngMin: 140.5, lngMax: 150.5 };
const inVic = (lat, lng) => lat != null && lng != null && lat >= VIC_BOUNDS.latMin && lat <= VIC_BOUNDS.latMax && lng >= VIC_BOUNDS.lngMin && lng <= VIC_BOUNDS.lngMax;

// Extract the PASSED_IN array from a data.js source string.
function readDataArray(txt) {
  const a = txt.indexOf('['), b = txt.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  return JSON.parse(txt.slice(a, b + 1));
}

module.exports = { strip, cell, extractPostcode, parseSuburbPage, parseDate, weekSaturday, daysAgo, expand, slug, priceOf, parsePriceRange, pool, VIC_BOUNDS, inVic, readDataArray };
