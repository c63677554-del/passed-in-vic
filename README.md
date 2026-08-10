# Passd 🏠📍

Live map of homes that passed in at auction across Melbourne, Sydney, Brisbane,
Adelaide and Canberra. **https://passd.au**

A home "passes in" when bidding does not reach the reserve. The owner still wants
to sell, the property is usually open to a private offer for a short window, and
those homes are hard to find because they drop out of the results most people
look at. Passd puts them on a map, refreshed weekly.

## This repository

This is the **static front end only**: HTML, CSS and vanilla JavaScript, served
by GitHub Pages. There is no build step.

| File | Purpose |
| --- | --- |
| `index.html` | Landing page, app shell, About modal |
| `app.js` | Map, list, filters, search, saved shortlist, share links |
| `auth.js` | Sign-in gate and subscription flow |
| `config.js` | Runtime config (public project URL + publishable key) |
| `styles.css` | All styling |
| `server.js` | Zero-dependency local static server (port 4173) |
| `privacy.html`, `terms.html` | Legal pages |

The dataset is fetched at runtime from a gated API and is not stored in this
repository.

## Features

- Price-pill markers with clustering beside a viewport-synced, sortable list
- Suburb, postcode and street-address search with autocomplete
- Filters for property type, minimum beds, max price, and auction week
- Listing status: homes that have since sold or been taken down are marked and
  hidden by default, so you are not clicking into dead listings
- Saved shortlist (stored in your browser) and shareable deep links
- Mobile list/map toggle, keyboard and screen-reader support

## Running locally

```
node server.js
```

Then open http://localhost:4173.

## Data and attribution

Property data comes from official public auction results and publicly listed
price guides. Figures are indicative, change without notice, and should always be
confirmed with the selling agent. Nothing here is financial advice.

Map tiles and geodata © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, ODbL.
