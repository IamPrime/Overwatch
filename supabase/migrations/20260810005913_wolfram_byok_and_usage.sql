-- Overwatch v2 schema: per-user Wolfram Alpha BYOK + daily free-lookup usage tracking.
-- Run this once in the Supabase SQL Editor for your project (see README's "v2 setup" section).
--
-- A note on anonymous-user access control (see
-- https://supabase.com/docs/guides/auth/auth-anonymous#access-control): that guide's
-- pattern is a RESTRICTIVE policy checking the is_anonymous JWT claim, e.g. "only
-- permanent users may insert." Deliberately not used here, for two reasons: (1)
-- server.js always queries with the service_role key, which bypasses RLS entirely, so
-- a restrictive policy on these tables would never actually be evaluated unless a
-- future frontend change queries them directly with the anon key; (2) even then, there
-- is no operation here that should be permanent-users-only - anonymous (installed-PWA)
-- and permanent (web-login) accounts are intentionally symmetric: both get the same
-- 5 free lookups/day and can both save their own Wolfram App ID. The actual abuse risk
-- specific to anonymous sign-in - repeatedly minting fresh accounts to keep harvesting
-- new 5/day allowances against the shared WOLFRAM_APP_ID - isn't an RLS problem (RLS
-- only governs what an already-created account can do, not how many accounts get
-- created) and is instead covered by Supabase's own "Abuse prevention and rate limits"
-- section for anonymous auth: enable invisible CAPTCHA/Cloudflare Turnstile on
-- anonymous sign-ins in the dashboard (Authentication -> Sign In / Providers ->
-- Anonymous Sign-Ins), on top of the default IP-based 30 requests/hour limit that
-- applies out of the box.

-- ============================================================
-- BYOK: each user's optional personal Wolfram Alpha App ID
-- ============================================================
create table public.user_wolfram_keys (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  wolfram_app_id text not null,
  verified_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.user_wolfram_keys enable row level security;

create policy "select own key" on public.user_wolfram_keys
  for select using (auth.uid() = user_id);
create policy "insert own key" on public.user_wolfram_keys
  for insert with check (auth.uid() = user_id);
create policy "update own key" on public.user_wolfram_keys
  for update using (auth.uid() = user_id);
create policy "delete own key" on public.user_wolfram_keys
  for delete using (auth.uid() = user_id);

-- ============================================================
-- Daily usage counter for the shared Wolfram key
-- ============================================================
create table public.wolfram_usage (
  user_id      uuid not null references auth.users(id) on delete cascade,
  usage_date   date not null,
  lookup_count int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.wolfram_usage enable row level security;

-- Read-only for the owning user. Deliberately no insert/update/delete policy here -
-- with RLS enabled, "no policy" means "denied" for that operation, and all writes
-- must go through increment_wolfram_usage/decrement_wolfram_usage below instead.
create policy "select own usage" on public.wolfram_usage
  for select using (auth.uid() = user_id);

-- ============================================================
-- Atomic, race-safe increment used by server.js on every shared-key lookup.
-- Single-statement upsert with a WHERE guard: the row lock on (user_id, usage_date)
-- serializes concurrent callers, so at most one request can push the count across
-- p_daily_limit. A naive "SELECT count; if < limit then UPDATE" from Node would let
-- two concurrent requests both read count=4 and both write 5.
-- ============================================================
create or replace function public.increment_wolfram_usage(p_user_id uuid, p_daily_limit int)
returns table(new_count int, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count int;
begin
  insert into public.wolfram_usage (user_id, usage_date, lookup_count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set lookup_count = public.wolfram_usage.lookup_count + 1,
        updated_at   = now()
    where public.wolfram_usage.lookup_count < p_daily_limit
  returning lookup_count into v_count;

  if v_count is null then
    -- WHERE guard blocked the update (already at/over cap) - report the current
    -- count, not allowed.
    select lookup_count into v_count
    from public.wolfram_usage
    where user_id = p_user_id and usage_date = v_today;

    return query select v_count, false;
  else
    return query select v_count, true;
  end if;
end;
$$;

-- Best-effort refund when a charged lookup's Wolfram call still fails outright.
-- Not safety-critical (worst case an off-by-one under concurrency), so it doesn't
-- need the same WHERE-guard treatment as the increment above.
create or replace function public.decrement_wolfram_usage(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.wolfram_usage
  set lookup_count = greatest(lookup_count - 1, 0), updated_at = now()
  where user_id = p_user_id and usage_date = (now() at time zone 'utc')::date;
$$;

-- CRITICAL: Postgres grants EXECUTE to PUBLIC by default when a function is created.
-- Both functions above are SECURITY DEFINER and take a raw p_user_id, so leaving the
-- default grant in place would let any signed-in user call them directly via the
-- anon-key RPC endpoint (bypassing server.js entirely) with someone else's user_id to
-- inspect or tamper with their quota. Only the backend (using the service_role key)
-- should ever be able to call these.
revoke all on function public.increment_wolfram_usage(uuid, int) from public;
grant execute on function public.increment_wolfram_usage(uuid, int) to service_role;

revoke all on function public.decrement_wolfram_usage(uuid) from public;
grant execute on function public.decrement_wolfram_usage(uuid) to service_role;
