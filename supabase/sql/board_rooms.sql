-- Forums 2.0 / Board Rooms
-- Paste into Supabase Dashboard -> SQL Editor for the Board project.
-- Safe to re-run. Does not weaken existing RLS on other Board tables.
--
-- Architecture:
--   Forums -> Rooms -> Conversations / Drops / Presence / Calls / Live Sessions
-- Call / Live are schema + permission surfaces only. No livestream vendor.
-- Presence enter/leave must NEVER write board_activity or board_notifications.
--
-- After applying:
--   1. Confirm tables exist under public.
--   2. Optional: insert your user id into public.jab_admins to host Official rooms.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'board_room_kind') then
    create type public.board_room_kind as enum ('board', 'official', 'reserved');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_room_state') then
    create type public.board_room_state as enum ('ROOM', 'LIVE', 'STAGE');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_room_role') then
    create type public.board_room_role as enum ('owner', 'host', 'moderator', 'member', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_room_membership_status') then
    create type public.board_room_membership_status as enum ('joined', 'following', 'invited', 'left');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_room_session_kind') then
    create type public.board_room_session_kind as enum ('call', 'live');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_room_session_status') then
    create type public.board_room_session_status as enum ('idle', 'starting', 'live', 'ended');
  end if;
  if not exists (select 1 from pg_type where typname = 'board_room_participant_role') then
    create type public.board_room_participant_role as enum ('speaker', 'viewer', 'caller');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- JAB admins (permission structure only — no admin UI in this iteration)
-- ---------------------------------------------------------------------------

create table if not exists public.jab_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.jab_admins enable row level security;

drop policy if exists "jab admins are readable by authenticated" on public.jab_admins;
create policy "jab admins are readable by authenticated"
  on public.jab_admins for select
  to authenticated
  using (true);

grant select on public.jab_admins to authenticated;

create or replace function public.is_jab_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    uid is not null and exists (
      select 1 from public.jab_admins a where a.user_id = uid
    ),
    false
  );
$$;

revoke all on function public.is_jab_admin(uuid) from public;
grant execute on function public.is_jab_admin(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  id text primary key,
  slug text not null unique,
  name text not null,
  icon text,
  description text,
  chips text[] not null default '{}',
  kind public.board_room_kind not null default 'board',
  is_official boolean not null default false,
  coming_soon boolean not null default false,
  color text,
  accent text,
  imagery_url text,
  cover_path text,
  state public.board_room_state not null default 'ROOM',
  member_count integer not null default 0,
  last_activity_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint rooms_id_slug_match check (id = slug),
  constraint rooms_official_kind check (
    (is_official = true and kind in ('official', 'reserved'))
    or (is_official = false and kind = 'board')
  )
);

create index if not exists rooms_kind_activity_idx
  on public.rooms (kind, last_activity_at desc nulls last);

create index if not exists rooms_official_idx
  on public.rooms (is_official, coming_soon);

alter table public.rooms enable row level security;

drop policy if exists "rooms are publicly readable" on public.rooms;
create policy "rooms are publicly readable"
  on public.rooms for select
  to anon, authenticated
  using (true);

drop policy if exists "jab admins can insert rooms" on public.rooms;
create policy "jab admins can insert rooms"
  on public.rooms for insert
  to authenticated
  with check (public.is_jab_admin(auth.uid()));

drop policy if exists "jab admins can update rooms" on public.rooms;
create policy "jab admins can update rooms"
  on public.rooms for update
  to authenticated
  using (public.is_jab_admin(auth.uid()))
  with check (public.is_jab_admin(auth.uid()));

grant select on public.rooms to anon, authenticated;
grant insert, update on public.rooms to authenticated;

-- ---------------------------------------------------------------------------
-- room_members
-- ---------------------------------------------------------------------------

create table if not exists public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.board_room_role not null default 'member',
  status public.board_room_membership_status not null default 'joined',
  following boolean not null default false,
  joined_at timestamptz not null default timezone('utc', now()),
  last_entered_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx
  on public.room_members (user_id, status);

create index if not exists room_members_room_role_idx
  on public.room_members (room_id, role);

alter table public.room_members enable row level security;

drop policy if exists "room members are readable" on public.room_members;
create policy "room members are readable"
  on public.room_members for select
  to anon, authenticated
  using (true);

drop policy if exists "users can join rooms as themselves" on public.room_members;
create policy "users can join rooms as themselves"
  on public.room_members for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and role in ('member', 'viewer')
  );

drop policy if exists "users can update own room membership" on public.room_members;
create policy "users can update own room membership"
  on public.room_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and role in ('owner', 'host', 'moderator', 'member', 'viewer')
  );

drop policy if exists "hosts and mods can manage room members" on public.room_members;
create policy "hosts and mods can manage room members"
  on public.room_members for update
  to authenticated
  using (
    public.is_jab_admin(auth.uid())
    or exists (
      select 1 from public.room_members m
      where m.room_id = room_members.room_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'host', 'moderator')
        and m.status = 'joined'
    )
  )
  with check (
    public.is_jab_admin(auth.uid())
    or exists (
      select 1 from public.room_members m
      where m.room_id = room_members.room_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'host', 'moderator')
        and m.status = 'joined'
    )
  );

grant select on public.room_members to anon, authenticated;
grant insert, update on public.room_members to authenticated;

create or replace function public.room_role_for(p_room_id text, uid uuid default auth.uid())
returns public.board_room_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_jab_admin(uid) then 'owner'::public.board_room_role
    else coalesce(
      (
        select m.role
        from public.room_members m
        where m.room_id = p_room_id
          and m.user_id = uid
          and m.status = 'joined'
      ),
      'viewer'::public.board_room_role
    )
  end;
$$;

revoke all on function public.room_role_for(text, uuid) from public;
grant execute on function public.room_role_for(text, uuid) to anon, authenticated;

create or replace function public.can_moderate_room(p_room_id text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.room_role_for(p_room_id, uid) in ('owner', 'host', 'moderator');
$$;

revoke all on function public.can_moderate_room(text, uuid) from public;
grant execute on function public.can_moderate_room(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- room_posts  (text conversations + announcements inside a Room)
-- ---------------------------------------------------------------------------

create table if not exists public.room_posts (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.room_posts(id) on delete cascade,
  kind text not null default 'conversation'
    check (kind in ('conversation', 'text_post', 'reply', 'announcement')),
  title text,
  body text not null,
  pinned boolean not null default false,
  official boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint room_posts_body_not_blank check (char_length(trim(body)) between 1 and 8000)
);

create index if not exists room_posts_room_created_idx
  on public.room_posts (room_id, created_at desc);

create index if not exists room_posts_parent_idx
  on public.room_posts (parent_id, created_at);

create index if not exists room_posts_author_idx
  on public.room_posts (author_id, created_at desc);

alter table public.room_posts enable row level security;

drop policy if exists "room posts are readable" on public.room_posts;
create policy "room posts are readable"
  on public.room_posts for select
  to anon, authenticated
  using (true);

drop policy if exists "users can create own room posts" on public.room_posts;
create policy "users can create own room posts"
  on public.room_posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      kind <> 'announcement'
      or public.can_moderate_room(room_id, auth.uid())
    )
  );

drop policy if exists "users can update own room posts" on public.room_posts;
create policy "users can update own room posts"
  on public.room_posts for update
  to authenticated
  using (auth.uid() = author_id or public.can_moderate_room(room_id, auth.uid()))
  with check (auth.uid() = author_id or public.can_moderate_room(room_id, auth.uid()));

drop policy if exists "users can delete own room posts" on public.room_posts;
create policy "users can delete own room posts"
  on public.room_posts for delete
  to authenticated
  using (auth.uid() = author_id or public.can_moderate_room(room_id, auth.uid()));

grant select on public.room_posts to anon, authenticated;
grant insert, update, delete on public.room_posts to authenticated;

-- ---------------------------------------------------------------------------
-- room_drop_shares
-- ---------------------------------------------------------------------------

create table if not exists public.room_drop_shares (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  drop_id text not null,
  shared_by uuid not null references public.profiles(id) on delete cascade,
  activity_id text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint room_drop_shares_drop_not_blank check (char_length(trim(drop_id)) > 0)
);

create unique index if not exists room_drop_shares_unique_idx
  on public.room_drop_shares (room_id, drop_id, shared_by);

create index if not exists room_drop_shares_room_created_idx
  on public.room_drop_shares (room_id, created_at desc);

create index if not exists room_drop_shares_drop_idx
  on public.room_drop_shares (drop_id);

alter table public.room_drop_shares enable row level security;

drop policy if exists "room drop shares are readable" on public.room_drop_shares;
create policy "room drop shares are readable"
  on public.room_drop_shares for select
  to anon, authenticated
  using (true);

drop policy if exists "users can share own drops into rooms" on public.room_drop_shares;
create policy "users can share own drops into rooms"
  on public.room_drop_shares for insert
  to authenticated
  with check (auth.uid() = shared_by);

drop policy if exists "users can remove own room drop shares" on public.room_drop_shares;
create policy "users can remove own room drop shares"
  on public.room_drop_shares for delete
  to authenticated
  using (auth.uid() = shared_by or public.can_moderate_room(room_id, auth.uid()));

grant select on public.room_drop_shares to anon, authenticated;
grant insert, delete on public.room_drop_shares to authenticated;

-- ---------------------------------------------------------------------------
-- room_presence  (ephemeral — never fan out to Activity Channel)
-- ---------------------------------------------------------------------------

create table if not exists public.room_presence (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, user_id)
);

create index if not exists room_presence_seen_idx
  on public.room_presence (room_id, last_seen_at desc);

alter table public.room_presence enable row level security;

drop policy if exists "room presence is readable" on public.room_presence;
create policy "room presence is readable"
  on public.room_presence for select
  to anon, authenticated
  using (true);

drop policy if exists "users can write own room presence" on public.room_presence;
create policy "users can write own room presence"
  on public.room_presence for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can update own room presence" on public.room_presence;
create policy "users can update own room presence"
  on public.room_presence for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can leave room presence" on public.room_presence;
create policy "users can leave room presence"
  on public.room_presence for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.room_presence to anon, authenticated;
grant insert, update, delete on public.room_presence to authenticated;

-- ---------------------------------------------------------------------------
-- room_sessions / room_session_participants
-- Call + Live placeholders. Provider stays generic (none/livekit/daily/agora/webrtc).
-- ---------------------------------------------------------------------------

create table if not exists public.room_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  kind public.board_room_session_kind not null,
  status public.board_room_session_status not null default 'idle',
  mode public.board_room_state not null default 'ROOM',
  provider text not null default 'none'
    check (provider in ('none', 'livekit', 'daily', 'agora', 'webrtc')),
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists room_sessions_room_status_idx
  on public.room_sessions (room_id, status, created_at desc);

alter table public.room_sessions enable row level security;

drop policy if exists "room sessions are readable" on public.room_sessions;
create policy "room sessions are readable"
  on public.room_sessions for select
  to anon, authenticated
  using (true);

drop policy if exists "hosts can start room sessions" on public.room_sessions;
create policy "hosts can start room sessions"
  on public.room_sessions for insert
  to authenticated
  with check (
    auth.uid() = started_by
    and (
      public.room_role_for(room_id, auth.uid()) in ('owner', 'host', 'moderator', 'member')
    )
  );

drop policy if exists "hosts can update room sessions" on public.room_sessions;
create policy "hosts can update room sessions"
  on public.room_sessions for update
  to authenticated
  using (
    auth.uid() = started_by
    or public.can_moderate_room(room_id, auth.uid())
  )
  with check (
    auth.uid() = started_by
    or public.can_moderate_room(room_id, auth.uid())
  );

grant select on public.room_sessions to anon, authenticated;
grant insert, update on public.room_sessions to authenticated;

create table if not exists public.room_session_participants (
  session_id uuid not null references public.room_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id text not null references public.rooms(id) on delete cascade,
  role public.board_room_participant_role not null default 'viewer',
  joined_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  primary key (session_id, user_id)
);

create index if not exists room_session_participants_room_idx
  on public.room_session_participants (room_id, joined_at desc);

alter table public.room_session_participants enable row level security;

drop policy if exists "room session participants are readable" on public.room_session_participants;
create policy "room session participants are readable"
  on public.room_session_participants for select
  to anon, authenticated
  using (true);

drop policy if exists "users can join room sessions as themselves" on public.room_session_participants;
create policy "users can join room sessions as themselves"
  on public.room_session_participants for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can update own session participation" on public.room_session_participants;
create policy "users can update own session participation"
  on public.room_session_participants for update
  to authenticated
  using (auth.uid() = user_id or public.can_moderate_room(room_id, auth.uid()))
  with check (auth.uid() = user_id or public.can_moderate_room(room_id, auth.uid()));

grant select on public.room_session_participants to anon, authenticated;
grant insert, update on public.room_session_participants to authenticated;

-- ---------------------------------------------------------------------------
-- room_pins
-- ---------------------------------------------------------------------------

create table if not exists public.room_pins (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null,
  entity_type text not null check (entity_type in ('post', 'drop', 'announcement', 'conversation')),
  entity_id text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists room_pins_unique_idx
  on public.room_pins (room_id, entity_type, entity_id);

create index if not exists room_pins_room_sort_idx
  on public.room_pins (room_id, sort_order, created_at desc);

alter table public.room_pins enable row level security;

drop policy if exists "room pins are readable" on public.room_pins;
create policy "room pins are readable"
  on public.room_pins for select
  to anon, authenticated
  using (true);

drop policy if exists "mods can pin room content" on public.room_pins;
create policy "mods can pin room content"
  on public.room_pins for insert
  to authenticated
  with check (public.can_moderate_room(room_id, auth.uid()));

drop policy if exists "mods can update room pins" on public.room_pins;
create policy "mods can update room pins"
  on public.room_pins for update
  to authenticated
  using (public.can_moderate_room(room_id, auth.uid()))
  with check (public.can_moderate_room(room_id, auth.uid()));

drop policy if exists "mods can delete room pins" on public.room_pins;
create policy "mods can delete room pins"
  on public.room_pins for delete
  to authenticated
  using (public.can_moderate_room(room_id, auth.uid()));

grant select on public.room_pins to anon, authenticated;
grant insert, update, delete on public.room_pins to authenticated;

-- ---------------------------------------------------------------------------
-- room_notifications  (in-room log — NOT Activity Channel)
-- Meaningful room events only. Presence enter/leave is forbidden here too.
-- ---------------------------------------------------------------------------

create table if not exists public.room_notifications (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null
    check (event_type in (
      'joined',
      'followed',
      'drop_shared',
      'replied',
      'mentioned',
      'call_started',
      'live_started',
      'followed_active',
      'announcement'
    )),
  entity_type text,
  entity_id text,
  drop_id text,
  message text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint room_notifications_not_presence check (
    event_type not in ('entered', 'left', 'presence', 'heartbeat')
  )
);

create index if not exists room_notifications_room_created_idx
  on public.room_notifications (room_id, created_at desc);

alter table public.room_notifications enable row level security;

drop policy if exists "room notifications are readable" on public.room_notifications;
create policy "room notifications are readable"
  on public.room_notifications for select
  to anon, authenticated
  using (true);

drop policy if exists "users can write own room notifications" on public.room_notifications;
create policy "users can write own room notifications"
  on public.room_notifications for insert
  to authenticated
  with check (auth.uid() = actor_id);

grant select on public.room_notifications to anon, authenticated;
grant insert on public.room_notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: presence + in-room log. Never publish presence into board_activity.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.room_presence';
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.room_sessions';
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.room_notifications';
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Seed catalog (idempotent). Official JAB rooms + existing Board rooms.
-- ---------------------------------------------------------------------------

insert into public.rooms (
  id, slug, name, icon, description, chips, kind, is_official, coming_soon, color, accent
) values
  (
    'jab-lit', 'jab-lit', 'JAB LIT', '📚',
    'Writing, storytelling, poetry, screenplays, prose, worldbuilding, and Dropbooks.',
    array['Writing', 'Poetry', 'Screenwriting', 'Worldbuilding', 'Dropbooks'],
    'official', true, false, '#F5D76E', '#FFE9A3'
  ),
  (
    'jab-comics', 'jab-comics', 'JAB Comics', '💥',
    'Comics, concept art, illustrated storytelling, character design, pages, and visual development.',
    array['Comics', 'Characters', 'Concept Art', 'Panels', 'WIPs'],
    'official', true, false, '#FF6B6B', '#FFD166'
  ),
  (
    'music', 'music', 'Music', '🎧',
    'Songs, demos, instrumentals, vocals, beats, WIPs, audio Drops, and collabs. The social counterpart to Voice Studio.',
    array['Songs', 'Beats', 'Vocals', 'WIPs', 'Collabs'],
    'official', true, false, '#7C5CFF', '#C4B5FD'
  ),
  (
    'those-ryderz', 'those-ryderz', 'Those Ryderz', '🎬',
    'The JAB Visions project room for Those Ryderz — auditions, self-tapes, production, crew, and Drops. Invite collaborators, post updates, and keep the film moving.',
    array['Auditions', 'Production', 'Crew', 'Drops'],
    'official', true, false, '#5EEAD4', '#99F6E4'
  ),
  (
    'jab-visions', 'jab-visions', 'JAB Visions', '✦',
    'The official JAB Visions studio room — Board, studio, announcements, and official Drops.',
    array['Board', 'Studio', 'Announcements', 'Drops'],
    'official', true, false, '#F0ABFC', '#E9D5FF'
  ),
  (
    'lobby', 'lobby', 'Lobby', '🏁',
    'Start here. Intros, links, and first signals.',
    array['Intros', 'Links', 'Welcome'],
    'board', false, false, '#A78BFA', '#DDD6FE'
  ),
  (
    'announcements', 'announcements', 'Announcements', '📌',
    'Updates, releases, and notices from the Board community.',
    array['Updates', 'Releases'],
    'board', false, false, '#F472B6', '#FBCFE8'
  ),
  (
    'casting', 'casting', 'Casting Corner', '🎭',
    'Auditions, recasts, self-tapes, and submissions.',
    array['Auditions', 'Self-tapes'],
    'board', false, false, '#60A5FA', '#BFDBFE'
  ),
  (
    'crew', 'crew', 'Crew Calls', '🎬',
    'Gigs, collaborators, and production rates.',
    array['Gigs', 'Crew'],
    'board', false, false, '#34D399', '#A7F3D0'
  ),
  (
    'projects', 'projects', 'Projects', '🧩',
    'Build logs, collab threads, and project rooms adjacent to Work Board.',
    array['Build logs', 'Collabs'],
    'board', false, false, '#FBBF24', '#FDE68A'
  ),
  (
    'offtopic', 'offtopic', 'Off Topic', '🍿',
    'Memes, life, and random drops.',
    array['Lounge'],
    'board', false, false, '#FB7185', '#FECDD3'
  ),
  (
    'vfx-lab', 'vfx-lab', 'VFX Lab', '✨',
    'Auras, glows, roto, compositing tricks.',
    array['VFX', 'Glow'],
    'board', false, false, '#22D3EE', '#A5F3FC'
  ),
  (
    'editing-room', 'editing-room', 'Editing Room', '✂️',
    'Pacing, templates, and editorial craft.',
    array['Edit', 'Pacing'],
    'board', false, false, '#FB923C', '#FED7AA'
  ),
  (
    'gear-talk', 'gear-talk', 'Gear Talk', '📷',
    'Cameras, lenses, lighting, sound.',
    array['Cameras', 'Sound'],
    'board', false, false, '#94A3B8', '#CBD5E1'
  ),
  (
    'nyc-locations', 'nyc-locations', 'NYC Locations', '🗽',
    'Permits, parks, rooftops, hidden gems.',
    array['NYC', 'Locations'],
    'board', false, false, '#38BDF8', '#BAE6FD'
  ),
  (
    'modeling', 'modeling', 'Modeling & Photography', '📷',
    'Poses, edits, reels, confidence craft.',
    array['Photo', 'Reels'],
    'board', false, false, '#E879F9', '#F5D0FE'
  ),
  (
    'collabs', 'collabs', 'Collabs', '🤝',
    'Find creators to build with.',
    array['Collabs'],
    'board', false, false, '#4ADE80', '#BBF7D0'
  ),
  (
    'showcase', 'showcase', 'Showcase', '🌟',
    'Share wins, progress, glow-ups.',
    array['Wins'],
    'board', false, false, '#FACC15', '#FEF08A'
  ),
  (
    'board-bugs', 'board-bugs', 'Bugs & Fixes', '🪲',
    'Report issues. Track improvements.',
    array['Bugs'],
    'board', false, false, '#A3E635', '#D9F99D'
  ),
  (
    'feature-requests', 'feature-requests', 'Feature Requests', '💡',
    'Vote on what we build next.',
    array['Ideas'],
    'board', false, false, '#818CF8', '#C7D2FE'
  )
on conflict (id) do update set
  name = excluded.name,
  icon = excluded.icon,
  description = excluded.description,
  chips = excluded.chips,
  kind = excluded.kind,
  is_official = excluded.is_official,
  coming_soon = excluded.coming_soon,
  color = excluded.color,
  accent = excluded.accent,
  updated_at = timezone('utc', now());

notify pgrst, 'reload schema';
