-- Game Arcade: accounts + lightweight per-game stats.
--
-- Design:
--   profiles       one row per user (the "overall user" table)
--   game_stats     per (user, game) aggregate -> play count, win rate, rating
--   game_sessions  one row per completed play -> start/end, opponent, turns, avg turn
--
-- Guests (not logged in) never touch this schema; the web app keeps their
-- stats in localStorage. Logged-in plays are written via record_game_session().

-- Needed for gen_random_uuid() on older projects (no-op if already present).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            text not null,
  total_games_played  integer not null default 0,
  created_at          timestamptz not null default now()
);

comment on table public.profiles is 'Overall per-user account info shown on the profile.';

-- ---------------------------------------------------------------------------
-- game_stats: rolled-up totals per user per game (drives win rate + rating)
-- ---------------------------------------------------------------------------
create table if not exists public.game_stats (
  user_id             uuid not null references auth.users (id) on delete cascade,
  game_id             text not null,
  plays               integer not null default 0,
  wins                integer not null default 0,
  losses              integer not null default 0,
  draws               integer not null default 0,
  total_play_time_min integer not null default 0,
  best_score          integer,
  rating              integer not null default 1000,
  last_played_at      timestamptz,
  primary key (user_id, game_id)
);

comment on column public.game_stats.rating is 'Simple win/loss rating for human-vs-human play. Can be upgraded to true Elo later.';

-- ---------------------------------------------------------------------------
-- game_sessions: one row per completed play (the detailed history)
-- ---------------------------------------------------------------------------
create table if not exists public.game_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  game_id       text not null,
  mode          text not null,            -- solo | ai | pass-and-play | remote
  opponent      text not null,            -- computer | user | guest | solo
  result        text,                     -- win | loss | draw | null (no win concept)
  score         integer,
  turns         integer,
  avg_turn_sec  integer,
  duration_min  integer not null default 0,
  started_at    timestamptz not null
);

create index if not exists game_sessions_user_game_idx
  on public.game_sessions (user_id, game_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: every row is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.game_stats    enable row level security;
alter table public.game_sessions enable row level security;

drop policy if exists "profiles: read own"    on public.profiles;
drop policy if exists "profiles: insert own"  on public.profiles;
drop policy if exists "profiles: update own"  on public.profiles;
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "game_stats: read own" on public.game_stats;
create policy "game_stats: read own" on public.game_stats for select using (auth.uid() = user_id);

drop policy if exists "game_sessions: read own" on public.game_sessions;
create policy "game_sessions: read own" on public.game_sessions for select using (auth.uid() = user_id);

-- Writes go exclusively through the SECURITY DEFINER function below, so we do
-- not add INSERT/UPDATE policies for stats/sessions to clients.

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
begin
  base_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(new.email, '@', 1)
  );
  -- Keep usernames unique without failing signup on collision.
  insert into public.profiles (id, username)
  values (new.id, base_name)
  on conflict (id) do nothing;

  -- If the chosen name is taken, fall back to a suffixed variant.
  if exists (select 1 from public.profiles where username = base_name and id <> new.id) then
    update public.profiles
       set username = base_name || '-' || substr(new.id::text, 1, 4)
     where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- record_game_session: the single write path for logged-in plays.
-- Inserts the session row and atomically rolls up game_stats + profiles.
-- ---------------------------------------------------------------------------
create or replace function public.record_game_session(
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
begin
  if uid is null then
    raise exception 'must be authenticated';
  end if;

  insert into public.game_sessions (
    user_id, game_id, mode, opponent, result, score, turns,
    avg_turn_sec, duration_min, started_at
  ) values (
    uid, p_game_id, p_mode, p_opponent, p_result, p_score, p_turns,
    p_avg_turn_sec, greatest(0, coalesce(p_duration_min, 0)), p_started_at
  );

  -- Simple rating: only adjust for human-vs-human results.
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
    greatest(0, coalesce(p_duration_min, 0)),
    p_score,
    1000 + rating_delta,
    now()
  )
  on conflict (user_id, game_id) do update set
    plays              = gs.plays + 1,
    wins               = gs.wins   + case when p_result = 'win'  then 1 else 0 end,
    losses             = gs.losses + case when p_result = 'loss' then 1 else 0 end,
    draws              = gs.draws  + case when p_result = 'draw' then 1 else 0 end,
    total_play_time_min = gs.total_play_time_min + greatest(0, coalesce(p_duration_min, 0)),
    best_score         = greatest(coalesce(gs.best_score, p_score), coalesce(p_score, gs.best_score)),
    rating             = greatest(0, gs.rating + rating_delta),
    last_played_at     = now();

  update public.profiles
     set total_games_played = total_games_played + 1
   where id = uid;
end;
$$;

grant execute on function public.record_game_session(
  text, text, text, text, integer, integer, integer, integer, timestamptz
) to authenticated;
