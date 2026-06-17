-- Who goes first next time (computer / pass-and-play), per user + game + mode.

create table if not exists public.game_turn_prefs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  game_id    text not null,
  mode       text not null check (mode in ('ai', 'pass-and-play')),
  next_first text not null check (next_first in ('player1', 'player2')) default 'player1',
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, mode)
);

alter table public.game_turn_prefs enable row level security;

drop policy if exists "game_turn_prefs: own" on public.game_turn_prefs;
create policy "game_turn_prefs: own" on public.game_turn_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.game_turn_prefs to authenticated;
