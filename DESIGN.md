# passd — Design System: "Signal"

> **Status: IMPLEMENTED, 13 Aug 2026.** This is the live system. It replaced
> "Slate & Mint" (teal + mint on a dark basemap), which replaced the original red
> identity.
>
> **Four tokens ship at values different from §1 below**, because the stated
> palette failed WCAG AA on measurement. This is the third revision of this design
> system where that happened, and each time the failing token had been assigned to
> real information rather than decoration — so the correction is to darken the
> token, not to accept the spec. Measured with `tools/contrast-audit.mjs`, which
> now covers 29 pairs and exits non-zero on any failure:
>
> | Token | Spec | Measured | Shipped | Now | Where it was used |
> | --- | --- | --- | --- | --- | --- |
> | `--grey-faint` | `#8A8A8A` | **3.45:1** on white | `#6E6E6E` | 5.10:1 | footer, placeholders, map attribution |
> | `--sold` | `#8A8A8A` | **3.08:1** on `--bg` | `#5E5E5E` | 5.78:1 | sold/removed status tag |
> | `--map-label` | `#6E6E6E` | **4.15:1** on `--map-land` | `#616161` | 5.04:1 | every map label |
> | `--signal-deep` | `#A8C400` | **1.99:1** on white | `#657600` | 5.07:1 | §1 recommends it as the foreground "where contrast is needed" |
>
> `--grey` also moved `#6E6E6E` → `#5E5E5E`. It passed (5.10:1), but `--grey-faint`
> had to land on `#6E6E6E` to pass, which would have collapsed the three-tier
> hierarchy into one value. The tiers are now 8.86 / 6.48 / 5.10 on white.
>
> Two of §1's stated figures were also inaccurate, though harmless: `--black` on
> `--signal` is **16.04:1** (spec said 15:1), and `--link` on white is **7.04:1**,
> not 8.2:1. Both pass comfortably.
>
> The `--signal`-as-text warning in §1 is correct and now enforced: it measures
> 1.23:1 on white, and the audit script asserts it stays unused as a foreground.

Spec for implementation. Layout and IA of the current site stay as-is; this changes
palette, type, component treatment and map styling.

Principle: the interface is near-monochrome so the **data is the only thing with colour**. Structure comes from hairline rules and hard edges, not shadows or rounded cards. The basemap is desaturated to greyscale so every cluster, price pill and marker reads as a signal on a neutral field — nothing on the map competes with the data layer.

---

## 1. Color tokens

```css
:root {
  /* Neutrals */
  --white:        #FFFFFF;  /* cards, top bar, filter bar */
  --bg:           #F2F2F0;  /* app background, list gutter */
  --line:         #DCDCDC;  /* hairline dividers, inactive borders */
  --line-soft:    #E4E4E4;  /* inside-card rules */
  --black:        #0A0A0A;  /* text, borders, structural rules */
  --grey:         #5E5E5E;  /* secondary text, timestamps - see banner */
  --grey-mid:     #4A4A4A;  /* body prose */
  --grey-faint:   #6E6E6E;  /* placeholders, attribution - see banner */

  /* Signal — used sparingly, never decorative */
  --signal:       #D7F53C;  /* highlight: passed-in state, clusters, key numbers */
  --signal-deep:  #657600;  /* signal as a foreground - see banner; prefer black */
  --link:         #1B34FF;  /* links and outbound actions only */

  /* Map */
  --map-land:     #E8E8E4;
  --map-water:    #DEDEDA;
  --map-road:     #FFFFFF;
  --map-line:     #CFCFCB;
  --map-label:    #616161;  /* see banner */

  /* States */
  --sold:         #5E5E5E;  /* sold / removed - see banner */
  --focus:        #1B34FF;
}
```

Rules
- **Two colours only: `--signal` and `--link`.** Everything else is black, white or grey. If a screen has a third hue, something is wrong.
- `--signal` is a *background* colour, always with `--black` text on it. It fails contrast as text on white — use `--signal-deep` if you ever need it as a foreground, and prefer black.
- `--link` is reserved for links and outbound actions (`VIEW ↗`, agent site). Never a fill, never a background.
- **No red anywhere.** "Passed in" is a fact, not an alarm — it gets `--signal`. Sold/removed goes `--sold` grey.
- Budget: at most one `--signal` element per result card, plus map markers.

Contrast: `--black` on `--signal` = **16.04:1**. `--link` on `--white` = **7.04:1**.
All three greys clear 4.5:1 on both `--white` and `--bg`, so any of them may carry
essential information at any size used here. Re-run `tools/contrast-audit.mjs`
after touching a token.

---

## 2. Typography

| Role | Font | Size / weight / treatment |
|---|---|---|
| Display (marketing, empty states) | Barlow Condensed 700 | 48–72px, UPPERCASE, line-height 0.95, +0.01em |
| Section heading | Barlow Condensed 700 | 24–32px, UPPERCASE |
| Card title (address) | Barlow Condensed 700 | 24px, UPPERCASE, line-height 1.0 |
| Body prose | Barlow 400 | 15px / 1.5, `--grey-mid` |
| Secondary (agency) | Barlow 400 | 12–13px, `--grey` |
| Labels, filters, nav, buttons | IBM Plex Mono 500 | 10.5–11px, +0.08em, UPPERCASE |
| Data: prices, counts, dates, suburb/postcode | IBM Plex Mono 400/500 | 10–13px, tabular |

- Load: `Barlow+Condensed:wght@600;700`, `Barlow:wght@400;500`, `IBM+Plex+Mono:wght@400;500`. `font-display: swap`.
- **The type system is the split:** street addresses and headings are condensed uppercase; every number, date, price, status and UI label is mono uppercase; only real sentences are Barlow regular sentence-case.
- `font-variant-numeric: tabular-nums` on all mono numerics so counts don't jitter when filters change.
- Never letterspace Barlow Condensed negatively; never lowercase the mono labels.
- `text-wrap: pretty` on paragraphs.

---

## 3. Space, radius, elevation

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48. Card padding 16px, list gutter 16px, bar padding 12px 16px.
- **Radius: 0 everywhere.** No pills, no rounded cards, no rounded inputs. The only circles are single-property map markers (see §4).
- **Elevation: none.** No box-shadows on cards, chips, bars or inputs. Separation is done with `1px solid var(--line)`.
  - Sole exception: elements floating over the map (popup, zoom stack, price labels) get `0 1px 0 var(--black)`-style hard offset or `0 2px 0 rgba(10,10,10,.12)` — a hard, un-blurred offset, never a soft glow.
- Structural rules: 1px `--black` under the top bar (the one heavy rule on screen); 1px `--line` for everything else.
- Result cards are **not** floating tiles — they are white rows separated by 1px `--line`, edge to edge in the list column.

---

## 4. Components

### Top bar
White, 56px, 1px `--black` bottom border. Logo: 16px `--signal` square with 1.5px black border + `PASSD` in Barlow Condensed 700 uppercase. Search field: full-width, `1px solid --black`, no radius, mono 11px placeholder in `--grey-faint`. Result count in mono with the number knocked out on signal: `[613] / 617 PASSED IN`. Location and period selectors are plain mono uppercase with a `▾`, no chrome.

### Filter chips (segmented rail, not pills)
A single flush row of mono uppercase items, divided by 1px `--line`, 36px tall, 12px horizontal padding. No gaps between them — the rule is the separator.
- default: transparent bg, `--grey-mid` text
- hover: bg `--bg`
- active: bg `--black`, `--white` text
- focus-visible: 2px `--focus` outline, 2px offset
- disabled: 40% opacity
Numeric filters (`2+ BED`, `$500K+`) use the same rail. Sort control sits right-aligned in `--grey`.

Checkbox ("Hide sold & removed"): 14px square, 1px `--black`, `--signal` fill with black tick when checked.

### Result row / card
White, 16px padding, 1px `--line` bottom border, no radius, no shadow.
1. **Status tag** — `--signal` block, `--black` mono 9.5px `PASSED IN`, 2px 6px padding, square. Date on the right, mono 10px `--grey`: `SAT 08 AUG`.
2. **Address** — Barlow Condensed 700, 24px uppercase, `--black`.
3. **Suburb line** — mono 11px `--grey`: `ABERFELDIE VIC 3040`.
4. **Price line** — Barlow 400 12.5px `--black` when known; `Contact agent for price` in `--grey-mid` when not (no colour — the absence of price is not an alert).
5. **Attribute tags** — mono 10px uppercase, `1px solid --black`, 2px 7px padding, 6px gap: `HOUSE` `3 BED` `AUCTION`.
6. **Footer** — 1px `--line-soft` top rule, agency in 11px Barlow `--grey`, `VIEW ↗` in mono 10.5px `--link` with a 1px `--link` underline.

States
- hover: bg `--bg`
- selected (synced with map): 3px `--signal` left inset bar, bg `--white`
- sold/removed: status tag becomes `--bg` with `--sold` text and 1px `--line` border; address at 70% opacity
- save/heart: 1.5px black outline icon → `--signal` fill with black stroke when saved

### Map — **greyscale basemap (required)**
The basemap must be visually desaturated so the data layer is the only colour on the map.
- Preferred: a greyscale/positron-style vector basemap (CARTO Positron, MapTiler "Greyscale"/"Basic" desaturated, or a Protomaps light theme) with land `--map-land`, water `--map-water`, roads `--map-road` with `--map-line` casing, labels `--map-label` mono-ish at 11px with a white halo, and **all POI icons, park green, landuse fills and commercial tints turned off**.
- Fallback if a raster basemap is used: apply `filter: grayscale(1) contrast(0.92) brightness(1.04)` to the tile layer only — never to marker or overlay panes (wrap tiles in their own pane/canvas so the filter can't touch the data layer).
- Never a dark basemap. Never a satellite/hybrid layer.

Markers
- **Cluster:** square, `--signal` fill, 1.5px `--black` border, `--black` mono 500 count, no radius, no shadow. Sizes 30 / 38 / 46px for <10 / 10–49 / 50+ (font 11 / 12 / 13px).
- **Single property:** 26px black square, white mono `1`; or a 26px circle if you want singles distinguishable from clusters at a glance — pick one and keep it consistent.
- **Active / hovered:** invert — `--black` fill, `--signal` text, border stays black. 180ms.
- **Price / attribute labels:** white block, 1px `--black`, mono 10px `--black`, 3px 8px padding, square: `$740K+`.
- **Zoom controls:** white square stack, 1px `--black`, black glyphs, no radius.
- **Popup:** white, 1px `--black`, square, a condensed version of the result row.
- Map has a 1px `--black` border against the list column.

### Footer / meta strip
White, 1px `--line` top border. All mono 10.5px `--grey-faint`; links `--link` underlined on hover. Disclaimer right-aligned in the same treatment — never red, never boxed.

---

## 5. Interaction

- Transitions: 120ms `ease-out` on background/border/colour; 180ms on marker invert. No easing with bounce, no scale transforms, no lift-on-hover.
- Focus: always visible — 2px `--focus` outline, 2px offset. Never removed.
- Loading: skeleton blocks in `--bg` (square, no shimmer gradient — a 1.2s opacity pulse only). Map shows a 2px `--signal` progress bar across the top while querying.
- Empty state: Barlow Condensed display line, one mono line of explanation, `--link` text button to clear filters.
- Reduced motion: disable marker transitions and the progress bar; keep instant state changes.
- Mobile: filter rail scrolls horizontally, items grow to 44px tall; all hit targets ≥44px. Map/list toggle is a two-item segment in the same rail style.

---

## 6. Tailwind config (if used)

> **Not applicable to this repo.** The site is vanilla CSS with no build step; there
> is no Tailwind. Implement §1 as CSS custom properties in `styles.css`. This block
> is kept only as a statement of the intended values.

```js
theme: {
  extend: {
    colors: {
      white: '#FFFFFF', bg: '#F2F2F0', black: '#0A0A0A',
      line: { DEFAULT: '#DCDCDC', soft: '#E4E4E4' },
      grey: { DEFAULT: '#6E6E6E', mid: '#4A4A4A', faint: '#8A8A8A' },
      signal: { DEFAULT: '#D7F53C', deep: '#A8C400' },
      link: '#1B34FF',
      map: { land: '#E8E8E4', water: '#DEDEDA', road: '#FFFFFF', line: '#CFCFCB', label: '#6E6E6E' },
      sold: '#8A8A8A',
    },
    fontFamily: {
      display: ['"Barlow Condensed"', 'sans-serif'],
      sans: ['Barlow', 'system-ui', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
    },
    borderRadius: { none: '0px' },
    boxShadow: { none: 'none' },
  }
}
```

Set `borderRadius.DEFAULT` to `0` and remove shadow utilities from the design vocabulary — if a component needs one, it's the wrong component.

---

## 7. Do / don't

Do: keep the current layout and filter behaviour; desaturate the basemap and turn off POI/landuse colour; put every numeral in mono; use `--signal` at most once per card; separate with 1px rules.

Don't: reintroduce red; use `--signal` as text on white; round any corner; add drop shadows or gradients; add a dark-map or satellite toggle; introduce a fourth typeface; use emoji or multicolour icon sets — use a single line-icon set at 1.5px stroke (Lucide), black only.
