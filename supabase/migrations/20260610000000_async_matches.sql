-- Async (saved) multiplayer: turn-based games persisted in Postgres + Realtime.

create table if not exists public.async_matches (
  id            uuid primary key default gen_random_uuid(),
  game_id       text not null,
  join_code     text,
  player1_id    uuid not null references auth.users (id) on delete cascade,
  player2_id    uuid references auth.users (id) on delete cascade,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  whose_turn    uuid references auth.users (id),
  init          jsonb not null default '{}',
  state         jsonb not null default '{}',
  winner_id     uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_move_at  timestamptz not null default now()
);

create unique index if not exists async_matches_join_code_waiting_idx
  on public.async_matches (join_code)
  where status = 'waiting' and join_code is not null;

create index if not exists async_matches_player1_game_idx
  on public.async_matches (player1_id, game_id, status);

create index if not exists async_matches_player2_game_idx
  on public.async_matches (player2_id, game_id, status);

create table if not exists public.async_moves (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.async_matches (id) on delete cascade,
  seq        integer not null,
  author_id  uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  created_at timestamptz not null default now(),
  unique (match_id, seq)
);

create index if not exists async_moves_match_seq_idx
  on public.async_moves (match_id, seq);

-- Word-game secrets: no SELECT policy (read only inside SECURITY DEFINER functions).
create table if not exists public.async_secrets (
  match_id  uuid not null references public.async_matches (id) on delete cascade,
  owner_id  uuid not null references auth.users (id) on delete cascade,
  secret    text not null,
  primary key (match_id, owner_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.async_matches enable row level security;
alter table public.async_moves   enable row level security;
alter table public.async_secrets enable row level security;

drop policy if exists "async_matches: participants read" on public.async_matches;
create policy "async_matches: participants read" on public.async_matches
  for select using (auth.uid() in (player1_id, player2_id));

drop policy if exists "async_moves: participants read" on public.async_moves;
create policy "async_moves: participants read" on public.async_moves
  for select using (
    exists (
      select 1 from public.async_matches m
       where m.id = match_id
         and auth.uid() in (m.player1_id, coalesce(m.player2_id, m.player1_id))
    )
  );

grant select on public.async_matches to authenticated;
grant select on public.async_moves to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.async_matches;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.async_moves;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.async_active_count(p_user_id uuid, p_game_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.async_matches
   where game_id = p_game_id
     and status in ('waiting', 'active')
     and (player1_id = p_user_id or player2_id = p_user_id);
$$;

create or replace function public.async_generate_join_code()
returns text
language plpgsql
as $$
declare
  code text;
  tries integer := 0;
begin
  loop
    code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
    exit when not exists (
      select 1 from public.async_matches
       where join_code = code and status = 'waiting'
    );
    tries := tries + 1;
    if tries > 50 then
      raise exception 'could not generate join code';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function public.async_is_board_game(p_game_id text)
returns boolean
language sql
immutable
as $$
  select p_game_id in ('tic-tac-toe', 'ultimate-tic-tac-toe');
$$;

-- ---------------------------------------------------------------------------
-- create_async_match
-- ---------------------------------------------------------------------------
create or replace function public.create_async_match(
  p_game_id text,
  p_init    jsonb default '{}'
)
returns table (match_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text;
  mid uuid;
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  if public.async_active_count(uid, p_game_id) >= 3 then
    raise exception 'maximum 3 in-progress async games for this title';
  end if;

  code := public.async_generate_join_code();

  insert into public.async_matches (game_id, join_code, player1_id, status, init, whose_turn)
  values (p_game_id, code, uid, 'waiting', coalesce(p_init, '{}'), uid)
  returning id into mid;

  return query select mid, code;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_async_match
-- ---------------------------------------------------------------------------
create or replace function public.join_async_match(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  code text := regexp_replace(coalesce(p_join_code, ''), '\D', '', 'g');
  m public.async_matches%rowtype;
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  if length(code) <> 6 then raise exception 'invalid join code'; end if;

  select * into m
    from public.async_matches
   where join_code = code and status = 'waiting'
   for update;

  if not found then raise exception 'game not found or already started'; end if;
  if m.player1_id = uid then raise exception 'cannot join your own game'; end if;

  if public.async_active_count(uid, m.game_id) >= 3 then
    raise exception 'maximum 3 in-progress async games for this title';
  end if;

  update public.async_matches
     set player2_id   = uid,
         status       = 'active',
         join_code    = null,
         whose_turn   = player1_id,
         updated_at   = now(),
         last_move_at = now()
   where id = m.id;

  return m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- append_async_move
-- ---------------------------------------------------------------------------
create or replace function public.append_async_move(
  p_match_id     uuid,
  p_seq_expected integer,
  p_payload      jsonb,
  p_next_turn    uuid default null,
  p_new_state    jsonb default null,
  p_finished     boolean default false,
  p_winner_id    uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.async_matches%rowtype;
  max_seq integer;
  new_seq integer;
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  select * into m from public.async_matches where id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if m.status = 'finished' then raise exception 'match already finished'; end if;
  if uid not in (m.player1_id, coalesce(m.player2_id, m.player1_id)) then
    raise exception 'not a participant';
  end if;
  if m.status = 'waiting' then raise exception 'waiting for opponent'; end if;

  if public.async_is_board_game(m.game_id) then
    if m.whose_turn is distinct from uid then
      raise exception 'not your turn';
    end if;
  end if;

  select coalesce(max(seq), 0) into max_seq
    from public.async_moves where match_id = p_match_id;

  if max_seq <> coalesce(p_seq_expected, 0) then
    raise exception 'stale move sequence';
  end if;

  new_seq := max_seq + 1;

  insert into public.async_moves (match_id, seq, author_id, payload)
  values (p_match_id, new_seq, uid, p_payload);

  update public.async_matches
     set whose_turn   = case when p_finished then null else coalesce(p_next_turn, whose_turn) end,
         state        = coalesce(p_new_state, state),
         status       = case when p_finished then 'finished' else status end,
         winner_id    = case when p_finished then p_winner_id else winner_id end,
         updated_at   = now(),
         last_move_at = now()
   where id = p_match_id;

  return new_seq;
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_async_match (explicit end without another move)
-- ---------------------------------------------------------------------------
create or replace function public.finish_async_match(
  p_match_id  uuid,
  p_winner_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.async_matches%rowtype;
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  select * into m from public.async_matches where id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if uid not in (m.player1_id, coalesce(m.player2_id, m.player1_id)) then
    raise exception 'not a participant';
  end if;

  update public.async_matches
     set status = 'finished', winner_id = p_winner_id, whose_turn = null,
         updated_at = now(), last_move_at = now()
   where id = p_match_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_async_match
-- ---------------------------------------------------------------------------
create or replace function public.delete_async_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  delete from public.async_matches
   where id = p_match_id
     and uid in (player1_id, coalesce(player2_id, player1_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- prune_my_stale_matches (client fallback; also used by pg_cron globally)
-- ---------------------------------------------------------------------------
create or replace function public.prune_my_stale_matches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then return 0; end if;

  delete from public.async_matches
   where last_move_at < now() - interval '7 days'
     and uid in (player1_id, coalesce(player2_id, player1_id));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.prune_stale_async_matches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.async_matches
   where last_move_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Word game: submit_secret
-- ---------------------------------------------------------------------------
create or replace function public.submit_async_secret(
  p_match_id uuid,
  p_secret   text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.async_matches%rowtype;
  normalized text;
  p1_ready boolean;
  p2_ready boolean;
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  normalized := upper(trim(coalesce(p_secret, '')));
  if length(normalized) < 2 then raise exception 'secret too short'; end if;

  select * into m from public.async_matches where id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if m.status not in ('active', 'waiting') then raise exception 'match not open'; end if;
  if uid not in (m.player1_id, coalesce(m.player2_id, m.player1_id)) then
    raise exception 'not a participant';
  end if;

  insert into public.async_secrets (match_id, owner_id, secret)
  values (p_match_id, uid, normalized)
  on conflict (match_id, owner_id) do update set secret = excluded.secret;

  select exists(select 1 from public.async_secrets where match_id = p_match_id and owner_id = m.player1_id) into p1_ready;
  select exists(select 1 from public.async_secrets where match_id = p_match_id and owner_id = m.player2_id) into p2_ready;

  if m.player2_id is not null and p1_ready and p2_ready and m.status = 'active' then
    update public.async_matches
       set last_move_at = now(), updated_at = now(), whose_turn = null
     where id = p_match_id;
    return true;
  end if;

  update public.async_matches set last_move_at = now(), updated_at = now() where id = p_match_id;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Word Guess scoring (server-side, no secret leak)
-- ---------------------------------------------------------------------------
create or replace function public.score_async_word_guess(
  p_match_id uuid,
  p_guess    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.async_matches%rowtype;
  opponent_id uuid;
  target_secret text;
  g text;
  results jsonb;
  won boolean;
  lost boolean;
  guess_num integer;
  max_guesses constant integer := 6;
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  g := upper(trim(coalesce(p_guess, '')));

  select * into m from public.async_matches where id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if m.status <> 'active' then raise exception 'match not active'; end if;

  opponent_id := case when uid = m.player1_id then m.player2_id else m.player1_id end;
  if opponent_id is null then raise exception 'waiting for opponent'; end if;

  select s.secret into target_secret
    from public.async_secrets s
   where s.match_id = p_match_id and s.owner_id = opponent_id;
  if target_secret is null then raise exception 'opponent has not submitted a word'; end if;
  if length(g) <> length(target_secret) then raise exception 'wrong length'; end if;

  select count(*) + 1 into guess_num
    from public.async_moves
   where match_id = p_match_id
     and author_id = uid
     and payload->>'type' = 'wg:guess';

  if guess_num > max_guesses then raise exception 'no guesses left'; end if;

  -- Simple letter scoring (matches client scoreWordGuess semantics loosely via json array)
  results := (
    select jsonb_agg(
      case
        when substr(g, i, 1) = substr(target_secret, i, 1) then '"correct"'::jsonb
        when strpos(target_secret, substr(g, i, 1)) > 0 then '"present"'::jsonb
        else '"absent"'::jsonb
      end
    )
    from generate_series(1, length(g)) i
  );

  won := g = target_secret;
  lost := not won and guess_num >= max_guesses;

  insert into public.async_moves (match_id, seq, author_id, payload)
  select p_match_id,
         coalesce((select max(seq) from public.async_moves where match_id = p_match_id), 0) + 1,
         uid,
         jsonb_build_object(
           'type', 'wg:feedback',
           'guess', g,
           'results', results,
           'won', won,
           'lost', lost,
           'reveal', case when won or lost then target_secret else null end
         );

  update public.async_matches set last_move_at = now(), updated_at = now() where id = p_match_id;

  return jsonb_build_object(
    'guess', g,
    'results', results,
    'won', won,
    'lost', lost,
    'reveal', case when won or lost then target_secret else null end,
    'guessCount', guess_num
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hangman scoring
-- ---------------------------------------------------------------------------
create or replace function public.score_async_hangman_guess(
  p_match_id uuid,
  p_letter   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.async_matches%rowtype;
  opponent_id uuid;
  target_secret text;
  letter text;
  guessed jsonb;
  wrong_count integer;
  won boolean;
  lost boolean;
  max_wrong constant integer := 6;
  display text;
  ch text;
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  letter := upper(substr(trim(coalesce(p_letter, '')), 1, 1));
  if letter = '' then raise exception 'invalid letter'; end if;

  select * into m from public.async_matches where id = p_match_id;
  if not found then raise exception 'match not found'; end if;

  opponent_id := case when uid = m.player1_id then m.player2_id else m.player1_id end;
  select s.secret into target_secret
    from public.async_secrets s
   where s.match_id = p_match_id and s.owner_id = opponent_id;

  select coalesce(
    (select jsonb_agg(distinct elem)
       from public.async_moves am,
            jsonb_array_elements_text(am.payload->'guessed') elem
      where am.match_id = p_match_id and am.author_id = uid
        and am.payload->>'type' = 'hm:state'),
    '[]'::jsonb
  ) into guessed;

  if guessed ? letter then raise exception 'already guessed'; end if;

  guessed := guessed || to_jsonb(letter);

  select count(*) into wrong_count
    from jsonb_array_elements_text(guessed) g(ch)
   where strpos(target_secret, g.ch) = 0;

  won := (
    select bool_and(strpos(target_secret, g.ch) > 0)
    from jsonb_array_elements_text(guessed) g(ch)
  );
  lost := wrong_count >= max_wrong;

  display := (
    select string_agg(
      case when strpos(guessed::text, ch) > 0 or guessed ? ch then ch else '_' end, ' '
    )
    from unnest(string_to_array(target_secret, null)) ch
  );

  insert into public.async_moves (match_id, seq, author_id, payload)
  select p_match_id,
         coalesce((select max(seq) from public.async_moves where match_id = p_match_id), 0) + 1,
         uid,
         jsonb_build_object(
           'type', 'hm:state',
           'guessed', guessed,
           'display', display,
           'wrongCount', wrong_count,
           'won', won,
           'lost', lost,
           'reveal', case when won or lost then target_secret else null end
         );

  update public.async_matches set last_move_at = now(), updated_at = now() where id = p_match_id;

  return jsonb_build_object(
    'guessed', guessed,
    'display', display,
    'wrongCount', wrong_count,
    'won', won,
    'lost', lost,
    'reveal', case when won or lost then target_secret else null end
  );
end;
$$;

grant execute on function public.create_async_match(text, jsonb) to authenticated;
grant execute on function public.join_async_match(text) to authenticated;
grant execute on function public.append_async_move(uuid, integer, jsonb, uuid, jsonb, boolean, uuid) to authenticated;
grant execute on function public.finish_async_match(uuid, uuid) to authenticated;
grant execute on function public.delete_async_match(uuid) to authenticated;
grant execute on function public.prune_my_stale_matches() to authenticated;
grant execute on function public.submit_async_secret(uuid, text) to authenticated;
grant execute on function public.score_async_word_guess(uuid, text) to authenticated;
grant execute on function public.score_async_hangman_guess(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron: daily prune of idle matches (> 7 days)
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('prune-stale-async-matches');
exception when others then null;
end $$;

select cron.schedule(
  'prune-stale-async-matches',
  '0 4 * * *',
  $$select public.prune_stale_async_matches()$$
);
