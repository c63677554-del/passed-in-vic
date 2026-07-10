# Passd 🏠📍

**Every Australian home that passed in at auction — Melbourne, Sydney, Brisbane, Adelaide, Canberra — mapped, priced and refreshed weekly.**

When a home passes in, bidding didn't reach the reserve. Most convert to private sale within
days, where vendors are far more open to negotiated offers. Passd is built to catch that window.

**Live:** https://c63677554-del.github.io/passed-in-vic/

## Features
- **REA-style two-pane UI** — price-pill markers with clustering beside a viewport-synced,
  sortable list. Click a pill or card for the full detail popup.
- **Search** — suburb, postcode or street address with keyboard-navigable autocomplete.
- **Filters** — property type, minimum beds, max price, plus a week selector
  (single week or "All recent weeks").
- **Price guides + listing links** — the agent's current guide and a direct **View listing**
  link (soho.com.au) wherever the live listing publishes one (~25%); the rest link to a
  Google search of the address.
- **Saved shortlist** — heart any home (stored in your browser); filter to ♥ Saved.
- **Shareable links** — the URL always encodes week, filters, map position and the selected
  home; *Copy link* in a popup deep-links straight to that property.
- Viewed-state pills, About/data-methodology modal, mobile list/map toggle, keyboard + SR support.

## How it works
```
REIV sitemap (~2,955 suburb pages)
  -> scripts/scrape-reiv.js    fetch every suburb table, keep Method = "Passed in *",
                               geocode (Nominatim -> photon fallback, cached), guards below
  -> scripts/enrich-prices.js  attach agent price guide + listing URL from soho.com.au
  -> scripts/validate-data.js  structural sanity checks (fail loudly, never publish junk)
  -> data.js                   static data (PASSED_IN + DATA_GENERATED)
  -> index.html + app.js + styles.css   Leaflet + markercluster + OSM, no build step, no keys
  -> GitHub Pages              static hosting
```

### Pipeline guards
| Guard | Behaviour |
| --- | --- |
| `--min-rows=15` | exit 2 if REIV markup breaks / returns too few rows — data.js untouched |
| Geocode floor | exit 3 if <50% of rows geocode — data.js untouched |
| VIC bounds check | wrong-state geocodes rejected; validator re-checks every row |
| Guide plausibility | "$1"-style placeholder guides rejected (must be $50k–$30m) |
| Retention | weeks older than `--retain-days` (default 84) pruned to bound payload |

## Run locally
```bash
npm run serve       # static site at http://localhost:4173
npm test            # unit tests (node:test, no deps)
npm run build:data  # scrape + enrich + validate -> data.js  (a few minutes)
npm run validate    # sanity-check data.js
```

## Weekly automation
Two equivalent paths (either keeps the site fresh):
1. **Windows Task Scheduler** *(active)* — task "Passd weekly refresh" runs
   `scripts/weekly-refresh.ps1` Sundays 8:30pm (catches up at next boot if the PC was off):
   pull → scrape → enrich → validate → commit → push → Pages redeploys.
2. **GitHub Actions** *(ready, needs a workflow-scoped push)* —
   `.github/workflows/scrape-and-deploy.yml` runs the same pipeline Sundays 11:00 UTC in CI.
   Pushing it requires `gh auth refresh -h github.com -s workflow` (one-time) because the
   current token lacks the `workflow` scope.

## Data & honest limitations
- **Coverage:** REIV's public pages surface only the **last couple of weekends**; Passd
  accumulates weeks as it refreshes (bounded by retention).
- **Prices are guides, not sale prices.** Passed-in homes have no sale price; the figure is
  the agent's *indicative* guide from the live listing and it changes. Most listings are
  **"contact agent."** Always confirm with the agent. Not financial advice.
- **Saves are per-browser** (localStorage, no accounts) — use *Copy link* to share a home.

## Responsible use
Data comes from REIV (`robots.txt: Allow: /`) and soho.com.au, fetched with limited
concurrency and cached geocodes (Nominatim ≤1 req/s per usage policy). Review each site's
terms before any commercial use; the app footer attributes REIV, soho, and OpenStreetMap.

## Repo layout
| Path | What |
| --- | --- |
| `index.html`, `app.js`, `styles.css`, `logo.svg` | the static app |
| `data.js` | generated data (`PASSED_IN`, `DATA_GENERATED`) |
| `scripts/lib.js` | shared pure helpers (parsing, dates, slugs, guards) |
| `scripts/lib.test.js` | unit tests (`npm test`) |
| `scripts/scrape-reiv.js` | REIV passed-in scraper with failure guards |
| `scripts/enrich-prices.js` | agent price guides + listing links from soho |
| `scripts/validate-data.js` | pre-deploy data sanity checks |
| `scripts/weekly-refresh.ps1` | Task Scheduler weekly pipeline entry point |
| `scripts/geocache.json` | address -> lat/lng cache |
| `server.js` | tiny zero-dependency local static server |
| `.github/workflows/scrape-and-deploy.yml` | CI weekly pipeline (pending workflow scope) |
