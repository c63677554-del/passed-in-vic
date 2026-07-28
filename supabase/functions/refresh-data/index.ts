// refresh-data - the WEEKLY SCRAPE, running inside Supabase.
//
// WHY THIS EXISTS (incident 27 Jul 2026): the scrape used to run on the owner's
// laptop via Task Scheduler, with a "self-healing" watchdog that ALSO ran on the
// same laptop. While the owner was away the machine was off, so nothing ran and
// subscribers silently lost two weeks of results. Any automation that lives on a
// personal machine is not automation. This function moves the critical path into
// infrastructure that is always on, and it is scheduled by pg_cron in the same
// Postgres that serves the data (see migration 20260727000001_cron_refresh.sql).
//
// Ported from scripts/scrape-domain.js + scripts/lib.js. Covers all five cities
// including Melbourne (Domain out-reports REIV there). The laptop pipeline still
// exists and may run as a bonus - it adds REIV gap-fill and soho price guides -
// but the product no longer DEPENDS on it.
//
// Auth: deployed WITH platform JWT verification (verify_jwt=true), so Supabase's
// gateway rejects anything not signed by this project before it reaches us. On
// top of that we require the token's role claim to be `service_role`, which
// excludes anon and ordinary signed-in users. No new shared secret is needed.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html",
  "Accept-Language": "en-AU,en;q=0.9",
};

const CITIES = [
  { slug: "melbourne", city: "Melbourne", state: "VIC" },
  { slug: "sydney", city: "Sydney", state: "NSW" },
  { slug: "brisbane", city: "Brisbane", state: "QLD" },
  { slug: "adelaide", city: "Adelaide", state: "SA" },
  { slug: "canberra", city: "Canberra", state: "ACT" },
];

const RETAIN_DAYS = 84;
const DAYS = 30;          // ignore results older than this from a results page
const MIN_ROWS = 30;      // below this we assume breakage and keep the last good data

// ---- ported helpers (kept behaviour-compatible with scripts/lib.js) ----
const STATE_BOUNDS: Record<string, { latMin: number; latMax: number; lngMin: number; lngMax: number }> = {
  VIC: { latMin: -39.9, latMax: -33.8, lngMin: 140.5, lngMax: 150.5 },
  NSW: { latMin: -37.6, latMax: -28.0, lngMin: 140.5, lngMax: 154.0 },
  QLD: { latMin: -29.5, latMax: -9.0, lngMin: 137.5, lngMax: 154.0 },
  SA: { latMin: -38.5, latMax: -25.5, lngMin: 128.5, lngMax: 141.5 },
  ACT: { latMin: -36.0, latMax: -35.0, lngMin: 148.6, lngMax: 149.5 },
};
const inState = (state: string, lat: number | null, lng: number | null) => {
  const b = STATE_BOUNDS[(state || "VIC").toUpperCase()];
  return !!b && lat != null && lng != null && lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
};

const AB: Record<string, string> = { ct: "court", st: "street", rd: "road", av: "avenue", ave: "avenue", dr: "drive", pl: "place", cr: "crescent", cres: "crescent", gr: "grove", gv: "grove", pde: "parade", tce: "terrace", cl: "close", ln: "lane", bvd: "boulevard", blvd: "boulevard", sq: "square", wy: "way", hwy: "highway", cct: "circuit", esp: "esplanade", gdns: "gardens", cir: "circle", pkwy: "parkway", hts: "heights", rdg: "ridge", vw: "view", qy: "quay", grn: "green", mw: "mews" };
const expand = (a: string) => a.split(/\s+/).map((w) => AB[w.toLowerCase().replace(/[.,]/g, "")] || w).join(" ");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const parseDate = (s: string) => { const m = (s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
function weekSaturday(s: string): string | null {
  const d = parseDate(s); if (!d) return null;
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -1 : 6 - dow));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const daysAgo = (s: string, now = Date.now()) => { const d = parseDate(s); return d ? (now - d.getTime()) / 864e5 : 1e9; };

const DOMAIN_PASSED_CODES = new Set(["AUPI", "AUVB"]);
const domainType = (t: unknown) => {
  const s = String(t || "");
  if (/town/i.test(s)) return "Townhouse";
  if (/apartment|flat/i.test(s)) return "Apartment";
  if (/unit/i.test(s)) return "Unit";
  if (/house|villa|terrace/i.test(s)) return "House";
  return s || null;
};
const domainSaleDate = (iso: unknown) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${+m[3]}/${m[2]}/${m[1]}` : null;
};

// deno-lint-ignore no-explicit-any
function mapDomainListing(l: any, auctionDateIso: unknown, city: string) {
  if (!l || !DOMAIN_PASSED_CODES.has(l.result)) return null;
  const g = l.geoLocation || {};
  if (g.latitude == null || g.longitude == null) return null;
  const address = `${l.unitNumber ? l.unitNumber + "/" : ""}${l.streetNumber || ""} ${l.streetName || ""} ${l.streetType || ""}`.replace(/\s+/g, " ").trim();
  if (!address || !l.suburb) return null;
  const saleDate = domainSaleDate(auctionDateIso);
  if (!saleDate) return null;
  let url = l.domainPropertyDetailsUrl || null;
  if (url && !/^https?:/i.test(url)) url = "https://www.domain.com.au" + (url.startsWith("/") ? "" : "/") + url;
  return {
    address, suburb: l.suburb, postcode: l.postcode || null,
    lat: +(+g.latitude).toFixed(6), lng: +(+g.longitude).toFixed(6),
    type: domainType(l.propertyType), beds: l.bedrooms ?? null, baths: l.bathrooms ?? null, cars: l.carspaces ?? null,
    price: null, vendor: null, agency: (l.agencyName || "").trim() || null,
    method: l.result === "AUVB" ? "Passed in - vendor bid" : "Passed in",
    saleDate, week: weekSaturday(saleDate),
    city, state: (l.state || "").toUpperCase() || null,
    listUrl: url,
    bid: typeof l.price === "number" && l.price > 50000 ? l.price : null,
    // Freshly passed in this weekend, so it is available by definition. The
    // check-listings pass later re-checks the older rows and may flip this to
    // under_offer / sold / removed. statusAt=null means "not yet re-checked".
    status: "available",
    statusAt: null,
  };
}

// deno-lint-ignore no-explicit-any
const dedupeKey = (p: any) => slug(expand(String(p.address || ""))) + "|" + slug(String(p.suburb || "")) + "|" + (p.week || "");

async function scrapeCity(c: typeof CITIES[number]) {
  const res = await fetch("https://www.domain.com.au/auction-results/" + c.slug + "/", { headers: UA });
  if (!res.ok) return { city: c.city, error: `HTTP ${res.status}`, rows: [] as unknown[] };
  const t = await res.text();
  const m = t.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return { city: c.city, error: "__NEXT_DATA__ missing (markup change?)", rows: [] };
  let cp;
  try { cp = JSON.parse(m[1]).props.pageProps.componentProps; } catch { return { city: c.city, error: "JSON parse failed", rows: [] }; }
  const auctionDate = cp.auctionDate;
  // deno-lint-ignore no-explicit-any
  const listings = (cp.salesListings || []).flatMap((s: any) => s.listings || []);
  const rows = listings.map((l: unknown) => mapDomainListing(l, auctionDate, c.city))
    .filter(Boolean)
    // deno-lint-ignore no-explicit-any
    .filter((p: any) => inState(c.state, p.lat, p.lng))
    // deno-lint-ignore no-explicit-any
    .filter((p: any) => daysAgo(p.saleDate) <= DAYS);
  return { city: c.city, auctionDate: String(auctionDate).slice(0, 10), listings: listings.length, kept: rows.length, reported: cp.citySummaryData?.numberPassedIn ?? null, rows };
}

Deno.serve(async (req: Request) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // The gateway already verified the signature; we only need the role claim.
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let role = "";
  try { role = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || ""; } catch { role = ""; }
  if (role !== "service_role") return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });

  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const started = new Date().toISOString();

  // ---- scrape ----
  const reports = [];
  const scraped: Record<string, unknown>[] = [];
  for (const c of CITIES) {
    try {
      const r = await scrapeCity(c);
      // deno-lint-ignore no-explicit-any
      scraped.push(...(r.rows as any[]));
      reports.push({ city: r.city, auctionDate: r.auctionDate, listings: r.listings, kept: r.kept, reported: r.reported, error: r.error });
    } catch (e) {
      reports.push({ city: c.city, error: String((e as Error)?.message || e) });
    }
    await new Promise((r) => setTimeout(r, 400)); // politeness gap
  }

  // ---- breakage guard: never destroy good data on an outage/markup change ----
  if (scraped.length < MIN_ROWS) {
    const body = { ok: false, reason: `only ${scraped.length} rows (< ${MIN_ROWS}) - keeping last good data`, started, reports };
    await admin.from("app_data").upsert({ key: "refresh_status", generated: null, payload: body, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return new Response(JSON.stringify(body), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // ---- merge into the live payload ----
  const { data: row } = await admin.from("app_data").select("payload").eq("key", "passed_in").single();
  // deno-lint-ignore no-explicit-any
  const existing: any[] = (row?.payload as any)?.properties ?? [];
  const before = existing.length;
  const byKey = new Map(existing.map((p) => [dedupeKey(p), p]));
  let added = 0;
  for (const p of scraped) {
    const k = dedupeKey(p);
    const prev = byKey.get(k);
    if (!prev) added++;
    // Domain fields win, but never blank an existing listing URL/guide, and never
    // reset a status the check-listings pass already established - the daily
    // re-scrape of the current weekend must not knock rows back to "available".
    // deno-lint-ignore no-explicit-any
    byKey.set(k, prev ? { ...prev, ...p, listUrl: (p as any).listUrl || prev.listUrl || null, status: prev.status ?? (p as any).status, statusAt: prev.statusAt !== undefined ? prev.statusAt : (p as any).statusAt } : p);
  }
  let merged = [...byKey.values()];
  const cutoff = Date.now() - RETAIN_DAYS * 864e5;
  merged = merged.filter((p) => { const d = p.week ? new Date(p.week + "T00:00:00") : null; return d && d.getTime() >= cutoff; });
  merged.sort((a, b) => (b.week || "").localeCompare(a.week || "") || (a.suburb || "").localeCompare(b.suburb || "") || String(a.address).localeCompare(String(b.address)));

  const now = new Date();
  const gen = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const weeks = [...new Set(merged.map((p) => p.week))].sort().reverse();
  const summary = { ok: true, started, finished: new Date().toISOString(), dry, scraped: scraped.length, added, before, after: merged.length, latestWeek: weeks[0] ?? null, weeks: weeks.length, reports };

  if (!dry) {
    const { error } = await admin.from("app_data").upsert(
      { key: "passed_in", generated: gen, payload: { generated: gen, properties: merged }, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) return new Response(JSON.stringify({ ok: false, error: error.message, reports }), { status: 500, headers: { "Content-Type": "application/json" } });
    // heartbeat row so staleness is observable from SQL / the owner's dashboard
    await admin.from("app_data").upsert({ key: "refresh_status", generated: gen, payload: summary, updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  return new Response(JSON.stringify(summary), { headers: { "Content-Type": "application/json" } });
});
