-- Board Activity Channel inbox.
-- Run once in Supabase Dashboard -> SQL Editor for the Board project.
-- This is the private notification stream for Drop Pad OS + Profile.
-- It is separate from public board_activity (the shared feed).

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'board_notification_priority'
  ) then
    create type public.board_notification_priority as enum ('high', 'medium', 'normal');
  end if;
end
$$;

create table if not exists public.board_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  activity_type text not null,
  entity_type text,
  entity_id text,
  drop_id text,
  comment_id uuid,
  conversation_id text,
  friendzone_request_id text,
  signal_id text,
  message text,
  preview text,
  href text,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  priority public.board_notification_priority not null default 'normal',
  action_required boolean not null default false,
  group_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  seen_at timestamptz,
  constraint board_notifications_type_not_blank check (char_length(trim(activity_type)) > 0)
);

create index if not exists board_notifications_recipient_created_idx
  on public.board_notifications (recipient_id, created_at desc);

create index if not exists board_notifications_recipient_unread_idx
  on public.board_notifications (recipient_id, created_at desc)
  where read_at is null;

create index if not exists board_notifications_recipient_type_idx
  on public.board_notifications (recipient_id, activity_type, created_at desc);

create index if not exists board_notifications_recipient_group_idx
  on public.board_notifications (recipient_id, group_key, created_at desc)
  where group_key is not null;

alter table public.board_notifications enable row level security;

drop policy if exists "recipients can read own board notifications" on public.board_notifications;
create policy "recipients can read own board notifications"
  on public.board_notifications
  for select
  to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists "recipients can update own board notifications" on public.board_notifications;
create policy "recipients can update own board notifications"
  on public.board_notifications
  for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

grant usage on schema public to authenticated;
grant select, update on public.board_notifications to authenticated;

create or replace function public.create_board_notification(
  p_recipient_id uuid,
  p_activity_type text,
  p_actor_id uuid default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_drop_id text default null,
  p_comment_id uuid default null,
  p_conversation_id text default null,
  p_friendzone_request_id text default null,
  p_signal_id text default null,
  p_message text default null,
  p_preview text default null,
  p_href text default null,
  p_image_url text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_priority text default 'normal',
  p_action_required boolean default false,
  p_group_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_priority public.board_notification_priority;
  v_id uuid;
begin
  if p_recipient_id is null then
    raise exception 'recipient is required';
  end if;

  if p_activity_type is null or char_length(trim(p_activity_type)) = 0 then
    raise exception 'activity type is required';
  end if;

  v_actor := coalesce(p_actor_id, auth.uid());

  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Actors can only mint notifications as themselves. System notices use a
  -- dedicated type prefix and still require the caller to be the actor.
  if v_actor is distinct from auth.uid() then
    raise exception 'cannot forge notifications for another actor';
  end if;

  if v_actor is not null
    and v_actor = p_recipient_id
    and p_activity_type not in ('friendzone_connected', 'system')
  then
    return null;
  end if;

  v_priority := case
    when p_priority in ('high', 'medium', 'normal') then p_priority::public.board_notification_priority
    else 'normal'::public.board_notification_priority
  end;

  insert into public.board_notifications (
    recipient_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    drop_id,
    comment_id,
    conversation_id,
    friendzone_request_id,
    signal_id,
    message,
    preview,
    href,
    image_url,
    metadata,
    priority,
    action_required,
    group_key
  )
  values (
    p_recipient_id,
    v_actor,
    trim(p_activity_type),
    nullif(trim(coalesce(p_entity_type, '')), ''),
    nullif(trim(coalesce(p_entity_id, '')), ''),
    nullif(trim(coalesce(p_drop_id, '')), ''),
    p_comment_id,
    nullif(trim(coalesce(p_conversation_id, '')), ''),
    nullif(trim(coalesce(p_friendzone_request_id, '')), ''),
    nullif(trim(coalesce(p_signal_id, '')), ''),
    nullif(trim(coalesce(p_message, '')), ''),
    nullif(left(trim(coalesce(p_preview, '')), 280), ''),
    nullif(trim(coalesce(p_href, '')), ''),
    nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    v_priority,
    coalesce(p_action_required, false),
    nullif(trim(coalesce(p_group_key, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_board_notification(
  uuid, text, uuid, text, text, text, uuid, text, text, text, text, text, text, text, jsonb, text, boolean, text
) from public;
grant execute on function public.create_board_notification(
  uuid, text, uuid, text, text, text, uuid, text, text, text, text, text, text, text, jsonb, text, boolean, text
) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.board_notifications';
    exception
      when duplicate_object then
        null;
      when undefined_object then
        null;
    end;
  end if;
end
$$;

notify pgrst, 'reload schema';
