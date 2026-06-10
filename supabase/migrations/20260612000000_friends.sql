-- Friends system: friendships, async invites, head-to-head opponent tracking.

-- ---------------------------------------------------------------------------
-- friendships
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status);

create index if not exists friendships_requester_status_idx
  on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

drop policy if exists "friendships: participants read" on public.friendships;
create policy "friendships: participants read" on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));

grant select on public.friendships to authenticated;

-- ---------------------------------------------------------------------------
-- async_match_invites
-- ---------------------------------------------------------------------------
create table if not exists public.async_match_invites (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references public.async_matches (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id   uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'dismissed')),
  created_at   timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create unique index if not exists async_match_invites_pending_idx
  on public.async_match_invites (match_id, to_user_id)
  where status = 'pending';

create index if not exists async_match_invites_to_user_idx
  on public.async_match_invites (to_user_id, status);

alter table public.async_match_invites enable row level security;

drop policy if exists "async_match_invites: participants read" on public.async_match_invites;
create policy "async_match_invites: participants read" on public.async_match_invites
  for select using (auth.uid() in (from_user_id, to_user_id));

grant select on public.async_match_invites to authenticated;

-- ---------------------------------------------------------------------------
-- game_sessions.opponent_user_id
-- ---------------------------------------------------------------------------
alter table public.game_sessions
  add column if not exists opponent_user_id uuid references auth.users (id) on delete set null;

create index if not exists game_sessions_opponent_idx
  on public.game_sessions (user_id, opponent_user_id, game_id);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.async_match_invites;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.users_are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.friendships f
     where f.status = 'accepted'
       and (
         (f.requester_id = p_user_a and f.addressee_id = p_user_b)
         or (f.requester_id = p_user_b and f.addressee_id = p_user_a)
       )
  );
$$;

create or replace function public.users_are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.friendships f
     where f.status = 'blocked'
       and (
         (f.requester_id = p_user_a and f.addressee_id = p_user_b)
         or (f.requester_id = p_user_b and f.addressee_id = p_user_a)
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- search_users_by_username
-- ---------------------------------------------------------------------------
create or replace function public.search_users_by_username(p_query text)
returns table (id uuid, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  q text := trim(coalesce(p_query, ''));
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  if length(q) < 3 then return; end if;

  return query
  select p.id, p.username
    from public.profiles p
   where lower(p.username) like lower(q) || '%'
     and p.id <> uid
     and not public.users_are_blocked(uid, p.id)
   order by p.username
   limit 10;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_friend_request
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  outgoing integer;
  existing public.friendships%rowtype;
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  if p_user_id is null or p_user_id = uid then raise exception 'invalid user'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user not found';
  end if;
  if public.users_are_blocked(uid, p_user_id) then raise exception 'blocked'; end if;
  if public.users_are_friends(uid, p_user_id) then raise exception 'already friends'; end if;

  select count(*) into outgoing
    from public.friendships
   where requester_id = uid and status = 'pending';

  if outgoing >= 20 then raise exception 'too many pending requests'; end if;

  select * into existing
    from public.friendships
   where requester_id = uid and addressee_id = p_user_id;

  if found then
    if existing.status = 'pending' then raise exception 'request already sent'; end if;
    if existing.status = 'declined' then
      update public.friendships
         set status = 'pending', updated_at = now()
       where id = existing.id;
      return;
    end if;
  end if;

  select * into existing
    from public.friendships
   where requester_id = p_user_id and addressee_id = uid;

  if found then
    if existing.status = 'pending' then
      update public.friendships
         set status = 'accepted', updated_at = now()
       where id = existing.id;
      return;
    end if;
    if existing.status = 'accepted' then raise exception 'already friends'; end if;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (uid, p_user_id, 'pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- accept / decline / remove / block
-- ---------------------------------------------------------------------------
create or replace function public.accept_friend_request(p_requester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  update public.friendships
     set status = 'accepted', updated_at = now()
   where requester_id = p_requester_id
     and addressee_id = uid
     and status = 'pending';

  if not found then raise exception 'request not found'; end if;
end;
$$;

create or replace function public.decline_friend_request(p_requester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  update public.friendships
     set status = 'declined', updated_at = now()
   where requester_id = p_requester_id
     and addressee_id = uid
     and status = 'pending';

  if not found then raise exception 'request not found'; end if;
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  delete from public.friendships
   where status = 'accepted'
     and (
       (requester_id = uid and addressee_id = p_user_id)
       or (requester_id = p_user_id and addressee_id = uid)
     );

  if not found then raise exception 'friendship not found'; end if;
end;
$$;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  if p_user_id is null or p_user_id = uid then raise exception 'invalid user'; end if;

  delete from public.friendships
   where (requester_id = uid and addressee_id = p_user_id)
      or (requester_id = p_user_id and addressee_id = uid);

  insert into public.friendships (requester_id, addressee_id, status)
  values (uid, p_user_id, 'blocked');
end;
$$;

-- ---------------------------------------------------------------------------
-- list friends / requests / counts
-- ---------------------------------------------------------------------------
create or replace function public.list_friends()
returns table (user_id uuid, username text, friends_since timestamptz)
language sql
security definer
set search_path = public
as $$
  select
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    p.username,
    f.updated_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and auth.uid() in (f.requester_id, f.addressee_id)
  order by p.username;
$$;

create or replace function public.list_friend_requests()
returns table (requester_id uuid, username text, requested_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select f.requester_id, p.username, f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.addressee_id = auth.uid()
    and f.status = 'pending'
  order by f.created_at desc;
$$;

create or replace function public.count_pending_friend_requests()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.friendships
  where addressee_id = auth.uid() and status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- async match invites
-- ---------------------------------------------------------------------------
create or replace function public.invite_friend_to_async_match(
  p_match_id uuid,
  p_friend_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.async_matches%rowtype;
  invite_id uuid;
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  if not public.users_are_friends(uid, p_friend_id) then raise exception 'not friends'; end if;

  select * into m from public.async_matches where id = p_match_id;
  if not found then raise exception 'match not found'; end if;
  if m.player1_id <> uid then raise exception 'only the creator can invite'; end if;
  if m.status not in ('waiting', 'active') then raise exception 'match not invitable'; end if;

  select id into invite_id
    from public.async_match_invites
   where match_id = p_match_id and to_user_id = p_friend_id and status = 'pending';

  if invite_id is not null then
    update public.async_match_invites set created_at = now() where id = invite_id;
    return invite_id;
  end if;

  insert into public.async_match_invites (match_id, from_user_id, to_user_id, status)
  values (p_match_id, uid, p_friend_id, 'pending')
  returning id into invite_id;

  return invite_id;
end;
$$;

create or replace function public.list_my_async_invites()
returns table (
  invite_id uuid,
  match_id uuid,
  game_id text,
  join_code text,
  from_user_id uuid,
  from_username text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.match_id,
    m.game_id,
    m.join_code,
    i.from_user_id,
    p.username,
    i.created_at
  from public.async_match_invites i
  join public.async_matches m on m.id = i.match_id
  join public.profiles p on p.id = i.from_user_id
  where i.to_user_id = auth.uid()
    and i.status = 'pending'
    and m.status in ('waiting', 'active')
  order by i.created_at desc;
$$;

create or replace function public.dismiss_async_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  update public.async_match_invites
     set status = 'dismissed'
   where id = p_invite_id
     and to_user_id = uid
     and status = 'pending';

  if not found then raise exception 'invite not found'; end if;
end;
$$;

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
    update public.async_matches
       set player2_id = uid,
           status = 'active',
           join_code = null,
           whose_turn = case
             when exists (select 1 from public.async_moves where match_id = m.id)
             then uid
             else player1_id
           end,
           updated_at = now(),
           last_move_at = now()
     where id = m.id;
  end if;

  return m.id;
end;
$$;

create or replace function public.count_pending_async_invites()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.async_match_invites i
  join public.async_matches m on m.id = i.match_id
  where i.to_user_id = auth.uid()
    and i.status = 'pending'
    and m.status in ('waiting', 'active');
$$;

-- ---------------------------------------------------------------------------
-- get_friend_h2h
-- ---------------------------------------------------------------------------
create or replace function public.get_friend_h2h(
  p_friend_id uuid,
  p_game_id text default null
)
returns table (
  game_id text,
  my_wins integer,
  my_losses integer,
  my_draws integer,
  total_games integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'must be authenticated'; end if;
  if not public.users_are_friends(uid, p_friend_id) then raise exception 'not friends'; end if;

  return query
  with session_stats as (
    select
      gs.game_id,
      sum(case when gs.result = 'win' then 1 else 0 end)::integer as wins,
      sum(case when gs.result = 'loss' then 1 else 0 end)::integer as losses,
      sum(case when gs.result = 'draw' then 1 else 0 end)::integer as draws,
      count(*)::integer as total
    from public.game_sessions gs
    where gs.user_id = uid
      and gs.opponent_user_id = p_friend_id
      and (p_game_id is null or gs.game_id = p_game_id)
    group by gs.game_id
  ),
  async_stats as (
    select
      m.game_id,
      sum(case when m.winner_id = uid then 1 else 0 end)::integer as wins,
      sum(case when m.winner_id = p_friend_id then 1 else 0 end)::integer as losses,
      sum(case when m.winner_id is null and m.status = 'finished' then 1 else 0 end)::integer as draws,
      count(*)::integer as total
    from public.async_matches m
    where m.status = 'finished'
      and uid in (m.player1_id, coalesce(m.player2_id, m.player1_id))
      and p_friend_id in (m.player1_id, coalesce(m.player2_id, m.player1_id))
      and m.player1_id <> coalesce(m.player2_id, m.player1_id)
      and (p_game_id is null or m.game_id = p_game_id)
    group by m.game_id
  ),
  combined as (
    select
      coalesce(s.game_id, a.game_id) as gid,
      coalesce(s.wins, 0) + coalesce(a.wins, 0) as w,
      coalesce(s.losses, 0) + coalesce(a.losses, 0) as l,
      coalesce(s.draws, 0) + coalesce(a.draws, 0) as d,
      coalesce(s.total, 0) + coalesce(a.total, 0) as t
    from session_stats s
    full outer join async_stats a on a.game_id = s.game_id
  )
  select gid, w, l, d, t
  from combined
  where t > 0
  order by gid;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_game_session (add opponent_user_id)
-- ---------------------------------------------------------------------------
drop function if exists public.record_game_session(
  text, text, text, text, integer, integer, integer, integer, timestamptz, jsonb
);

create function public.record_game_session(
  p_game_id           text,
  p_mode              text,
  p_opponent          text,
  p_result            text default null,
  p_score             integer default null,
  p_turns             integer default null,
  p_avg_turn_sec      integer default null,
  p_duration_min      integer default 0,
  p_started_at        timestamptz default now(),
  p_computer_options  jsonb default null,
  p_opponent_user_id  uuid default null
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
  opp text := p_opponent;
begin
  if uid is null then raise exception 'must be authenticated'; end if;

  if p_opponent_user_id is not null then
    opp := 'user';
  end if;

  insert into public.game_sessions (
    user_id, game_id, mode, opponent, result, score, turns,
    avg_turn_sec, duration_min, started_at, computer_options, opponent_user_id
  ) values (
    uid, p_game_id, p_mode, opp, p_result, p_score, p_turns,
    p_avg_turn_sec, mins, p_started_at, p_computer_options, p_opponent_user_id
  );

  if opp = 'user' then
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.search_users_by_username(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.list_friends() to authenticated;
grant execute on function public.list_friend_requests() to authenticated;
grant execute on function public.count_pending_friend_requests() to authenticated;
grant execute on function public.invite_friend_to_async_match(uuid, uuid) to authenticated;
grant execute on function public.list_my_async_invites() to authenticated;
grant execute on function public.dismiss_async_invite(uuid) to authenticated;
grant execute on function public.accept_async_invite(uuid) to authenticated;
grant execute on function public.count_pending_async_invites() to authenticated;
grant execute on function public.get_friend_h2h(uuid, text) to authenticated;
grant execute on function public.record_game_session(
  text, text, text, text, integer, integer, integer, integer, timestamptz, jsonb, uuid
) to authenticated;
