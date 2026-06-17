-- In-progress solo / pass-and-play / computer game checkpoints for permanent accounts.

create table if not exists public.game_checkpoints (
  user_id          uuid not null references auth.users (id) on delete cascade,
  game_id          text not null,
  mode             text not null,
  state            jsonb not null default '{}',
  match_id         uuid references public.async_matches (id) on delete set null,
  opponent_user_id uuid references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (user_id, game_id, mode)
);

alter table public.game_checkpoints enable row level security;

drop policy if exists "game_checkpoints: own" on public.game_checkpoints;
create policy "game_checkpoints: own" on public.game_checkpoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.game_checkpoints to authenticated;

-- Anonymous users may not have email — ensure profile creation still works.
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
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'guest-' || substr(new.id::text, 1, 4)
  );

  insert into public.profiles (id, username)
  values (new.id, base_name)
  on conflict (id) do nothing;

  if exists (select 1 from public.profiles where username = base_name and id <> new.id) then
    update public.profiles
       set username = base_name || '-' || substr(new.id::text, 1, 4)
     where id = new.id;
  end if;

  return new;
end;
$$;
