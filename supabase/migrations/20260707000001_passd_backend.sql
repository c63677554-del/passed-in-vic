-- Passd backend: subscribers (Stripe state) + app_data (gated weekly payload).
-- Deployed to the DEDICATED "passd" Supabase project (never Fireplace's).

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text unique not null,
  stripe_customer_id text unique,
  status text not null default 'none',      -- none | trialing | active | past_due | canceled
  plan text,                                 -- monthly | annual
  current_period_end timestamptz,
  dev_grant boolean not null default false,  -- preview-mode trial before Stripe is configured
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

-- Users may read their own row; all writes happen via service role (edge functions only).
drop policy if exists "read own subscription" on public.subscribers;
create policy "read own subscription" on public.subscribers
  for select using (auth.uid() = user_id);

create table if not exists public.app_data (
  key text primary key,                      -- 'passed_in'
  generated date,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS on with NO policies: anon/authenticated cannot touch it; only the
-- service role (used by the get-data edge function + weekly uploader) can.
alter table public.app_data enable row level security;

create or replace function public.is_entitled(uid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.subscribers s
    where s.user_id = uid
      and (
        (s.dev_grant and (s.current_period_end is null or s.current_period_end > now()))
        or (s.status in ('trialing','active') and (s.current_period_end is null or s.current_period_end > now()))
      )
  );
$$;
