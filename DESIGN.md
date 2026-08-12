# passd — Design System: "Slate & Mint"

Spec for implementation. Layout and IA of the current site stay as-is; this changes
palette, type, component treatment and map styling.

Principle: passd is a **data tool**, not a listings portal. Surfaces are cool and
quiet, teal carries interaction, mint is reserved for the "passed in" state, and the
map is the only dark region on screen so markers are the loudest thing in the UI.

This replaces the previous red identity (`#e4002b`), which was the exact brand red of
realestate.com.au on a near-identical pin-and-house mark. See "Migration" at the end.

> **Contrast note.** Every text/background pair below was computed against WCAG 2.1.
> Two corrections were made to the original draft:
> - `--teal` on white measures **5.10:1**, not 4.6:1 — it passes AA for all normal
>   body text, so no "semibold only" caveat is needed.
> - `--ink-subtle` was `#869492`, which measured 3.15:1 on white and 2.79:1 on
>   `--surface-sunk`. Both fail AA for normal text, and it was assigned to agency
>   names, timestamps and placeholders — information, not decoration. Darkened to
>   `#5F6E6C` (5.34:1 / 4.72:1), the lightest value in that hue passing on both.
>
> **Third correction, made during implementation (12 Aug 2026).** `--map-ink` was
> specified as `#6E8B84`, which measures **3.81:1** on `--map-bg` — below AA, on
> the token this spec assigns to map labels and to the attribution it explicitly
> asks to keep legible. Lightened to `#859E98` (**4.92:1**), the same hue stepped
> up until it clears 4.5. Three map elements were also specified as translucent
> (`seen`/`gone` pills at 86–92%, attribution at 90%); flattened over the dark
> basemap their text landed at 3.82–4.27:1, so they ship opaque. All 26 pairs in
> the implementation now pass; the audit script is reproducible.

---

## 1. Color tokens

```css
:root {
  /* Neutrals (cool, low chroma) */
  --bg:            #F4F7F6;  /* app background */
  --surface:       #FFFFFF;  /* cards, top bar, filter bar */
  --surface-sunk:  #EDF2F1;  /* inactive chips, search field, segment tracks */
  --border:        #DDE4E2;  /* 1px dividers, input borders */
  --border-soft:   #E2E8E7;  /* card borders */

  /* Text */
  --ink:           #0E1F1C;  /* headings, addresses, primary numbers */
  --ink-muted:     #5B6B68;  /* suburb, secondary lines */
  --ink-subtle:    #5F6E6C;  /* agency name, timestamps, placeholders */

  /* Brand / interaction */
  --teal:          #0E7C6B;  /* primary: active chip, links, logo pin, buttons */
  --teal-deep:     #0B5F52;  /* hover/pressed, text on mint */
  --teal-tint:     #E4FAF2;  /* status pill background, selected row */
  --mint:          #A8F0DC;  /* map clusters, highlight only — never body text */

  /* Map */
  --map-bg:        #16302B;  /* dark tile base */
  --map-ink:       #859E98;  /* tile labels/roads - corrected from #6E8B84, see note */

  /* Signals */
  --warn:          #C2410C;  /* "Contact agent for price", withdrawn */
  --sold:          #5B6B68;  /* sold / removed — neutral, not red */
  --focus:         #0E7C6B;
}
```

Rules

- **Mint is never a background for text smaller than 18px** and never used for links.
  Its jobs: map clusters, the active-marker halo, and small highlight bars.
- **No red anywhere.** "Passed in" is a neutral fact, not an alarm — it gets
  teal/mint. Money-unknown states get `--warn`. Sold/removed goes grey.
- Max two saturated colors visible in any one viewport (teal + mint). `--warn`
  appears at most once per card.
- Dark map is fixed, not a theme toggle. Light UI + dark map is the signature.

### Verified contrast

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--teal` on `--surface` | 5.10 | AA normal text |
| white on `--teal` (buttons, active chips) | 5.10 | AA normal text |
| `--ink-muted` on `--surface` | 5.60 | AA normal text |
| `--ink-subtle` on `--surface` | 5.34 | AA normal text |
| `--ink-subtle` on `--surface-sunk` | 4.72 | AA normal text |
| `--warn` on `--surface` | 5.18 | AA normal text |
| `--sold` on `--surface-sunk` | 4.96 | AA normal text |
| `--teal-deep` on `--teal-tint` | 6.94 | AA normal text |
| `#0B3B33` on `--mint` (cluster numerals) | 9.58 | AA normal text |

Re-measure if any token moves. Do not reintroduce a text colour below 4.5:1 against
the surface it sits on, at any size used in this UI.

---

## 2. Typography

| Role | Font | Size / weight / tracking |
| --- | --- | --- |
| Display (marketing, empty states) | Space Grotesk 700 | 40–56px, -0.03em, line-height 1.05 |
| Page/section heading | Space Grotesk 600 | 24px, -0.02em |
| Card title (address) | Space Grotesk 700 | 18px, -0.02em, line-height 1.2 |
| Body | Space Grotesk 400 | 15px / 1.55 |
| Secondary (suburb, agency) | Space Grotesk 400 | 13px, `--ink-muted` |
| Data / labels / counts | IBM Plex Mono 500 | 11–12px, +0.08em, UPPERCASE |
| Price & result counts | IBM Plex Mono 500 | 12–15px, tabular |

- Load `Space+Grotesk:wght@400;500;600;700` and `IBM+Plex+Mono:wght@400;500` with
  `font-display: swap`.
- **Every number, date, price, count and status label is IBM Plex Mono.** Prose and
  addresses are Space Grotesk. This split is the type system — don't blur it.
- `font-variant-numeric: tabular-nums` on all mono numerics so counts don't jitter on
  filter change.
- `text-wrap: pretty` on paragraphs; `text-wrap: balance` on headings.

---

## 3. Space, radius, elevation

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48. Card padding 16px, card gap 12px,
  list gutter 16px.
- Radius: `--r-sm: 8px` (inputs, chips), `--r-md: 12px` (cards, panels),
  `--r-pill: 999px` (filter chips, status pills, map price labels). No 4px, no 24px.
- Elevation: almost none. Cards use `1px solid var(--border-soft)`, no shadow. Only
  floating-over-map elements get shadow: `0 2px 8px rgba(14,31,28,.14)`. Map popups:
  `0 8px 24px rgba(14,31,28,.24)`.
- Border width is always 1px. Hairline dividers inside cards use `--border-soft`.

---

## 4. Components

### Top bar

White surface, 1px bottom border, 56px tall. Logo: teal map-pin glyph + `passd` in
Space Grotesk 700, -0.03em, lowercase. Search field is `--surface-sunk` with
`--border`, radius 8px, mono placeholder. Result count in mono: `613/617 passed in`
with the first number in `--teal` 500. Location and period selectors are borderless
sunk pills.

### Filter chips

Pill, 32px tall, 12px horizontal padding. Sans for type/bed labels, mono for numeric
ones like `2+`.

- default: `--surface-sunk` bg, `--ink-muted` text, no border
- hover: bg `#E4EAE9`
- active: `--teal` bg, white text, 500
- focus-visible: 2px `--focus` outline, 2px offset
- disabled: 40% opacity, no pointer

Checkbox ("Hide sold & removed"): 16px, teal fill when checked, white tick, radius 4px.

### Result card

`--surface`, radius 12px, 1px `--border-soft`, 16px padding.

1. **Status pill** — `--teal-tint` bg, `--teal-deep` text, 5px teal dot, mono 11px
   `PASSED IN`; date on the right in mono `SAT 8 AUG`.
2. **Address** — 18px Space Grotesk 700; suburb below in 13px `--ink-muted`.
3. **Price line** — mono. Known price: `--ink`. Unknown: `Contact agent for price` in
   `--warn`.
4. **Attribute chips** — outlined pills, `1px --border`, 10–11px, `--ink-muted`.
5. **Footer** — 1px `--border-soft` top rule, agency in 12px `--ink-subtle`,
   `View ↗` in `--teal` 600.

Hover: border to `--teal` at 40% (`#0E7C6B66`), no lift. Selected (synced with map):
2px left inset bar in `--mint` plus bg `--teal-tint` at 40%. Save/heart:
`--ink-subtle` outline, `--teal` filled when saved.

Sold/removed cards: status pill in `--sold` on `--surface-sunk`, address at 80%
opacity.

### Map

- Tiles: dark style on `--map-bg`. Land `#16302B`, water `#102622`, roads `#22443D`,
  labels `--map-ink` with no halo. Keep attribution legible: `--map-ink` at 12px.
- **Cluster markers:** circle, `--mint` fill, `#0B3B33` text, mono 500, radius 999px,
  soft ring `0 0 0 7px rgba(168,240,220,.16)`. Sizes: <10 → 30px, 10–49 → 38px,
  50+ → 46px (font 11/12/14px).
- **Single-property markers:** 30px circle, `--teal` fill, mint 1.5px ring, white mono
  count / `1`.
- **Active/hovered marker:** swap fill to white, text `--teal-deep`, ring grows to 10px.
- **Price / bed labels:** white 92% pill, radius 999px, mono 10px `--ink`, 1px
  `rgba(14,31,28,.08)` border, small shadow.
- Zoom controls: white 12px-radius stack, `--ink` glyphs, 1px `--border`, shadow.
- Popups: white, radius 12px, mini version of the result card.

### Footer / meta strip

`--surface` with 1px top border. All mono 11px `--ink-subtle`; links `--teal` with
underline on hover. Disclaimer right-aligned, same treatment, never red.

---

## 5. Interaction

- Transitions: 120ms `ease-out` on color/border/opacity; 180ms on marker size. Nothing
  longer, no bounce easing.
- Focus: always visible, 2px `--focus` outline + 2px offset; never remove outlines.
- Loading: skeletons in `--surface-sunk`, no spinners in the list; map shows a 2px
  `--mint` top progress bar while querying.
- Empty state: display type, one line of mono explanation, teal text button to clear
  filters.
- Reduced motion: drop marker-size and progress-bar animation.
- Hit targets >= 44px on mobile; chips grow to 40px tall in a horizontally scrolling
  row.

---

## 6. Do / don't

**Do:** keep the current layout and filter behaviour; put every numeral in mono; let
the dark map be the only dark surface; keep one accent per card.

**Don't:** reintroduce red; use mint for text or links; add drop shadows to list cards;
add gradients; add a light-map/dark-map toggle; introduce a third typeface; use emoji
or hand-drawn icon sets (use a single line-icon set at 1.5px stroke, e.g. Lucide).

---

## 7. Migration from the red identity

The site has **no build step** — it is vanilla CSS and hand-written HTML. There is no
Tailwind, so implement these tokens as CSS custom properties in `styles.css`. A
Tailwind config is not applicable here.

`#e4002b` appears in **21 hardcoded places across 5 files**, and most do not reference
the `--red` variable. Changing the variable alone leaves a half-rebranded site:

- `styles.css` — `--red`, `--red-600` (`#c50026`), `--red-050` (`#fff1f3`), plus
  hardcoded `rgba(228,0,43,...)` shadow values that never reference the variable.
- `logo.svg` — hardcoded fill.
- `index.html` — 4: the `theme-color` meta tag plus **three inline copies** of the logo
  SVG (header, landing, lapsed gate).
- `privacy.html` and `terms.html` — 2 each: an inline logo SVG and a link colour.
- `assets/hero-app.jpg` — a baked screenshot of the old red app. Re-shoot with the
  `scripts/screenshot/` rig in the pipeline repo, or the landing page will still show
  the old identity after everything else changes.

Sequencing notes:

- The **56px top bar** in this spec directly helps the known mobile problem, where
  header + teaser + filter bar consume ~340px of a 375px-wide viewport and leave
  roughly one card visible. Do the rebrand and the mobile fix together rather than
  twice over the same CSS.
- The **>= 44px hit targets** rule likewise supersedes the current ~113 targets that
  fall under the 24px WCAG minimum.
- The **dark basemap is the riskiest item.** The map currently loads OpenFreeMap
  Positron, a light style, via MapLibre GL. Swapping to a dark style means a different
  style URL and re-tuning marker contrast against it. Verify markers, cluster
  legibility and attribution against real data before shipping, and keep the raster
  fallback chain working.
- The two web fonts add render-blocking third-party requests to a site that currently
  ships no webfonts. Self-host or preload them, and confirm the landing page still
  paints quickly.
