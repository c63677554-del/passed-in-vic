"use strict";

/* Passed In — Melbourne. Map + a viewport-synced list of properties that passed
   in at auction (REA/Domain-style). Data: data.js (PASSED_IN), regenerated weekly
   by scripts/scrape-reiv.js. */

// ---------- helpers ----------
function weekLabel(iso) {
  const end = new Date(iso + "T00:00:00");
  const start = new Date(end); start.setDate(start.getDate() - 6);
  const f = (d, o) => d.toLocaleDateString("en-AU", o);
  return `${f(start, { day: "numeric", month: "short" })} – ${f(end, { day: "numeric", month: "short", year: "numeric" })}`;
}
const isVendor = (m) => /vendor/i.test(m || "");
const resultChip = (m) => (isVendor(m) ? "Vendor bid" : "At auction");
const fmtPrice = (n) => (n == null ? null : n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "m" : "$" + Math.round(n / 1e3) + "k");
const subline = (p) => [p.suburb, "VIC", p.postcode].filter(Boolean).join(" ");
const googleUrl = (p) =>
  "https://www.google.com/search?q=" + encodeURIComponent([p.address, p.suburb, "VIC", p.postcode].filter(Boolean).join(" "));
const el = (id) => document.getElementById(id);
const cardEl = (id) => document.querySelector('.card[data-id="' + id + '"]');

// ---------- state ----------
let map, layer, byId = {}, selectedId = null, week = null;
PASSED_IN.forEach((p, i) => (p.id = "p" + i));
const WEEKS = [...new Set(PASSED_IN.map((p) => p.week))].sort().reverse().map((w) => ({ value: w, label: weekLabel(w) }));

// ---------- basemap (OpenStreetMap, auto-fallback to Esri if blocked) ----------
const TILES = [
  { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", opt: { subdomains: "abc", maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", opt: { maxZoom: 19, attribution: "Tiles &copy; Esri" } },
];
function addBasemap() {
  let i = 0, loaded = false, errs = 0, base = null;
  (function add() {
    base = L.tileLayer(TILES[i].url, TILES[i].opt).addTo(map);
    base.on("load", () => (loaded = true));
    base.on("tileerror", () => { if (!loaded && ++errs >= 6 && i < TILES.length - 1) { i++; errs = 0; map.removeLayer(base); add(); } });
  })();
}

// ---------- data slices ----------
const forWeek = () => PASSED_IN.filter((p) => p.week === week && p.lat != null && p.lng != null);
const TYPES = ["House", "Townhouse", "Apartment", "Unit"];
let activeTypes = new Set(); // empty = show every type
let maxPrice = null; // null = any; else show only est. price <= maxPrice
const typeOk = (p) => activeTypes.size === 0 || activeTypes.has(p.type);
const priceOk = (p) => maxPrice == null || (p.priceEst != null && p.priceEst <= maxPrice);
const forView = () => forWeek().filter((p) => typeOk(p) && priceOk(p)); // week + type + price
function visible() {
  const sz = map.getSize();
  if (!sz || sz.x < 10 || sz.y < 10) return forView(); // map hidden (mobile list view) -> show all in view set
  const b = map.getBounds();
  return forView().filter((p) => b.contains([p.lat, p.lng]));
}

// ---------- markers ----------
const dotStyle = (sel) => ({ radius: sel ? 9 : 6.5, color: "#fff", weight: 2, fillColor: sel ? "#b80022" : "#e4002b", fillOpacity: 0.92 });
function markerPopup(p) {
  const line = [p.type, p.beds != null ? p.beds + " bed" : null, resultChip(p.method)].filter(Boolean).join(" · ");
  const sub = [p.saleDate ? "Auction " + p.saleDate : null, p.agency].filter(Boolean).join(" · ");
  return `<div class="pp">
    <span class="badge">Passed In</span>
    <div class="b" style="margin-top:6px">${p.address}</div>
    <div class="s">${subline(p)}</div>
    <div class="m">${line}${p.priceEst != null ? "<br>Est. " + fmtPrice(p.priceEst) + " <span style='color:#6b7280'>(suburb median)</span>" : ""}${sub ? "<br>" + sub : ""}</div>
    <a href="${googleUrl(p)}" target="_blank" rel="noopener noreferrer">Search Property</a>
  </div>`;
}
function renderMarkers() {
  layer.clearLayers(); byId = {};
  forView().forEach((p) => {
    const m = L.circleMarker([p.lat, p.lng], dotStyle(false)).bindPopup(markerPopup(p), { maxWidth: 262 });
    m.on("click", () => select(p.id, "map"));
    m.on("mouseover", () => { if (p.id !== selectedId) m.setStyle({ radius: 8.5 }); const c = cardEl(p.id); if (c) c.classList.add("hl"); });
    m.on("mouseout", () => { if (p.id !== selectedId) m.setStyle(dotStyle(false)); const c = cardEl(p.id); if (c) c.classList.remove("hl"); });
    m.addTo(layer); byId[p.id] = m;
  });
}

// ---------- list ----------
function cardHTML(p) {
  return `<div class="card" data-id="${p.id}">
    <span class="badge">Passed In</span>
    <div class="addr">${p.address}</div>
    <div class="sub">${subline(p)}</div>
    ${p.priceEst != null ? `<div class="price">Est. ${fmtPrice(p.priceEst)} <span class="est">suburb median</span></div>` : ""}
    <div class="meta">
      ${p.type ? `<span class="chip">${p.type}</span>` : ""}
      ${p.beds != null ? `<span class="chip">${p.beds} bed</span>` : ""}
      <span class="chip">${resultChip(p.method)}</span>
    </div>
    <div class="foot">
      <span>${[p.saleDate, p.agency].filter(Boolean).join(" · ")}</span>
      <a class="search" href="${googleUrl(p)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Search &#8599;</a>
    </div>
  </div>`;
}
function updateList() {
  const vis = visible().sort((a, b) => (a.suburb || "").localeCompare(b.suburb || "") || a.address.localeCompare(b.address));
  const total = forView().length;
  el("count").innerHTML = `<b>${vis.length}</b> passed in${vis.length !== total ? " in this area" : ""}`;
  el("list").innerHTML = vis.length
    ? vis.map(cardHTML).join("")
    : `<div class="empty">No passed-in properties in this part of the map.<br>Zoom out or pan to see more.</div>`;
  if (selectedId) { const c = cardEl(selectedId); if (c) c.classList.add("sel"); }
}

// ---------- selection / two-way sync ----------
function select(id, from) {
  selectedId = id;
  const p = PASSED_IN.find((x) => x.id === id); if (!p) return;
  Object.keys(byId).forEach((mid) => byId[mid].setStyle(dotStyle(mid === id)));
  document.querySelectorAll(".card.sel").forEach((c) => c.classList.remove("sel"));
  if (from === "list") {
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 14), { duration: 0.5 });
    if (byId[id]) byId[id].openPopup();
  } else {
    if (byId[id]) byId[id].openPopup();
    const c = cardEl(id); if (c) c.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const cc = cardEl(id); if (cc) cc.classList.add("sel");
}

// ---------- week + view controls ----------
function setWeek(w) {
  week = w; selectedId = null;
  renderMarkers();
  const pts = forWeek().map((p) => [p.lat, p.lng]);
  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  updateList();
}
function setActive(id) { ["toMap", "toList"].forEach((x) => el(x).classList.toggle("on", x === id)); }
function showMap() {
  el("app").classList.add("show-map"); setActive("toMap");
  setTimeout(() => { map.invalidateSize(); const pts = forWeek().map((p) => [p.lat, p.lng]); if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 }); }, 60);
}
function showList() { el("app").classList.remove("show-map"); setActive("toList"); updateList(); }

// ---------- type filter chips ----------
function buildTypeChips() {
  const chips = [{ label: "All", val: "__all" }].concat(TYPES.map((t) => ({ label: t, val: t })));
  el("typeFilter").innerHTML = chips
    .map((ch) => `<button type="button" class="tchip" data-type="${ch.val}">${ch.label}</button>`)
    .join("");
  el("typeFilter").addEventListener("click", (e) => {
    const b = e.target.closest(".tchip"); if (!b) return;
    const v = b.dataset.type;
    if (v === "__all") activeTypes.clear();
    else if (activeTypes.has(v)) activeTypes.delete(v);
    else activeTypes.add(v);
    refreshChips();
    renderMarkers();
    updateList();
  });
  refreshChips();
}
function refreshChips() {
  document.querySelectorAll("#typeFilter .tchip").forEach((b) => {
    const v = b.dataset.type;
    b.classList.toggle("on", v === "__all" ? activeTypes.size === 0 : activeTypes.has(v));
  });
}

// ---------- max-price filter ----------
const PRICE_BRACKETS = [
  { label: "Any", val: "" }, { label: "$500k", val: 500000 }, { label: "$750k", val: 750000 },
  { label: "$1m", val: 1000000 }, { label: "$1.25m", val: 1250000 }, { label: "$1.5m", val: 1500000 },
  { label: "$2m", val: 2000000 }, { label: "$2.5m", val: 2500000 }, { label: "$3m", val: 3000000 },
];
function buildPriceFilter() {
  el("maxPrice").innerHTML = PRICE_BRACKETS.map((b) => `<option value="${b.val}">${b.label === "Any" ? "Any price" : "Up to " + b.label}</option>`).join("");
  el("maxPrice").onchange = (e) => { maxPrice = e.target.value ? +e.target.value : null; renderMarkers(); updateList(); };
}

// ---------- init ----------
function init() {
  map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([-37.81, 144.96], 11);
  addBasemap();
  layer = L.layerGroup().addTo(map);

  buildTypeChips();
  buildPriceFilter();
  el("week").innerHTML = WEEKS.map((w) => `<option value="${w.value}">${w.label}</option>`).join("");
  el("week").onchange = (e) => setWeek(e.target.value);
  el("toMap").onclick = showMap;
  el("toList").onclick = showList;

  const list = el("list");
  list.addEventListener("click", (e) => { const c = e.target.closest(".card"); if (c) select(c.dataset.id, "list"); });
  list.addEventListener("mouseover", (e) => { const c = e.target.closest(".card"); if (c && byId[c.dataset.id] && c.dataset.id !== selectedId) byId[c.dataset.id].setStyle({ radius: 8.5 }); });
  list.addEventListener("mouseout", (e) => { const c = e.target.closest(".card"); if (c && byId[c.dataset.id] && c.dataset.id !== selectedId) byId[c.dataset.id].setStyle(dotStyle(false)); });

  map.on("moveend", updateList);
  setWeek(WEEKS.length ? WEEKS[0].value : null);
}
document.addEventListener("DOMContentLoaded", init);
