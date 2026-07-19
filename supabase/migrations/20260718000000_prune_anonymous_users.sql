-- Remove short-lived anonymous Auth users without affecting permanent accounts.
--
-- Anonymous users with a recent waiting/active async match are retained so a
-- one-day cleanup cannot destroy an online game that is still resumable.

create or replace function public.prune_stale_anonymous_users()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from auth.users as u
   where u.is_anonymous is true
     and u.created_at < now() - interval '1 day'
     and not exists (
       select 1
         from public.async_matches as m
        where (m.player1_id = u.id or m.player2_id = u.id)
          and m.status in ('waiting', 'active')
          and m.last_move_at >= now() - interval '7 days'
     );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- This is maintenance-only; clients must never be able to delete Auth users.
revoke all on function public.prune_stale_anonymous_users() from public;
revoke all on function public.prune_stale_anonymous_users() from anon;
revoke all on function public.prune_stale_anonymous_users() from authenticated;

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('prune-stale-anonymous-users');
exception when others then null;
end $$;

select cron.schedule(
  'prune-stale-anonymous-users',
  '17 4 * * *',
  $$select public.prune_stale_anonymous_users()$$
);
