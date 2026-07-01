# Passed In · Melbourne 🏠📍

A live **map + list** of residential properties that **passed in** at auction across
Melbourne and Victoria — scraped weekly from public REIV results, with the agent's
current price guide attached where one is published.

**Live:** https://c63677554-del.github.io/passed-in-vic/

## What it does
- Scrapes **every** Victorian suburb's auction table from REIV and keeps only the
  **"Passed in"** outcomes (at auction / vendor bid).
- Geocodes each address and attaches the **agent price guide** (from soho.com.au) where the
  listing publishes one; otherwise the tile shows **"Contact agent."**
- REA/Domain-style **two-pane UI**: a scrollable list beside the map that re-filters to the
  current viewport as you pan/zoom, plus **Type** and **Max price** filters and a week selector.
- Click a dot or card for details + a one-click Google search of the address.

## How it works
```
REIV sitemap (~2,955 suburb pages)
  -> scripts/scrape-reiv.js    fetch each suburb table, keep Method = "Passed in *", geocode
  -> scripts/enrich-prices.js  attach agent price guide from soho.com.au (listLow/listHigh)
  -> data.js                   static data (const PASSED_IN + DATA_GENERATED)
  -> index.html + app.js + styles.css   Leaflet + OpenStreetMap, no API key
  -> GitHub Pages              static hosting
```
A weekly GitHub Action runs the whole pipeline and commits `data.js`; Pages redeploys.

## Run locally
```bash
npm run serve       # static site at http://localhost:4173
npm run build:data  # scrape REIV + enrich prices -> data.js  (a few minutes)
# or individually:  npm run scrape   /   npm run enrich
```

## Automation
`.github/workflows/scrape-and-deploy.yml` runs every Sunday ~9pm Melbourne:
scrape -> enrich -> commit -> Pages redeploys. Trigger manually from the Actions tab.
_(Pushing the workflow file needs a `workflow`-scoped token: `gh auth refresh -h github.com -s workflow`.)_

## Data & honest limitations
- **Coverage:** REIV's public per-suburb pages only surface the **last couple of weekends**
  of results (older ones roll off), so the app typically shows ~2 recent weeks.
- **Prices are guides, not sale prices.** Passed-in homes have no sale price; the figure is the
  agent's *indicative* guide (Statement of Information range) from the live listing, and it
  changes. Many listings are **"Contact agent."** Always confirm with the agent. Not financial advice.
- **Geocoding:** OSM Nominatim by default (cached, rate-limited). For heavier/automated use set
  `GEOCODER=mapbox|google` + the matching secret.

## Responsible use
Data comes from REIV (`robots.txt: Allow: /`) and soho.com.au. The tools fetch with limited
concurrency and cache geocodes. Review each site's terms before any commercial use; the app
footer attributes REIV, soho, and OpenStreetMap.

## Repo layout
| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css` | the static map + list app |
| `data.js` | generated data (`PASSED_IN`, `DATA_GENERATED`) |
| `scripts/scrape-reiv.js` | REIV passed-in scraper (-> data.js) |
| `scripts/enrich-prices.js` | attaches agent price guides from soho |
| `scripts/geocache.json` | address -> lat/lng cache |
| `server.js` | tiny zero-dependency local static server |
| `.github/workflows/scrape-and-deploy.yml` | weekly scrape + enrich + redeploy |