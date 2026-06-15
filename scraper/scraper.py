"""
Passed-In VIC — weekend auction-results scraper (Step 2).

Pipeline:
    1. Fetch the public auction-results HTML (Playwright for JS-rendered pages,
       or a bundled static sample in --mock mode).
    2. Parse out one record per property (address, result, price, agent...).
    3. Keep only "Passed In" results — the whole point of the app.
    4. Geocode each address to lat/lng.
    5. Upsert into Supabase (properties + auction_results), idempotently.

Usage:
    python scraper.py --mock              # parse bundled sample HTML, print, no DB write
    python scraper.py --no-write          # scrape + geocode live, but skip the DB write
    python scraper.py                     # scrape live URL and push to Supabase
    python scraper.py --week 2026-06-13   # override the auction-Saturday date

⚠️  SELECTORS ARE PLACEHOLDERS. Domain/REIV markup changes often and is usually
    JS-rendered. Inspect the live DOM and update every `# TODO(selector)` before
    relying on this against a live site. Also review the site's Terms of Service
    and robots.txt, identify yourself honestly, and rate-limit politely.
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("passed-in-scraper")


# ---------------------------------------------------------------------------
# Config (from environment / .env)
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
MAPBOX_TOKEN = os.environ.get("MAPBOX_TOKEN", "")
AUCTION_RESULTS_URL = os.environ.get(
    "AUCTION_RESULTS_URL", "https://www.domain.com.au/auction-results/melbourne/"
)

# Result strings (lower-cased) that we treat as "passed in".
PASSED_IN_LABELS = {"passed in", "passed-in", "passedin"}

# Melbourne CBD — anchor for mock geocoding.
MELBOURNE_LAT, MELBOURNE_LNG = -37.8136, 144.9631


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class AuctionRecord:
    address: str
    suburb: Optional[str] = None
    postcode: Optional[str] = None
    status: str = "passed_in"
    property_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    carspaces: Optional[int] = None
    passed_in_price: Optional[int] = None
    vendor_bid: Optional[int] = None
    agent: Optional[str] = None
    agency: Optional[str] = None
    source: str = "domain"
    lat: Optional[float] = None
    lng: Optional[float] = None

    @property
    def address_key(self) -> str:
        """Normalized dedup key: lowercase, alphanumerics + single spaces."""
        raw = f"{self.address} {self.suburb or ''} {self.postcode or ''}"
        raw = re.sub(r"[^a-z0-9 ]", "", raw.lower())
        return re.sub(r"\s+", " ", raw).strip()


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------
def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _normalize_status(raw: str) -> str:
    """Map a free-text result label to a canonical status string."""
    s = _clean(raw).lower()
    if s in PASSED_IN_LABELS or "passed" in s:
        return "passed_in"
    if "withdrawn" in s:
        return "withdrawn"
    if "prior" in s:
        return "sold_prior"
    if "after" in s:
        return "sold_after"
    if "sold" in s:
        return "sold"
    return s or "unknown"


def _split_suburb(line: str) -> tuple[Optional[str], Optional[str]]:
    """'Richmond VIC 3121' -> ('Richmond', '3121')."""
    if not line:
        return None, None
    pc = re.search(r"\b(\d{4})\b", line)
    postcode = pc.group(1) if pc else None
    suburb = re.sub(r"\b(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b.*$", "", line).strip(" ,")
    return (suburb or None), postcode


def _parse_money(text: str) -> Optional[int]:
    """'$1,250,000' -> 1250000 ;  '$1.25m' -> 1250000 ;  'Undisclosed' -> None."""
    if not text:
        return None
    t = text.lower().replace(",", "").strip()
    m = re.search(r"\$?\s*([\d.]+)\s*([mk]?)", t)
    if not m:
        return None
    value = float(m.group(1))
    unit = m.group(2)
    if unit == "m":
        value *= 1_000_000
    elif unit == "k":
        value *= 1_000
    return int(value)


def _parse_features(card) -> tuple[Optional[int], Optional[int], Optional[int]]:
    """Pull bed/bath/car counts. TODO(selector): adapt to the site's markup."""
    def feat(name: str) -> Optional[int]:
        el = card.select_one(f"[data-testid='feature-{name}'], .feature-{name}")
        if not el:
            return None
        m = re.search(r"\d+", el.get_text())
        return int(m.group()) if m else None

    return feat("beds"), feat("baths"), feat("cars")


def parse_results(html: str, source: str = "domain") -> list[AuctionRecord]:
    """
    Parse auction-result rows out of the results-page HTML.

    The CSS selectors below are PLACEHOLDERS modelled on a typical listing.
    Update each `# TODO(selector)` to match the live DOM you target.
    """
    soup = BeautifulSoup(html, "lxml")
    records: list[AuctionRecord] = []

    # TODO(selector): each property card / row on the results page.
    for card in soup.select("li.auction-result, .result-card"):
        # TODO(selector): the result label, e.g. "Sold", "Passed In".
        status_el = card.select_one(".result-status, [data-testid='result']")
        # TODO(selector): the street-address line.
        addr_el = card.select_one(".address, [data-testid='address-line1']")
        # TODO(selector): the "Suburb STATE postcode" line.
        suburb_el = card.select_one(".suburb, [data-testid='address-line2']")
        # TODO(selector): the price (may be absent for passed-in lots).
        price_el = card.select_one(".price, [data-testid='price']")
        # TODO(selector): the agency name.
        agency_el = card.select_one(".agency, [data-testid='agency']")
        # TODO(selector): the property-type label.
        ptype_el = card.select_one(".property-type, [data-testid='property-type']")

        address = _clean(addr_el.get_text()) if addr_el else ""
        if not address:
            continue  # skip rows we can't identify

        suburb, postcode = _split_suburb(_clean(suburb_el.get_text()) if suburb_el else "")
        beds, baths, cars = _parse_features(card)

        records.append(
            AuctionRecord(
                address=address,
                suburb=suburb,
                postcode=postcode,
                status=_normalize_status(status_el.get_text() if status_el else ""),
                property_type=_clean(ptype_el.get_text()) if ptype_el else None,
                bedrooms=beds,
                bathrooms=baths,
                carspaces=cars,
                passed_in_price=_parse_money(price_el.get_text() if price_el else ""),
                agency=_clean(agency_el.get_text()) if agency_el else None,
                source=source,
            )
        )

    log.info("Parsed %d result rows", len(records))
    return records


# ---------------------------------------------------------------------------
# Geocoding — Google → Mapbox → deterministic mock fallback
# ---------------------------------------------------------------------------
def geocode(record: AuctionRecord) -> AuctionRecord:
    """Resolve an address to lat/lng, mutating and returning the record."""
    full_address = ", ".join(
        p for p in [record.address, record.suburb, record.postcode, "Victoria, Australia"] if p
    )

    if GOOGLE_MAPS_API_KEY:
        coords = _geocode_google(full_address)
    elif MAPBOX_TOKEN:
        coords = _geocode_mapbox(full_address)
    else:
        log.warning("No geocoder key set — using MOCK coordinates for %s", record.address)
        coords = _geocode_mock(record.address_key)

    if coords:
        record.lat, record.lng = coords
    return record


def _geocode_google(address: str) -> Optional[tuple[float, float]]:
    try:
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": address, "key": GOOGLE_MAPS_API_KEY, "region": "au"},
            timeout=15,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if results:
            loc = results[0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        log.error("Google geocode failed for %r: %s", address, exc)
    return None


def _geocode_mapbox(address: str) -> Optional[tuple[float, float]]:
    try:
        url = (
            "https://api.mapbox.com/geocoding/v5/mapbox.places/"
            f"{requests.utils.quote(address)}.json"
        )
        resp = requests.get(
            url, params={"access_token": MAPBOX_TOKEN, "country": "au", "limit": 1}, timeout=15
        )
        resp.raise_for_status()
        features = resp.json().get("features", [])
        if features:
            lng, lat = features[0]["center"]  # Mapbox returns [lng, lat]
            return lat, lng
    except (requests.RequestException, KeyError, ValueError) as exc:
        log.error("Mapbox geocode failed for %r: %s", address, exc)
    return None


def _geocode_mock(seed: str) -> tuple[float, float]:
    """Deterministic pseudo-coordinates scattered ~±0.1° around Melbourne CBD."""
    h = sum(ord(c) for c in seed)
    lat = MELBOURNE_LAT + ((h % 200) - 100) / 1000.0
    lng = MELBOURNE_LNG + ((h // 200 % 200) - 100) / 1000.0
    return round(lat, 6), round(lng, 6)


# ---------------------------------------------------------------------------
# Fetching the live page (Playwright handles JS-rendered content)
# ---------------------------------------------------------------------------
def fetch_live_html(url: str) -> str:
    from playwright.sync_api import sync_playwright  # imported lazily so --mock needs no browser

    log.info("Fetching %s", url)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        )
        page.goto(url, wait_until="networkidle", timeout=60_000)
        # TODO(selector): wait for the results container before reading content.
        # page.wait_for_selector("li.auction-result", timeout=30_000)
        html = page.content()
        browser.close()
    return html


# ---------------------------------------------------------------------------
# Writing to Supabase
# ---------------------------------------------------------------------------
def push_to_supabase(records: list[AuctionRecord], week_ending: date) -> None:
    from supabase import create_client  # imported lazily

    if not (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
        log.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — cannot write.")
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    week_str = week_ending.isoformat()
    written = 0

    for rec in records:
        # 1) Upsert the property (dedup on address_key); read back its id.
        prop = (
            client.table("properties")
            .upsert(
                {
                    "address": rec.address,
                    "address_key": rec.address_key,
                    "suburb": rec.suburb,
                    "postcode": rec.postcode,
                    "state": "VIC",
                    "lat": rec.lat,
                    "lng": rec.lng,
                    "property_type": rec.property_type,
                    "bedrooms": rec.bedrooms,
                    "bathrooms": rec.bathrooms,
                    "carspaces": rec.carspaces,
                },
                on_conflict="address_key",
            )
            .execute()
        )
        property_id = prop.data[0]["id"]

        # 2) Upsert the per-week result (dedup on property + week → re-runnable).
        client.table("auction_results").upsert(
            {
                "property_id": property_id,
                "week_ending_date": week_str,
                "status": rec.status,
                "passed_in_price": rec.passed_in_price,
                "vendor_bid": rec.vendor_bid,
                "agent": rec.agent,
                "agency": rec.agency,
                "source": rec.source,
            },
            on_conflict="property_id,week_ending_date",
        ).execute()
        written += 1

    log.info("Upserted %d properties + results for week ending %s", written, week_str)


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------
def most_recent_saturday(today: Optional[date] = None) -> date:
    """The Saturday on/just before `today` — the auction day for the week."""
    today = today or date.today()
    # weekday(): Mon=0 ... Sat=5, Sun=6
    return today - timedelta(days=(today.weekday() - 5) % 7)


# Bundled sample so the whole pipeline runs end-to-end with no live site / keys.
SAMPLE_HTML = """
<ul>
  <li class="auction-result">
    <div class="result-status">Passed In</div>
    <div class="address">12 Smith Street</div>
    <div class="suburb">Richmond VIC 3121</div>
    <div class="price">$1,250,000</div>
    <div class="agency">Biggin &amp; Scott</div>
    <div class="property-type">House</div>
    <span class="feature-beds">3</span>
    <span class="feature-baths">2</span>
    <span class="feature-cars">1</span>
  </li>
  <li class="auction-result">
    <div class="result-status">Sold</div>
    <div class="address">5 Park Avenue</div>
    <div class="suburb">Brunswick VIC 3056</div>
    <div class="price">$980,000</div>
    <div class="agency">Nelson Alexander</div>
    <div class="property-type">Townhouse</div>
  </li>
  <li class="auction-result">
    <div class="result-status">Passed In</div>
    <div class="address">88 High Street</div>
    <div class="suburb">Prahran VIC 3181</div>
    <div class="price">$2,100,000</div>
    <div class="agency">Marshall White</div>
    <div class="property-type">Unit</div>
    <span class="feature-beds">2</span>
    <span class="feature-baths">1</span>
    <span class="feature-cars">1</span>
  </li>
</ul>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape weekend Passed-In auction results (VIC).")
    parser.add_argument("--mock", action="store_true",
                        help="Use bundled sample HTML and skip the DB write.")
    parser.add_argument("--no-write", action="store_true",
                        help="Scrape + geocode live, but skip the DB write.")
    parser.add_argument("--week", help="Auction-Saturday date (YYYY-MM-DD). Defaults to most recent.")
    args = parser.parse_args()

    week_ending = (
        datetime.strptime(args.week, "%Y-%m-%d").date() if args.week else most_recent_saturday()
    )
    log.info("Target week ending (auction Saturday): %s", week_ending)

    html = SAMPLE_HTML if args.mock else fetch_live_html(AUCTION_RESULTS_URL)
    records = parse_results(html)

    passed_in = [r for r in records if r.status == "passed_in"]
    log.info("%d of %d results passed in", len(passed_in), len(records))

    for rec in passed_in:
        geocode(rec)

    if args.mock or args.no_write:
        for r in passed_in:
            log.info(
                "PASSED IN  %-26s %-16s (%.4f, %.4f)  %s",
                r.address, r.suburb or "", r.lat or 0.0, r.lng or 0.0, r.agency or "",
            )
        log.info("Dry run — no database write.")
        return

    push_to_supabase(passed_in, week_ending)


if __name__ == "__main__":
    main()
