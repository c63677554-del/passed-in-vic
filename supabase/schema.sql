-- ============================================================================
-- Passed-In VIC — Supabase schema (Step 1)
--
-- Run this once in the Supabase SQL Editor:
--   Dashboard → SQL Editor → New query → paste → Run
-- (or `supabase db push` if you use the CLI with this file as a migration).
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto.
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- properties — one row per physical property, deduplicated by address_key.
-- ----------------------------------------------------------------------------
create table if not exists public.properties (
    id            uuid primary key default gen_random_uuid(),
    -- Human-readable full address, e.g. "12 Smith Street, Richmond VIC 3121".
    address       text        not null,
    -- Normalized dedup key (lower-cased, alnum + single spaces). Lets the
    -- scraper upsert idempotently instead of inserting the same home twice.
    address_key   text        not null unique,
    suburb        text,
    postcode      text,
    state         text        not null default 'VIC',
    -- Geolocation (WGS84). Nullable so a property can exist even if geocoding
    -- temporarily fails; the map simply skips rows without coordinates.
    lat           double precision,
    lng           double precision,
    -- House | Unit | Townhouse | Apartment | Land | ...
    property_type text,
    bedrooms      smallint,
    bathrooms     smallint,
    carspaces     smallint,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.properties is
    'Physical properties, deduplicated by address_key.';

-- ----------------------------------------------------------------------------
-- auction_results — one row per property per auction week.
-- A property can recur across weeks (e.g. passed in, then sold the next month).
-- ----------------------------------------------------------------------------
create table if not exists public.auction_results (
    id               uuid primary key default gen_random_uuid(),
    property_id      uuid not null references public.properties(id) on delete cascade,
    -- The Saturday the auction was held (the week's auction day). Drives the
    -- "auction week" filter. Stored as a plain date, e.g. 2026-06-13.
    week_ending_date date not null,
    -- 'passed_in' | 'sold' | 'withdrawn' | 'sold_prior' | 'sold_after'
    status           text not null default 'passed_in',
    -- Highest bid at which it passed in (AUD, whole dollars). Often undisclosed.
    passed_in_price  integer,
    vendor_bid       integer,
    agent            text,
    agency           text,
    -- Provenance for debugging: 'domain' | 'reiv' | ...
    source           text,
    created_at       timestamptz not null default now(),
    -- A property has at most one result per week — makes the scraper re-runnable.
    unique (property_id, week_ending_date)
);

comment on table public.auction_results is
    'Per-week auction outcome for a property.';

-- ----------------------------------------------------------------------------
-- Indexes — the map filters by week and joins results → properties.
-- ----------------------------------------------------------------------------
create index if not exists idx_auction_results_week   on public.auction_results (week_ending_date);
create index if not exists idx_auction_results_status on public.auction_results (status);
create index if not exists idx_auction_results_prop   on public.auction_results (property_id);

-- ----------------------------------------------------------------------------
-- Keep updated_at fresh on every UPDATE of properties.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_properties_updated_at on public.properties;
create trigger trg_properties_updated_at
    before update on public.properties
    for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
--   * Public (anon) gets READ-ONLY access — the map is public.
--   * Writes are done by the scraper with the SERVICE ROLE key, which bypasses
--     RLS entirely. We deliberately add NO insert/update policy, so the public
--     can never mutate data even though they can read it.
-- ----------------------------------------------------------------------------
alter table public.properties      enable row level security;
alter table public.auction_results enable row level security;

drop policy if exists "Public read access" on public.properties;
create policy "Public read access"
    on public.properties for select
    using (true);

drop policy if exists "Public read access" on public.auction_results;
create policy "Public read access"
    on public.auction_results for select
    using (true);

-- ----------------------------------------------------------------------------
-- Optional convenience view: flattened, geocoded, passed-in rows.
-- security_invoker = true → the view respects the caller's RLS (safe for anon).
-- The frontend in this repo uses the PostgREST embed instead, but this view is
-- handy for ad-hoc SQL, dashboards, or a simpler client query.
-- ----------------------------------------------------------------------------
create or replace view public.passed_in_view
with (security_invoker = true) as
select
    ar.id              as result_id,
    ar.week_ending_date,
    ar.status,
    ar.passed_in_price,
    ar.vendor_bid,
    ar.agent,
    ar.agency,
    ar.source,
    p.id               as property_id,
    p.address,
    p.suburb,
    p.postcode,
    p.state,
    p.lat,
    p.lng,
    p.property_type,
    p.bedrooms,
    p.bathrooms,
    p.carspaces
from public.auction_results ar
join public.properties p on p.id = ar.property_id
where ar.status = 'passed_in'
  and p.lat is not null
  and p.lng is not null;

comment on view public.passed_in_view is
    'Flattened, geocoded passed-in results for the map / dashboards.';
