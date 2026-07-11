# Landing hero screenshot rig

`shot.js` drives headless Chrome over raw CDP (no npm deps, Node >= 22) to
capture the app for the landing background (`assets/hero-app.jpg`).

Re-shoot when the hero's week label looks stale:

```powershell
# 1) Mint a one-time magic link for the comped test account (uses .passd-backend.env):
#    POST {SUPABASE_URL}/auth/v1/admin/generate_link  type=magiclink  → action_link
# 2) First run consumes the link and persists the session in the profile dir:
node scripts/screenshot/shot.js "<action_link>" hero.jpg 75000 5000
# 3) Subsequent runs reuse the session - position via the share-hash, sort via postready.js:
node scripts/screenshot/shot.js "https://passd.au/#c=-37.8250,144.9900,12" assets/hero-app.jpg 75000 4000 scripts/screenshot/postready.js 1.5 84
```

Args: `url out.jpg [timeoutMs] [settleMs] [postJsFile|-] [deviceScaleFactor] [jpegQuality] [readyExprFile|-] [profileDir] [viewW] [viewH]`.

- Default ready-check waits for the map: GL style + tiles loaded, >10 pins.
- `landing-ready.js` is the signed-out ready-check (landing visible + hero loaded)
  for verifying the landing page itself; pass a fresh `profileDir` to be signed out.
- `postready.js` switches the sort to a price sort so priced cards lead the rail.
- Headless note: hidden *tabs* freeze rAF and stall maplibre, but headless Chrome
  renders normally - this rig exists so verification never depends on a visible window.
