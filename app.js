"use strict";

/* Passd — Melbourne auction pass-ins. REA-style two-pane UI: price-pill markers
   with clustering, viewport-synced list, suburb/address search, type/beds/price
   filters, sorting, a localStorage shortlist, and shareable URL state.
   Data: data.js (DATA, DATA_GENERATED), refreshed weekly by scripts/. */

// ---------- tiny helpers ----------
const el = (id) => document.getElementById(id);
const cardEl = (id) => document.querySelector('.card[data-id="' + id + '"]');
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Stable id from the dedupe key — survives weekly data regeneration.
function hid(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return "p" + h.toString(36); }

function weekLabel(iso) {
  const end = new Date(iso + "T00:00:00");
  const start = new Date(end); start.setDate(start.getDate() - 6);
  const f = (d, o) => d.toLocaleDateString("en-AU", o);
  return `${f(start, { day: "numeric", month: "short" })} – ${f(end, { day: "numeric", month: "short", year: "numeric" })}`;
}
const parseAU = (s) => { const m = (s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const fmtDay = (s) => { const d = parseAU(s); return d ? d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null; };
const isVendor = (m) => /vendor/i.test(m || "");
const resultChip = (m) => (isVendor(m) ? "Vendor bid" : "At auction");
const fmtPrice = (n) => (n == null ? null : n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "m" : "$" + Math.round(n / 1e3) + "k");
const fmtGuide = (p) => (p.listLow == null ? null : p.listHigh > p.listLow ? fmtPrice(p.listLow) + " – " + fmtPrice(p.listHigh) : fmtPrice(p.listLow));
// Best available price signal: agent guide first, else the reported passed-in bid.
const pricedValue = (p) => p.listLow ?? p.bid ?? null;
const subline = (p) => [p.suburb, p.state || "VIC", p.postcode].filter(Boolean).join(" ");
const googleUrl = (p) => "https://www.google.com/search?q=" + encodeURIComponent([p.address, p.suburb, p.state || "VIC", p.postcode].filter(Boolean).join(" "));
const listingUrl = (p) => p.listUrl || googleUrl(p);
const HEART = (on) => `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.3 4.9 5.9 4.3c2-.3 3.9.6 5 2.2a5.6 5.6 0 0 1 5-2.2c3.7.6 5.4 4.3 4 7.4-2.6 4.6-10 9.3-10 9.3z" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>`;
const LINKIC = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M10 13.5a4.7 4.7 0 0 0 7 .4l2.6-2.6a4.7 4.7 0 0 0-6.6-6.6l-1.5 1.5M14 10.5a4.7 4.7 0 0 0-7-.4l-2.6 2.6a4.7 4.7 0 0 0 6.6 6.6l1.5-1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

// ---------- data + persistent state ----------
// The dataset arrives via PassdGate.ready(): bundled data.js in legacy mode,
// or the authenticated get-data endpoint (teaser/full) in gated mode.
let DATA = [], WEEKS = [], GENERATED = null, appTier = "legacy";
function setDataset(props, gen) {
  DATA = props || [];
  GENERATED = gen || null;
  DATA.forEach((p) => (p.id = hid((p.address + "|" + p.suburb + "|" + p.week).toLowerCase())));
  WEEKS = [...new Set(DATA.map((p) => p.week))].sort().reverse();
  SUBURBS = buildSuburbs();
  if (!week || (week !== "all" && !WEEKS.includes(week))) week = WEEKS[0] || null;
}
const TYPES = ["House", "Townhouse", "Apartment", "Unit"];
const saved = new Set(store.get("passd.saved", []));
const seenIds = new Set(store.get("passd.seen", []));

let map, cluster, byId = {}, selectedId = null;
let week = null;                       // iso Saturday or "all"; defaulted in setDataset()
const CITIES = ["Melbourne", "Sydney", "Brisbane", "Adelaide", "Canberra"];
// Metro framing: city feeds are state-wide (e.g. Cairns arrives under the
// Brisbane feed), so selecting a city orients the map on its metro box —
// regional homes stay in the list and appear as you zoom/pan out.
const METRO_BOUNDS = {
  Melbourne: [[-38.35, 144.45], [-37.45, 145.60]],
  Sydney: [[-34.15, 150.55], [-33.55, 151.35]],
  Brisbane: [[-27.75, 152.65], [-27.10, 153.35]],
  Adelaide: [[-35.25, 138.40], [-34.60, 138.80]],
  Canberra: [[-35.60, 148.95], [-35.10, 149.30]],
};
function fitCity() {
  if (!map) return;
  if (city.startsWith("area:") && AREAS[city.slice(5)]) { map.fitBounds(AREAS[city.slice(5)].box, { padding: [20, 20] }); return; }
  if (city !== "all" && METRO_BOUNDS[city]) { map.fitBounds(METRO_BOUNDS[city], { padding: [20, 20] }); return; }
  const pts = forWeek().map((p) => [p.lat, p.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
}
let city = store.get("passd.city", "Melbourne"); // "all", a CITIES entry, or "regional:STATE"
const METRO_CITY = { VIC: "Melbourne", NSW: "Sydney", QLD: "Brisbane", SA: "Adelaide", ACT: "Canberra" };
// Named regional areas (shown in the dropdown only when they have homes).
const AREAS = {
  "Cairns": { state: "QLD", box: [[-17.10, 145.55], [-16.60, 145.90]] },
  "Gold Coast": { state: "QLD", box: [[-28.25, 153.15], [-27.65, 153.60]] },
  "Sunshine Coast": { state: "QLD", box: [[-26.90, 152.85], [-26.30, 153.25]] },
  "Geelong": { state: "VIC", box: [[-38.35, 144.20], [-38.00, 144.65]] },
  "Newcastle": { state: "NSW", box: [[-33.10, 151.50], [-32.75, 151.90]] },
  "Wollongong": { state: "NSW", box: [[-34.65, 150.70], [-34.25, 151.05]] },
};
const inBox = (p, box) => p.lat >= box[0][0] && p.lat <= box[1][0] && p.lng >= box[0][1] && p.lng <= box[1][1];
const inMetro = (p) => {
  const box = METRO_BOUNDS[METRO_CITY[p.state || "VIC"]];
  return !box || (p.lat >= box[0][0] && p.lat <= box[1][0] && p.lng >= box[0][1] && p.lng <= box[1][1]);
};
const cityOk = (p) => {
  if (city === "all") return true;
  if (city.startsWith("area:")) { const a = AREAS[city.slice(5)]; return !!a && (p.state || "VIC") === a.state && inBox(p, a.box); }
  if (city.startsWith("regional:")) return (p.state || "VIC") === city.slice(9) && !inMetro(p);
  return (p.city || "Melbourne") === city;
};
let activeTypes = new Set();           // empty = all types
let maxPrice = null;                   // number | null
let minBeds = null;                    // number | null
let sortBy = "new";                    // new | priceAsc | priceDesc | beds | az
let restoredView = false;              // deep link carried a map position

// ---------- URL state (shareable links) ----------
function readURL() {
  const h = new URLSearchParams(location.hash.slice(1));
  const w = h.get("w"); if (w && (w === "all" || WEEKS.includes(w))) week = w;
  const t = h.get("t"); if (t) activeTypes = new Set(t.split(".").filter((x) => TYPES.includes(x)));
  const p = +h.get("p"); if (p) maxPrice = p;
  const b = +h.get("b"); if (b) minBeds = b;
  const ct = h.get("ct"); if (ct && (ct === "all" || CITIES.includes(ct) || ct.startsWith("regional:") || ct.startsWith("area:"))) city = ct;
  const s = h.get("s"); if (["priceAsc", "priceDesc", "beds", "az"].includes(s)) sortBy = s;
  return { sel: h.get("sel"), c: h.get("c") };
}
let urlT = null;
function writeURL() {
  clearTimeout(urlT);
  urlT = setTimeout(() => {
    const h = new URLSearchParams();
    if (week && week !== WEEKS[0]) h.set("w", week);
    if (activeTypes.size) h.set("t", [...activeTypes].join("."));
    if (maxPrice != null) h.set("p", maxPrice);
    if (minBeds != null) h.set("b", minBeds);
    if (city !== "Melbourne") h.set("ct", city);
    if (sortBy !== "new") h.set("s", sortBy);
    if (selectedId) h.set("sel", selectedId);
    if (map) { const c = map.getCenter(); h.set("c", c.lat.toFixed(5) + "," + c.lng.toFixed(5) + "," + map.getZoom()); }
    history.replaceState(null, "", "#" + h.toString());
  }, 250);
}

// ---------- basemap (OpenStreetMap, auto-fallback to Esri if blocked) ----------
const TILES = [
  { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", opt: { subdomains: "abc", maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", opt: { maxZoom: 19, attribution: "Tiles &copy; Esri" } },
];
function addBasemap() {
  // Minimal vector basemap (OpenFreeMap Positron via MapLibre GL) — clean,
  // REA-like, free and keyless. Raster chain remains as the fallback when the
  // GL libraries fail to load or the CDN is unreachable.
  if (window.maplibregl && L.maplibreGL) {
    try {
      L.maplibreGL({
        style: "https://tiles.openfreemap.org/styles/positron",
        attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        fadeDuration: 0, // skip label cross-fade work while panning
      }).addTo(map);
      return;
    } catch { /* fall through to raster */ }
  }
  let i = 0, loaded = false, errs = 0, base = null;
  (function add() {
    base = L.tileLayer(TILES[i].url, TILES[i].opt).addTo(map);
    base.on("load", () => (loaded = true));
    base.on("tileerror", () => { if (!loaded && ++errs >= 6 && i < TILES.length - 1) { i++; errs = 0; map.removeLayer(base); add(); } });
  })();
}

// ---------- data slices ----------
const forWeek = () => DATA.filter((p) => (week === "all" || p.week === week) && cityOk(p) && p.lat != null && p.lng != null);
const typeOk = (p) => activeTypes.size === 0 || activeTypes.has(p.type);
// "Price on request" homes always pass the price filter — an unknown guide could
// be in budget, so showing beats hiding.
const priceOk = (p) => maxPrice == null || pricedValue(p) == null || pricedValue(p) <= maxPrice;
const bedsOk = (p) => minBeds == null || (p.beds != null && p.beds >= minBeds);
const forView = () => forWeek().filter((p) => typeOk(p) && priceOk(p) && bedsOk(p));
function visible() {
  const sz = map.getSize();
  if (!sz || sz.x < 10 || sz.y < 10) return forView(); // map pane hidden (mobile list view)
  const b = map.getBounds();
  return forView().filter((p) => b.contains([p.lat, p.lng]));
}

// ---------- markers: REA-style price pills + clusters ----------
function pinHTML(p) {
  const cls = "pin" + (p.id === selectedId ? " sel" : seenIds.has(p.id) ? " seen" : "");
  const label = p.listLow != null ? fmtPrice(p.listLow) + (p.listHigh > p.listLow ? "+" : "") : p.bid != null ? fmtPrice(p.bid) : p.beds != null ? p.beds + " bd" : p.type || "•";
  const hh = saved.has(p.id) ? `<span class="ph">${HEART(true)}</span>` : "";
  return `<div class="${cls}" data-pin="${p.id}">${hh}${esc(label)}</div>`;
}
const pinIcon = (p) => L.divIcon({ className: "pinwrap", html: pinHTML(p), iconSize: [0, 0] });
function refreshPin(id) { const m = byId[id]; const p = DATA.find((x) => x.id === id); if (m && p) { m.setIcon(pinIcon(p)); m.setZIndexOffset(id === selectedId ? 1200 : saved.has(id) ? 400 : 0); } }

function markerPopup(p) {
  const on = saved.has(p.id);
  const guide = p.listLow != null
    ? `<span class="ppg">${fmtGuide(p)}</span> <span class="gmut">price guide</span>`
    : p.bid != null
    ? `<span class="ppg">${fmtPrice(p.bid)}</span> <span class="gmut">passed-in bid</span>`
    : `<span class="gmut">Price on request — contact agent</span>`;
  const meta = [p.type, p.beds != null ? p.beds + " bed" : null, resultChip(p.method)].filter(Boolean).join(" · ");
  const when = [fmtDay(p.saleDate) ? "Passed in " + fmtDay(p.saleDate) : null, p.agency].filter(Boolean).join(" · ");
  return `<div class="pp">
    <div class="pp-top"><span class="badge">Passed in</span><span class="ppdate">${esc(fmtDay(p.saleDate) || "")}</span></div>
    <div class="ppprice">${guide}</div>
    <div class="b">${esc(p.address)}</div>
    <div class="s">${esc(subline(p))}</div>
    <div class="m">${esc(meta)}${p.agency ? "<br>" + esc(p.agency) : ""}</div>
    <div class="ppact">
      <a class="ppbtn pri" href="${esc(listingUrl(p))}" target="_blank" rel="noopener noreferrer">${p.listUrl ? "View listing" : "Search Google"}</a>
      <button class="ppbtn ghost heart${on ? " on" : ""}" type="button" data-save="${p.id}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Add to"} saved">${HEART(on)}</button>
      <button class="ppbtn ghost" type="button" data-share="${p.id}" aria-label="Copy link to this home">${LINKIC}</button>
    </div>
  </div>`;
}

function renderMarkers() {
  cluster.clearLayers(); byId = {};
  const ms = forView().map((p) => {
    const m = L.marker([p.lat, p.lng], { icon: pinIcon(p), keyboard: false, riseOnHover: true });
    m.bindPopup(() => markerPopup(p), { maxWidth: 288, autoPanPadding: [30, 30] });
    m.on("click", () => select(p.id, "map"));
    m.on("mouseover", () => { const c = cardEl(p.id); if (c) c.classList.add("hl"); });
    m.on("mouseout", () => { const c = cardEl(p.id); if (c) c.classList.remove("hl"); });
    if (saved.has(p.id)) m.setZIndexOffset(400);
    byId[p.id] = m;
    return m;
  });
  if (cluster.addLayers) cluster.addLayers(ms); else ms.forEach((m) => m.addTo(cluster));
}

// ---------- list ----------
const SORTS = [
  { v: "new", label: "Newest" },
  { v: "priceAsc", label: "Price low–high" },
  { v: "priceDesc", label: "Price high–low" },
  { v: "beds", label: "Most beds" },
  { v: "az", label: "Suburb A–Z" },
];
function cmp(a, b) {
  switch (sortBy) {
    case "priceAsc": return (pricedValue(a) ?? Infinity) - (pricedValue(b) ?? Infinity) || (a.suburb || "").localeCompare(b.suburb || "");
    case "priceDesc": return (pricedValue(b) ?? -Infinity) - (pricedValue(a) ?? -Infinity) || (a.suburb || "").localeCompare(b.suburb || "");
    case "beds": return (b.beds ?? -1) - (a.beds ?? -1) || (pricedValue(a) ?? Infinity) - (pricedValue(b) ?? Infinity);
    case "az": return (a.suburb || "").localeCompare(b.suburb || "") || a.address.localeCompare(b.address);
    default: return (b.week || "").localeCompare(a.week || "") || (a.suburb || "").localeCompare(b.suburb || "") || a.address.localeCompare(b.address);
  }
}
function cardHTML(p) {
  const on = saved.has(p.id);
  return `<article class="card${p.id === selectedId ? " sel" : ""}" data-id="${p.id}" role="button" tabindex="0" aria-label="Passed in: ${esc(p.address)}, ${esc(p.suburb)}">
    <button class="heart${on ? " on" : ""}" type="button" data-save="${p.id}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Add to"} saved">${HEART(on)}</button>
    <div class="row1"><span class="badge">Passed in</span><span class="datechip">${esc(fmtDay(p.saleDate) || "")}</span>${seenIds.has(p.id) ? '<span class="seenchip">Viewed</span>' : ""}</div>
    <div class="price">${p.listLow != null ? `${fmtGuide(p)} <span class="est">price guide</span>` : p.bid != null ? `${fmtPrice(p.bid)} <span class="est">passed-in bid</span>` : `<span class="ca">Contact agent for price</span>`}</div>
    <div class="addr">${esc(p.address)}</div>
    <div class="sub">${esc(subline(p))}</div>
    <div class="meta">
      ${p.type ? `<span class="chip">${esc(p.type)}</span>` : ""}
      ${p.beds != null ? `<span class="chip">${p.beds} bed</span>` : ""}
      <span class="chip">${resultChip(p.method)}</span>
    </div>
    <div class="foot">
      <span>${esc(p.agency || "")}</span>
      <a class="search" href="${esc(listingUrl(p))}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${p.listUrl ? "View listing" : "Search"} &#8599;</a>
    </div>
  </article>`;
}
function updateList() {
  const vis = visible().sort(cmp);
  const total = forView().length;
  el("count").innerHTML = `<b>${vis.length}</b>${vis.length !== total ? ` of ${total}` : ""} passed in`;
  const MAX_CARDS = 120; // rendering hundreds of cards per pan is the lag source
  let html;
  if (vis.length > MAX_CARDS) html = vis.slice(0, MAX_CARDS).map(cardHTML).join("") + `<div class="morecards">Showing ${MAX_CARDS} of ${vis.length} — zoom the map or add filters to narrow down.</div>`;
  else if (vis.length) html = vis.map(cardHTML).join("");
  else html = `<div class="empty">No passed-in homes match here.<br>Zoom out, pan the map, or <button class="linkbtn" type="button" data-reset>clear the filters</button>.</div>`;
  el("list").innerHTML = html;
  updateSavedChip();
}
function updateSavedChip() {
  const n = saved.size, sc = el("savedCount");
  if (sc) { sc.hidden = n === 0; sc.textContent = n; }
}
// ---------- saved panel (header) ----------
function renderSavedPanel() {
  const box = el("savedList");
  if (!box) return;
  const items = DATA.filter((p) => saved.has(p.id)).sort((a, b) => (b.week || "").localeCompare(a.week || ""));
  box.innerHTML = items.length
    ? items.map(cardHTML).join("")
    : `<div class="empty">Nothing saved yet.<br>Tap the <b>♡</b> on any home to build your shortlist.</div>`;
}
function openSavedPanel() {
  renderSavedPanel();
  const m = el("savedModal");
  m.hidden = false; requestAnimationFrame(() => m.classList.add("open"));
}
function closeSavedPanel() {
  const m = el("savedModal");
  m.classList.remove("open"); setTimeout(() => (m.hidden = true), 180);
}
// ---------- adaptive pricing UI ----------
// If the current city/week has effectively no price signals, price controls are
// dead weight — hide the max-price filter and drop the price sorts.
function updatePricingUI() {
  const priced = forWeek().filter((p) => pricedValue(p) != null).length;
  const usable = priced >= 5;
  const mp = el("maxPrice");
  if (mp) { mp.hidden = !usable; if (!usable && maxPrice != null) { maxPrice = null; mp.value = ""; } }
  const sb = el("sortBy");
  if (sb) {
    const opts = SORTS.filter((s) => usable || (s.v !== "priceAsc" && s.v !== "priceDesc"));
    if (!opts.some((s) => s.v === sortBy)) sortBy = "new";
    sb.innerHTML = opts.map((s) => `<option value="${s.v}">${s.label}</option>`).join("");
    sb.value = sortBy;
  }
}

// ---------- selection / two-way sync ----------
function markSeen(id) { if (!seenIds.has(id)) { seenIds.add(id); store.set("passd.seen", [...seenIds]); } }
function select(id, from) {
  const prev = selectedId;
  selectedId = id;
  const p = DATA.find((x) => x.id === id); if (!p) return;
  markSeen(id);
  if (prev && byId[prev]) refreshPin(prev);
  refreshPin(id);
  document.querySelectorAll(".card.sel").forEach((c) => c.classList.remove("sel"));
  const m = byId[id];
  if (from === "list" || from === "search") {
    if (m && cluster.zoomToShowLayer) cluster.zoomToShowLayer(m, () => m.openPopup());
    else { map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15), { duration: 0.5 }); if (m) m.openPopup(); }
  } else if (m) {
    m.openPopup();
    const c = cardEl(id); if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const cc = cardEl(id); if (cc) { cc.classList.add("sel"); const chip = cc.querySelector(".seenchip"); if (!chip) { /* re-render happens on next list update */ } }
  writeURL();
}

// ---------- save / share ----------
function toggleSave(id) {
  const on = !saved.has(id);
  if (on) saved.add(id); else saved.delete(id);
  store.set("passd.saved", [...saved]);
  document.querySelectorAll(`[data-save="${id}"]`).forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = HEART(on);
  });
  refreshPin(id);
  const m = byId[id];
  if (m && m.isPopupOpen && m.isPopupOpen()) m.setPopupContent(markerPopup(DATA.find((x) => x.id === id)));
  updateSavedChip();
  const panel = el("savedModal");
  if (panel && !panel.hidden) renderSavedPanel();
  toast(on ? "Saved — find it under ♥ in the header" : "Removed from saved");
}
async function shareLink(id) {
  select(id, "share-noop"); // ensures sel in URL; no map motion for unknown 'from'
  clearTimeout(urlT);
  const h = new URLSearchParams(location.hash.slice(1));
  h.set("sel", id); if (week !== WEEKS[0]) h.set("w", week); else h.delete("w");
  const url = location.origin + location.pathname + "#" + h.toString();
  try { await navigator.clipboard.writeText(url); toast("Link copied — send it to anyone"); }
  catch { toast("Copy failed — use the address bar URL"); }
  writeURL();
}

// ---------- toast ----------
let toastT = null;
window.toastFn = (m) => toast(m); // shared with auth.js
function toast(msg) {
  const t = el("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2100);
}

// ---------- refresh pipeline ----------
function refresh() { renderMarkers(); updateList(); updatePricingUI(); writeURL(); }

// ---------- week + view controls ----------
function buildCitySelect() {
  const sel = el("city");
  if (!sel) return;
  if (city !== "all" && !CITIES.includes(city) && !city.startsWith("regional:") && !city.startsWith("area:")) city = "Melbourne";
  // Named areas + regional catch-alls are data-driven: shown only when they
  // currently have homes (e.g. Cairns arrives via the QLD feed).
  const areaNames = Object.keys(AREAS).filter((n) => DATA.some((p) => p.lat != null && (p.state || "VIC") === AREAS[n].state && inBox(p, AREAS[n].box))).sort();
  const regStates = [...new Set(DATA.filter((p) => p.lat != null && !inMetro(p)).map((p) => p.state || "VIC"))].sort();
  sel.innerHTML = [`<option value="all">All cities</option>`]
    .concat(CITIES.map((c) => `<option value="${c}">${c}</option>`))
    .concat(areaNames.map((n) => `<option value="area:${n}">${n}</option>`))
    .concat(regStates.map((s) => `<option value="regional:${s}">Regional ${s}</option>`)).join("");
  if (city.startsWith("regional:") && !regStates.includes(city.slice(9))) city = "Melbourne";
  if (city.startsWith("area:") && !areaNames.includes(city.slice(5))) city = "Melbourne";
  sel.value = city;
  sel.onchange = (e) => {
    city = e.target.value;
    store.set("passd.city", city);
    if (selectedId && !forView().some((p) => p.id === selectedId)) selectedId = null;
    refresh();
    fitCity();
  };
}
function switchCityFor(p) { // search picked something outside the current city filter
  const target = p.city || "Melbourne";
  if (city !== "all" && target !== city) {
    city = target; store.set("passd.city", city);
    const sel = el("city"); if (sel) sel.value = city;
    refresh();
  }
}
function buildWeekSelect() {
  const opts = [`<option value="all">All recent weeks</option>`]
    .concat(WEEKS.map((w) => `<option value="${w}">${weekLabel(w)}</option>`));
  el("week").innerHTML = opts.join("");
  el("week").value = week;
  el("week").onchange = (e) => setWeek(e.target.value);
}
function setWeek(w, fit = true) {
  week = w;
  el("week").value = w;
  if (selectedId && !forView().some((p) => p.id === selectedId)) selectedId = null;
  renderMarkers();
  if (fit) fitCity();
  updateList(); writeURL();
}
function setActive(id) { ["toMap", "toList"].forEach((x) => el(x).classList.toggle("on", x === id)); }
function showMap() {
  el("app").classList.add("show-map"); setActive("toMap");
  setTimeout(() => { map.invalidateSize(); if (!restoredView) fitCity(); }, 60);
}
function showList() { el("app").classList.remove("show-map"); setActive("toList"); updateList(); }

// ---------- filter controls ----------
function buildTypeChips() {
  const chips = [{ label: "All types", val: "__all" }].concat(TYPES.map((t) => ({ label: t, val: t })));
  el("typeFilter").innerHTML = chips.map((ch) => `<button type="button" class="tchip" data-type="${ch.val}">${ch.label}</button>`).join("");
  el("typeFilter").addEventListener("click", (e) => {
    const b = e.target.closest(".tchip"); if (!b) return;
    const v = b.dataset.type;
    if (v === "__all") activeTypes.clear();
    else if (activeTypes.has(v)) activeTypes.delete(v);
    else activeTypes.add(v);
    refreshTypeChips(); refresh();
  });
  refreshTypeChips();
}
function refreshTypeChips() {
  document.querySelectorAll("#typeFilter .tchip").forEach((b) => {
    const v = b.dataset.type;
    b.classList.toggle("on", v === "__all" ? activeTypes.size === 0 : activeTypes.has(v));
  });
}
function buildBedsChips() {
  const opts = [{ label: "Any beds", val: "" }, { label: "2+", val: 2 }, { label: "3+", val: 3 }, { label: "4+", val: 4 }];
  el("bedsFilter").innerHTML = opts.map((o) => `<button type="button" class="tchip" data-beds="${o.val}">${o.label}</button>`).join("");
  el("bedsFilter").addEventListener("click", (e) => {
    const b = e.target.closest(".tchip"); if (!b) return;
    minBeds = b.dataset.beds === "" ? null : +b.dataset.beds;
    refreshBedsChips(); refresh();
  });
  refreshBedsChips();
}
function refreshBedsChips() {
  document.querySelectorAll("#bedsFilter .tchip").forEach((b) => {
    b.classList.toggle("on", (b.dataset.beds === "" && minBeds == null) || +b.dataset.beds === minBeds);
  });
}
const PRICE_BRACKETS = [
  { label: "Any price", val: "" }, { label: "$500k", val: 500000 }, { label: "$750k", val: 750000 },
  { label: "$1m", val: 1000000 }, { label: "$1.25m", val: 1250000 }, { label: "$1.5m", val: 1500000 },
  { label: "$2m", val: 2000000 }, { label: "$2.5m", val: 2500000 }, { label: "$3m", val: 3000000 },
];
function buildPriceFilter() {
  el("maxPrice").innerHTML = PRICE_BRACKETS.map((b) => `<option value="${b.val}">${b.label === "Any price" ? b.label : "Up to " + b.label}</option>`).join("");
  el("maxPrice").value = maxPrice == null ? "" : String(maxPrice);
  el("maxPrice").onchange = (e) => { maxPrice = e.target.value ? +e.target.value : null; refresh(); };
}
function buildSort() {
  el("sortBy").innerHTML = SORTS.map((s) => `<option value="${s.v}">${s.label}</option>`).join("");
  el("sortBy").value = sortBy;
  el("sortBy").onchange = (e) => { sortBy = e.target.value; updateList(); writeURL(); };
}
function resetFilters() {
  activeTypes.clear(); maxPrice = null; minBeds = null;
  refreshTypeChips(); refreshBedsChips();
  el("maxPrice").value = ""; refresh();
}

// ---------- search (suburbs, postcodes, addresses) ----------
let SUBURBS = [];
function buildSuburbs() {
  const m = new Map();
  for (const p of DATA) {
    if (p.lat == null || !p.suburb) continue;
    const k = p.suburb.toLowerCase() + "|" + (p.postcode || "");
    let e = m.get(k);
    if (!e) m.set(k, (e = { suburb: p.suburb, postcode: p.postcode, city: p.city || "Melbourne", n: 0, latMin: 90, latMax: -90, lngMin: 180, lngMax: -180 }));
    e.n++;
    e.latMin = Math.min(e.latMin, p.lat); e.latMax = Math.max(e.latMax, p.lat);
    e.lngMin = Math.min(e.lngMin, p.lng); e.lngMax = Math.max(e.lngMax, p.lng);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
let qItems = [], qActive = -1;
function searchMatches(q) {
  const ql = q.trim().toLowerCase();
  if (ql.length < 2) return [];
  const props = /\d/.test(ql)
    ? forWeekAll().filter((p) => (p.address + " " + p.suburb).toLowerCase().includes(ql)).slice(0, 4).map((p) => ({ kind: "prop", p }))
    : [];
  const subs = SUBURBS.filter((s) => s.suburb.toLowerCase().startsWith(ql) || (s.postcode || "").startsWith(ql));
  const subs2 = subs.length ? subs : SUBURBS.filter((s) => s.suburb.toLowerCase().includes(ql));
  const items = props.concat(subs2.slice(0, 7 - props.length).map((s) => ({ kind: "sub", s })));
  // Always offer a map-wide location search — works even where nothing passed in.
  if (ql.length >= 3) items.push({ kind: "geo", q: q.trim() });
  return items;
}
async function geoLocate(q) {
  toast("Finding " + q + "…");
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=au&viewbox=140.5,-39.9,150.5,-33.8&bounded=1&q=" + encodeURIComponent(q));
    const j = await r.json();
    if (!j || !j[0]) { toast("Couldn't find “" + q + "” in Victoria"); return; }
    const g = j[0];
    if (window.matchMedia("(max-width: 900px)").matches) showMap();
    if (g.boundingbox) {
      const [s, n, w, e] = g.boundingbox.map(Number); // nominatim: [south, north, west, east]
      map.fitBounds([[s, w], [n, e]], { padding: [40, 40], maxZoom: 15 });
    } else map.setView([+g.lat, +g.lon], 14);
    setTimeout(() => { if (!visible().length) toast("No passed-in homes here right now"); }, 800);
  } catch { toast("Location search unavailable — try again"); }
}
const forWeekAll = () => DATA.filter((p) => p.lat != null && p.lng != null);
function renderSearch() {
  const qr = el("qr");
  if (!qItems.length) { qr.hidden = true; el("q").setAttribute("aria-expanded", "false"); return; }
  qr.innerHTML = qItems.map((it, i) => {
    const a = `type="button" class="qi${it.kind === "geo" ? " geo" : ""}${i === qActive ? " on" : ""}" id="qi-${i}" role="option" aria-selected="${i === qActive}" data-i="${i}"`;
    if (it.kind === "prop") return `<button ${a}><b>${esc(it.p.address)}</b><span>${esc(it.p.suburb)} · passed in ${esc(fmtDay(it.p.saleDate) || "")}</span></button>`;
    if (it.kind === "geo") return `<button ${a}><b>Search the map for “${esc(it.q)}”</b><span>Jump to any VIC location — even with no pass-ins</span></button>`;
    return `<button ${a}><b>${esc(it.s.suburb)}</b><span>VIC ${esc(it.s.postcode || "")} · ${it.s.n} passed in</span></button>`;
  }).join("");
  qr.hidden = false; el("q").setAttribute("aria-expanded", "true");
  el("q").setAttribute("aria-activedescendant", qActive >= 0 ? "qi-" + qActive : "");
}
function chooseSearch(i) {
  const it = qItems[i]; if (!it) return;
  const qr = el("qr"); qr.hidden = true; qItems = []; qActive = -1;
  el("q").setAttribute("aria-expanded", "false");
  if (it.kind === "geo") {
    el("q").value = it.q;
    geoLocate(it.q);
  } else if (it.kind === "sub") {
    el("q").value = it.s.suburb;
    switchCityFor({ city: it.s.city });
    const pad = 0.004;
    map.fitBounds([[it.s.latMin - pad, it.s.lngMin - pad], [it.s.latMax + pad, it.s.lngMax + pad]], { padding: [50, 50], maxZoom: 15 });
    if (window.matchMedia("(max-width: 900px)").matches) showMap();
  } else {
    el("q").value = it.p.address + ", " + it.p.suburb;
    switchCityFor(it.p);
    if (week !== "all" && it.p.week !== week) setWeek("all", false);
    if (!forView().some((x) => x.id === it.p.id)) { // filters would hide the searched home
      activeTypes.clear(); maxPrice = null; minBeds = null; savedOnly = false;
      refreshTypeChips(); refreshBedsChips(); el("maxPrice").value = "";
      renderMarkers(); updateList();
    }
    if (window.matchMedia("(max-width: 900px)").matches) showMap();
    select(it.p.id, "search");
  }
}
function buildSearch() {
  const q = el("q");
  q.addEventListener("input", () => { qItems = searchMatches(q.value); qActive = qItems.length ? 0 : -1; renderSearch(); });
  q.addEventListener("focus", () => { if (q.value) { qItems = searchMatches(q.value); qActive = qItems.length ? 0 : -1; renderSearch(); } });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (qItems.length) { qActive = (qActive + 1) % qItems.length; renderSearch(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (qItems.length) { qActive = (qActive - 1 + qItems.length) % qItems.length; renderSearch(); } }
    else if (e.key === "Enter") { e.preventDefault(); if (qActive >= 0) chooseSearch(qActive); }
    else if (e.key === "Escape") { el("qr").hidden = true; qItems = []; q.setAttribute("aria-expanded", "false"); }
  });
  q.addEventListener("blur", () => setTimeout(() => { el("qr").hidden = true; q.setAttribute("aria-expanded", "false"); }, 160));
  el("qr").addEventListener("mousedown", (e) => { const b = e.target.closest(".qi"); if (b) { e.preventDefault(); chooseSearch(+b.dataset.i); } });
}

// ---------- about dialog ----------
function buildAbout() {
  const dlg = el("about");
  el("aboutBtn").onclick = () => dlg.showModal();
  el("aboutClose").onclick = () => dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
}

// ---------- init ----------
async function init() {
  const boot = await window.PassdGate.ready();
  if (!boot) return; // signed out in gated mode: the landing page is showing
  appTier = boot.tier;
  setDataset(boot.properties, boot.generated);
  const deep = readURL();

  // maxZoom on the map itself: the GL basemap declares none, and markercluster
  // refuses to attach without one ("Map has no maxZoom specified").
  map = L.map("map", { zoomControl: true, maxZoom: 19, minZoom: 3 }).setView([-37.81, 144.96], 11);
  addBasemap();
  cluster = (L.markerClusterGroup
    ? L.markerClusterGroup({
        maxClusterRadius: 46, showCoverageOnHover: false, disableClusteringAtZoom: 15,
        spiderfyOnMaxZoom: false, zoomToBoundsOnClick: true,
        iconCreateFunction: (c) => L.divIcon({ className: "pinwrap", html: `<div class="clus">${c.getChildCount()}</div>`, iconSize: [0, 0] }),
      })
    : L.layerGroup()).addTo(map);

  buildCitySelect(); buildWeekSelect(); buildTypeChips(); buildBedsChips(); buildPriceFilter(); buildSort(); buildSearch(); buildAbout();
  el("toMap").onclick = showMap;
  el("toList").onclick = showList;
  el("savedBtn").onclick = openSavedPanel;
  el("savedClose").onclick = closeSavedPanel;
  document.querySelector("#savedModal .pm-scrim").addEventListener("click", closeSavedPanel);
  el("savedList").addEventListener("click", (e) => {
    if (e.target.closest("[data-save]") || e.target.closest("[data-listing]") || e.target.closest("a")) return;
    const c = e.target.closest(".card");
    if (!c) return;
    const p = DATA.find((x) => x.id === c.dataset.id);
    if (!p) return;
    closeSavedPanel();
    switchCityFor(p);
    if (week !== "all" && p.week !== week) { week = "all"; el("week").value = "all"; refresh(); }
    const go = () => select(p.id, "list");
    if (window.matchMedia("(max-width: 900px)").matches) { showMap(); setTimeout(go, 140); } else go();
  });

  const list = el("list");
  list.addEventListener("click", (e) => {
    if (e.target.closest("[data-save]")) return; // heart handled globally
    const r = e.target.closest("[data-reset]"); if (r) { resetFilters(); return; }
    const c = e.target.closest(".card");
    if (c) {
      const go = () => select(c.dataset.id, "list");
      if (window.matchMedia("(max-width: 900px)").matches) { showMap(); setTimeout(go, 140); } else go();
    }
  });
  list.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      if (e.target.closest("[data-save]")) return;
      const c = e.target.closest(".card"); if (c) { e.preventDefault(); select(c.dataset.id, "list"); }
    }
  });
  list.addEventListener("mouseover", (e) => { const c = e.target.closest(".card"); if (c && byId[c.dataset.id]) { const g = byId[c.dataset.id].getElement(); if (g) { const pin = g.querySelector(".pin"); if (pin) pin.classList.add("hov"); } } });
  list.addEventListener("mouseout", (e) => { const c = e.target.closest(".card"); if (c && byId[c.dataset.id]) { const g = byId[c.dataset.id].getElement(); if (g) { const pin = g.querySelector(".pin"); if (pin) pin.classList.remove("hov"); } } });

  // hearts + share, anywhere in the document (cards, popups)
  document.addEventListener("click", (e) => {
    const sv = e.target.closest("[data-save]");
    if (sv) { e.stopPropagation(); toggleSave(sv.dataset.save); return; }
    const sh = e.target.closest("[data-share]");
    if (sh) { e.stopPropagation(); shareLink(sh.dataset.share); }
  });

  const fr = el("fresh");
  if (fr && GENERATED)
    fr.textContent = "Updated " + new Date(GENERATED + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " · refreshes Sun night";

  renderMarkers();
  if (deep.c) {
    const [la, ln, z] = deep.c.split(",").map(Number);
    if (Number.isFinite(la) && Number.isFinite(ln) && Number.isFinite(z)) { map.setView([la, ln], z); restoredView = true; }
  }
  if (!restoredView) fitCity();
  updateList();
  if (deep.sel && DATA.some((p) => p.id === deep.sel && forView().some((v) => v.id === deep.sel))) {
    setTimeout(() => select(deep.sel, "search"), 350);
  }
  // Debounced: re-rendering the card list on every pan frame is the main lag
  // source — settle for 160ms of stillness before rebuilding.
  let moveT = null;
  map.on("moveend", () => { clearTimeout(moveT); moveT = setTimeout(() => { updateList(); writeURL(); }, 160); });
}
document.addEventListener("DOMContentLoaded", init);
