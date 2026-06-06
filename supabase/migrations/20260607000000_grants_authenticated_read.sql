-- Client reads (account page) use the authenticated role + RLS.
-- Writes go through record_game_session (SECURITY DEFINER); without these
-- grants, inserts succeed but SELECT from the app returns nothing.

grant select on public.profiles to authenticated;
grant select on public.game_stats to authenticated;
grant select on public.game_sessions to authenticated;

grant update on public.profiles to authenticated;
