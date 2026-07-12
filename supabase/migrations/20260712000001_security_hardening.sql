-- Security hardening (pentest, 12 Jul 2026). Defense-in-depth layered on top of
-- the RLS that already gates every table. None of this changes app behaviour:
-- all reads/writes the app performs go through edge functions using the service
-- role, which bypasses these grants.

-- is_entitled() is only ever called by the get-data edge function (service role).
-- Removing the client-reachable EXECUTE stops it being used as an oracle to test
-- whether an arbitrary user id is a paying subscriber. anon/authenticated inherit
-- EXECUTE from the PUBLIC pseudo-role, so revoke from PUBLIC and re-grant the one
-- role that legitimately calls it (service role, used inside get-data).
revoke execute on function public.is_entitled(uuid) from public, anon, authenticated;
grant execute on function public.is_entitled(uuid) to service_role;

-- rls_auto_enable() is an event-trigger function (auto-enables RLS on any new
-- public table). It is never directly callable; revoke the default EXECUTE to
-- satisfy the security advisor.
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- app_data holds the full paid dataset. RLS is on with no policy, so it is
-- already service-role-only; drop the inert default grants so a future policy
-- slip cannot expose it.
revoke all on table public.app_data from anon, authenticated;

-- subscribers: anon needs no access at all. authenticated keeps only SELECT (the
-- "read own subscription" policy relies on it); every write happens via the
-- service role in edge functions.
revoke all on table public.subscribers from anon;
revoke insert, update, delete, truncate, references, trigger on table public.subscribers from authenticated;
