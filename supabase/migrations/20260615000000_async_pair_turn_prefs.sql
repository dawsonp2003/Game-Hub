-- Alternate who goes first in async online play between the same two players.

create table if not exists public.async_pair_turn_prefs (
  game_id            text not null,
  user_a             uuid not null references auth.users (id) on delete cascade,
  user_b             uuid not null references auth.users (id) on delete cascade,
  next_first_user_id uuid not null references auth.users (id) on delete cascade,
  updated_at         timestamptz not null default now(),
  primary key (game_id, user_a, user_b),
  check (user_a < user_b),
  check (next_first_user_id in (user_a, user_b))
);

alter table public.async_pair_turn_prefs enable row level security;

drop policy if exists "async_pair_turn_prefs: participants" on public.async_pair_turn_prefs;
create policy "async_pair_turn_prefs: participants" on public.async_pair_turn_prefs
  for all using (auth.uid() in (user_a, user_b))
  with check (auth.uid() in (user_a, user_b));

grant select, insert, update on public.async_pair_turn_prefs to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.async_pair_users(p_u1 uuid, p_u2 uuid)
returns table (user_a uuid, user_b uuid)
language sql
immutable
as $$
  select least(p_u1, p_u2), greatest(p_u1, p_u2);
$$;

create or replace function public.async_lookup_pair_first(
  p_game_id text,
  p_player1 uuid,
  p_player2 uuid,
  p_default uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ua uuid;
  ub uuid;
  next_id uuid;
begin
  select p.user_a, p.user_b into ua, ub from public.async_pair_users(p_player1, p_player2) p;
  select t.next_first_user_id into next_id
    from public.async_pair_turn_prefs t
   where t.game_id = p_game_id and t.user_a = ua and t.user_b = ub;
  return coalesce(next_id, p_default);
end;
$$;

create or replace function public.async_rotate_pair_first(
  p_game_id text,
  p_player1 uuid,
  p_player2 uuid,
  p_who_went_first uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ua uuid;
  ub uuid;
  other uuid;
begin
  if p_who_went_first is null or p_player2 is null then return; end if;
  if p_who_went_first = p_player1 then
    other := p_player2;
  elsif p_who_went_first = p_player2 then
    other := p_player1;
  else
    return;
  end if;
  select p.user_a, p.user_b into ua, ub from public.async_pair_users(p_player1, p_player2) p;
  insert into public.async_pair_turn_prefs (game_id, user_a, user_b, next_first_user_id, updated_at)
  values (p_game_id, ua, ub, other, now())
  on conflict (game_id, user_a, user_b)
  do update set next_first_user_id = excluded.next_first_user_id, updated_at = now();
end;
$$;

create or replace function public.async_match_first_turn_user(p_match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.async_matches%rowtype;
  from_init uuid;
  from_move uuid;
begin
  select * into m from public.async_matches where id = p_match_id;
  if not found then return null; end if;

  begin
    from_init := nullif(m.init->>'first_turn_user_id', '')::uuid;
  exception when invalid_text_representation then
    from_init := null;
  end;
  if from_init is not null then return from_init; end if;

  select author_id into from_move
    from public.async_moves
   where match_id = p_match_id
   order by seq asc
   limit 1;
  return from_move;
end;
$$;

create or replace function public.async_on_match_finished(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.async_matches%rowtype;
  first_id uuid;
begin
  select * into m from public.async_matches where id = p_match_id;
  if not found or m.player2_id is null then return; end if;

  first_id := public.async_match_first_turn_user(p_match_id);
  perform public.async_rotate_pair_first(m.game_id, m.player1_id, m.player2_id, first_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- join_async_match — apply pair history when opponent joins
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
  has_moves boolean;
  first_turn uuid;
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

  select exists(select 1 from public.async_moves where match_id = m.id) into has_moves;

  if has_moves then
    first_turn := m.player1_id;
  else
    first_turn := public.async_lookup_pair_first(m.game_id, m.player1_id, uid, m.player1_id);
  end if;

  update public.async_matches
     set player2_id   = uid,
         status       = 'active',
         join_code    = null,
         whose_turn   = case when has_moves then uid else first_turn end,
         init         = coalesce(m.init, '{}'::jsonb)
                        || jsonb_build_object('first_turn_user_id', first_turn),
         updated_at   = now(),
         last_move_at = now()
   where id = m.id;

  return m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_async_invite — same first-turn logic as join code
-- ---------------------------------------------------------------------------
create or replace function public.accept_async_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.async_match_invites%rowtype;
  m public.async_matches%rowtype;
  has_moves boolean;
  first_turn uuid;
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  select * into inv
    from public.async_match_invites
   where id = p_invite_id and to_user_id = uid and status = 'pending'
   for update;

  if not found then raise exception 'invite not found'; end if;

  select * into m from public.async_matches where id = inv.match_id for update;
  if not found then raise exception 'match not found'; end if;

  update public.async_match_invites
     set status = 'accepted'
   where id = p_invite_id;

  if m.status = 'waiting' and m.player2_id is null then
    select exists(select 1 from public.async_moves where match_id = m.id) into has_moves;

    if has_moves then
      first_turn := m.player1_id;
    else
      first_turn := public.async_lookup_pair_first(m.game_id, m.player1_id, uid, m.player1_id);
    end if;

    update public.async_matches
       set player2_id = uid,
           status = 'active',
           join_code = null,
           whose_turn = case when has_moves then uid else first_turn end,
           init = coalesce(m.init, '{}'::jsonb)
                  || jsonb_build_object('first_turn_user_id', first_turn),
           updated_at = now(),
           last_move_at = now()
     where id = m.id;
  end if;

  return m.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- finish_async_match — rotate pair preference after game ends
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

  if m.status <> 'finished' then
    perform public.async_on_match_finished(p_match_id);
  end if;

  update public.async_matches
     set status = 'finished', winner_id = p_winner_id, whose_turn = null,
         updated_at = now(), last_move_at = now()
   where id = p_match_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- append_async_move — rotate when a move finishes the match
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
  move_count integer;
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  select * into m from public.async_matches where id = p_match_id for update;
  if not found then raise exception 'match not found'; end if;
  if m.status = 'finished' then raise exception 'match already finished'; end if;
  if uid not in (m.player1_id, coalesce(m.player2_id, m.player1_id)) then
    raise exception 'not a participant';
  end if;

  if m.status = 'waiting' then
    if uid <> m.player1_id then
      raise exception 'waiting for opponent';
    end if;
    select count(*) into move_count from public.async_moves where match_id = p_match_id;
    if move_count > 0 then
      raise exception 'waiting for opponent to join';
    end if;
  end if;

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

  if p_finished and m.status <> 'finished' then
    perform public.async_on_match_finished(p_match_id);
  end if;

  update public.async_matches
     set whose_turn   = case
           when p_finished then null
           when m.status = 'waiting' then null
           else coalesce(p_next_turn, whose_turn)
         end,
         state        = coalesce(p_new_state, state),
         status       = case when p_finished then 'finished' else status end,
         winner_id    = case when p_finished then p_winner_id else winner_id end,
         updated_at   = now(),
         last_move_at = now()
   where id = p_match_id;

  return new_seq;
end;
$$;

grant execute on function public.async_lookup_pair_first(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.async_rotate_pair_first(text, uuid, uuid, uuid) to authenticated;
