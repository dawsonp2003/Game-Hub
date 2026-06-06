-- Store play time as whole minutes instead of milliseconds (smaller integers, easier to read).

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_sessions'
      and column_name = 'duration_ms'
  ) then
    alter table public.game_sessions
      add column if not exists duration_min integer not null default 0;

    update public.game_sessions
       set duration_min = greatest(0, round(duration_ms / 60000.0));

    alter table public.game_sessions drop column duration_ms;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'game_stats'
      and column_name = 'total_play_time_ms'
  ) then
    alter table public.game_stats
      add column if not exists total_play_time_min integer not null default 0;

    update public.game_stats
       set total_play_time_min = greatest(0, round(total_play_time_ms / 60000.0));

    alter table public.game_stats drop column total_play_time_ms;
  end if;
end $$;

-- Postgres cannot rename function parameters via CREATE OR REPLACE.
drop function if exists public.record_game_session(
  text, text, text, text, integer, integer, integer, integer, timestamptz
);

create function public.record_game_session(
  p_game_id     text,
  p_mode        text,
  p_opponent    text,
  p_result      text default null,
  p_score       integer default null,
  p_turns       integer default null,
  p_avg_turn_sec integer default null,
  p_duration_min integer default 0,
  p_started_at  timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rating_delta integer := 0;
  mins integer := greatest(0, coalesce(p_duration_min, 0));
begin
  if uid is null then
    raise exception 'must be authenticated';
  end if;

  insert into public.game_sessions (
    user_id, game_id, mode, opponent, result, score, turns,
    avg_turn_sec, duration_min, started_at
  ) values (
    uid, p_game_id, p_mode, p_opponent, p_result, p_score, p_turns,
    p_avg_turn_sec, mins, p_started_at
  );

  if p_opponent = 'user' then
    if p_result = 'win'  then rating_delta := 25; end if;
    if p_result = 'loss' then rating_delta := -25; end if;
  end if;

  insert into public.game_stats as gs (
    user_id, game_id, plays, wins, losses, draws,
    total_play_time_min, best_score, rating, last_played_at
  ) values (
    uid, p_game_id, 1,
    case when p_result = 'win'  then 1 else 0 end,
    case when p_result = 'loss' then 1 else 0 end,
    case when p_result = 'draw' then 1 else 0 end,
    mins,
    p_score,
    1000 + rating_delta,
    now()
  )
  on conflict (user_id, game_id) do update set
    plays               = gs.plays + 1,
    wins                = gs.wins   + case when p_result = 'win'  then 1 else 0 end,
    losses              = gs.losses + case when p_result = 'loss' then 1 else 0 end,
    draws               = gs.draws  + case when p_result = 'draw' then 1 else 0 end,
    total_play_time_min = gs.total_play_time_min + mins,
    best_score          = greatest(coalesce(gs.best_score, p_score), coalesce(p_score, gs.best_score)),
    rating              = greatest(0, gs.rating + rating_delta),
    last_played_at      = now();

  update public.profiles
     set total_games_played = total_games_played + 1
   where id = uid;
end;
$$;

grant execute on function public.record_game_session(
  text, text, text, text, integer, integer, integer, integer, timestamptz
) to authenticated;

comment on column public.game_sessions.duration_min is 'Session length in whole minutes (rounded from client timing).';
comment on column public.game_stats.total_play_time_min is 'Sum of session lengths in whole minutes.';
