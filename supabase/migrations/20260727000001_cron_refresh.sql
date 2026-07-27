-- Always-on weekly scrape, scheduled inside Postgres (incident 27 Jul 2026).
--
-- Background: the refresh used to run on the owner's laptop (Task Scheduler),
-- with a watchdog that also ran on that laptop. While the owner was away the
-- machine was off, so neither ran and subscribers lost two weeks of results.
-- Scheduling now lives in the database, which is always on.
--
-- Design note: the job runs DAILY, not weekly, even though auctions are weekly.
-- refresh-data is idempotent (it merges by address|suburb|week and dedupes), so
-- a second run in the same week is a cheap no-op. That makes retry automatic:
-- if Sunday's run fails for any reason, Monday's run repairs it with no watchdog
-- and no human. It removes the "who watches the watchdog" problem entirely.
--
-- 11:30 UTC = ~21:30 Melbourne (AEST) / 22:30 (AEDT), after weekend auctions.
--
-- SECRET: the job authenticates to the edge function with the service-role key,
-- read from Vault by name. The value is NEVER written in this file - it is
-- inserted once, out of band, via vault.create_secret('<key>', 'passd_service_key').

create extension if not exists pg_cron;
-- pg_net creates and owns its own `net` schema; the functions are net.http_post
-- etc. Do NOT qualify them as extensions.net.* - that resolves to nothing and the
-- job would throw every night while appearing to be scheduled.
create extension if not exists pg_net;

-- Recreate cleanly so this migration stays idempotent across redeploys.
select cron.unschedule('passd-daily-refresh')
where exists (select 1 from cron.job where jobname = 'passd-daily-refresh');

select cron.schedule(
  'passd-daily-refresh',
  '30 11 * * *',
  $job$
  select net.http_post(
    url := 'https://fpxlerpmbsqdwlrgnxsq.supabase.co/functions/v1/refresh-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'passd_service_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);
