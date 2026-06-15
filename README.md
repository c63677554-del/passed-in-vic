# Passed In · Melbourne 🏠📍

A live **map + list** of residential properties that **passed in** at auction across
Melbourne and Victoria — rebuilt automatically every week from public REIV results.

**Live:** https://c63677554-del.github.io/passed-in-vic/ &nbsp;·&nbsp; refreshes every Sunday night.

## What it does
- Scrapes **every** Victorian suburb's auction results from REIV, keeps only the
  **"Passed in"** outcomes (at auction / vendor bid), geocodes them, and plots them.
- REA/Domain-style **two-pane UI**: a scrollable property list beside the map that
  re-filters to whatever is in the current viewport as you pan and zoom.
- Click a dot or a card for details (result type, auction date, agent) and a one-click
  Google search of the address.

## How it works
```
REIV sitemap (≈2,955 suburb pages)
  → scripts/scrape-reiv.js   fetch each suburb table, keep Method = "Passed in *"
  → geocode                  Nominatim by default; Mapbox/Google via env
  → data.js                  static data file
  → index.html + app.js + styles.css   (Leaflet + OpenStreetMap, no API key)
  → GitHub Pages             static hosting
```
A GitHub Action re-runs the scrape every Sunday and commits `data.js`; Pages redeploys.

## Run locally
```bash
node server.js                       # serves the static site at http://localhost:4173
node scripts/scrape-reiv.js --days=9 # refresh data.js from REIV (writes ../data.js)
```

## Weekly automation
[`.github/workflows/scrape-and-deploy.yml`](.github/workflows/scrape-and-deploy.yml)
runs the scrape every Sunday 11:00 UTC (~9pm Melbourne) and commits the refreshed
`data.js`, which redeploys the site. Trigger it manually from the Actions tab anytime.

## Production geocoding
The default geocoder is **OSM Nominatim**, cached in `scripts/geocache.json`. It's fine
for low volume but **not licensed for bulk/automated use**. For the live weekly service,
set a repo Variable `GEOCODER=mapbox` (or `google`) and the matching secret
(`MAPBOX_TOKEN` / `GOOGLE_MAPS_API_KEY`) — the scraper picks it up automatically.

## Data & responsible use
Results come from REIV's public per-suburb pages (`robots.txt: Allow: /`). Scrape gently
(this tool fetches with limited concurrency and caches geocodes), attribute REIV, and
review their terms before any commercial use.

## Repo layout
| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css`, `data.js` | the static map + list app |
| `server.js` | tiny zero-dependency local static server |
| `scripts/scrape-reiv.js` | the weekly REIV passed-in scraper |
| `.github/workflows/scrape-and-deploy.yml` | weekly scrape + redeploy |
| `web/`, `scraper/`, `supabase/` | earlier Next.js + Supabase + Python prototype (optional) |
