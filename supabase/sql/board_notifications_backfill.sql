-- Backfill Activity Channel from Board history that existed before
-- board_notifications. Safe to run more than once.
--
-- Run this in Supabase Dashboard -> SQL Editor after
-- supabase/sql/board_notifications.sql.
--
-- It copies:
--   * private comment / recipient board_activity rows
--   * drop comments on Drops the recipient owns
--   * direct messages sent to the recipient
--
-- Original timestamps are preserved. Items older than 48 hours are marked
-- read so the unread badge is not flooded with weeks of history.

create unique index if not exists board_notifications_legacy_key_idx
  on public.board_notifications ((metadata->>'legacyKey'))
  where metadata ? 'legacyKey';

create or replace function public.backfill_board_notifications(p_recipient_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_inserted integer := 0;
begin
  begin
  insert into public.board_notifications (
    recipient_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    drop_id,
    comment_id,
    message,
    preview,
    href,
    image_url,
    metadata,
    priority,
    action_required,
    group_key,
    created_at,
    read_at,
    seen_at
  )
  select
    recipient.id,
    actor.id,
    case coalesce(a.meta->>'activityType', '')
      when 'drop_comment_received' then 'comment'
      when 'comment_received' then 'comment'
      when 'comment_reply' then 'comment_reply'
      when 'mention' then 'mention'
      when 'direct_message' then 'dm'
      when 'message' then 'dm'
      when 'wave' then 'wave'
      when 'friend_request' then 'friendzone_request'
      when 'friendzone_request' then 'friendzone_request'
      else 'comment'
    end,
    coalesce(nullif(a.meta->>'entityType', ''), 'drop'),
    nullif(coalesce(a.meta->>'commentDropId', a.meta->>'referencedDropId', a.meta->>'dropId', ''), ''),
    nullif(coalesce(a.meta->>'referencedDropId', a.meta->>'commentDropId', a.meta->>'dropId', ''), ''),
    case
      when coalesce(a.meta->>'commentId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (a.meta->>'commentId')::uuid
      else null
    end,
    nullif(coalesce(a.title, ''), ''),
    nullif(left(trim(coalesce(a.body, '')), 280), ''),
    a.href,
    a.image_url,
    coalesce(a.meta, '{}'::jsonb) || jsonb_build_object(
      'legacyKey', 'activity:' || a.id::text,
      'legacySource', 'board_activity',
      'actorName', coalesce(a.meta->>'authorName', a.meta->>'actorName'),
      'actorUsername', coalesce(a.meta->>'authorUsername', a.meta->>'actorUsername'),
      'actorAvatar', coalesce(a.meta->>'authorAvatar', a.meta->>'actorAvatar'),
      'dropTitle', coalesce(a.meta->>'dropTitle', a.title)
    ),
    case
      when coalesce(a.meta->>'activityType', '') in ('direct_message', 'message', 'friendzone_request', 'friend_request')
        then 'high'::public.board_notification_priority
      else 'medium'::public.board_notification_priority
    end,
    false,
    null,
    a.created_at,
    case when a.created_at < timezone('utc', now()) - interval '48 hours' then a.created_at else null end,
    case when a.created_at < timezone('utc', now()) - interval '48 hours' then a.created_at else null end
  from public.board_activity a
  join public.profiles recipient
    on recipient.id::text = a.meta->>'recipientUserId'
  left join public.profiles actor
    on actor.id = a.user_id
  where a.meta ? 'recipientUserId'
    and coalesce(a.meta->>'presence', 'false') not in ('true', 't', '1')
    and coalesce(a.meta->>'source', '') <> 'board_presence'
    and (p_recipient_id is null or recipient.id = p_recipient_id)
    and recipient.id is distinct from a.user_id
    and not exists (
      select 1
      from public.board_notifications existing
      where existing.metadata->>'legacyKey' = 'activity:' || a.id::text
    );

  get diagnostics v_inserted = row_count;
  v_count := v_count + v_inserted;
  exception
    when undefined_table then
      v_inserted := 0;
  end;

  begin
  insert into public.board_notifications (
    recipient_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    conversation_id,
    message,
    preview,
    metadata,
    priority,
    action_required,
    created_at,
    read_at,
    seen_at
  )
  select
    m.recipient_id,
    actor.id,
    'dm',
    'conversation',
    m.sender_id::text,
    'friend:' || m.sender_id::text,
    coalesce(nullif(actor.display_name, ''), 'Someone') || ' sent you a message.',
    nullif(left(trim(m.body), 280), ''),
    jsonb_build_object(
      'legacyKey', 'dm:' || m.id::text,
      'legacySource', 'board_direct_messages',
      'actorName', coalesce(nullif(actor.display_name, ''), actor.board_style->>'displayName', 'Someone'),
      'actorUsername', coalesce(actor.username, ''),
      'actorAvatar', coalesce(actor.avatar_url, actor.board_style->>'avatarUrl', '')
    ),
    'high'::public.board_notification_priority,
    false,
    m.created_at,
    coalesce(
      m.read_at,
      case when m.created_at < timezone('utc', now()) - interval '48 hours' then m.created_at else null end
    ),
    coalesce(
      m.read_at,
      case when m.created_at < timezone('utc', now()) - interval '48 hours' then m.created_at else null end
    )
  from public.board_direct_messages m
  left join public.profiles actor on actor.id = m.sender_id
  where (p_recipient_id is null or m.recipient_id = p_recipient_id)
    and exists (select 1 from public.profiles r where r.id = m.recipient_id)
    and not exists (
      select 1
      from public.board_notifications existing
      where existing.metadata->>'legacyKey' = 'dm:' || m.id::text
         or existing.entity_id = m.id::text
    );

  get diagnostics v_inserted = row_count;
  v_count := v_count + v_inserted;
  exception
    when undefined_table then
      v_inserted := 0;
    when undefined_column then
      v_inserted := 0;
  end;

  begin
  insert into public.board_notifications (
    recipient_id,
    actor_id,
    activity_type,
    entity_type,
    entity_id,
    drop_id,
    comment_id,
    message,
    preview,
    href,
    image_url,
    metadata,
    priority,
    action_required,
    created_at,
    read_at,
    seen_at
  )
  select
    owner.user_id,
    commenter.id,
    'comment',
    'drop',
    c.drop_id,
    coalesce(owner.meta->>'dropId', c.drop_id),
    c.id,
    coalesce(nullif(c.display_name, ''), '@' || coalesce(c.username, 'board')) || ' commented on ' || coalesce(owner.title, 'Drop') || '.',
    nullif(left(trim(c.body), 280), ''),
    owner.href,
    owner.image_url,
    jsonb_build_object(
      'legacyKey', 'drop_comment:' || c.id::text,
      'legacySource', 'board_drop_comments',
      'actorName', coalesce(nullif(c.display_name, ''), c.username, 'Someone'),
      'actorUsername', coalesce(c.username, ''),
      'actorAvatar', coalesce(c.avatar_url, ''),
      'dropTitle', coalesce(owner.title, 'Drop'),
      'commentId', c.id::text,
      'commentDropId', c.drop_id
    ),
    'medium'::public.board_notification_priority,
    false,
    c.created_at,
    case when c.created_at < timezone('utc', now()) - interval '48 hours' then c.created_at else null end,
    case when c.created_at < timezone('utc', now()) - interval '48 hours' then c.created_at else null end
  from public.board_drop_comments c
  join lateral (
    select
      a.user_id,
      a.title,
      a.href,
      a.image_url,
      a.meta
    from public.board_activity a
    where a.user_id is not null
      and (
        a.meta->>'dropId' = c.drop_id
        or a.id::text = c.drop_id
      )
      and coalesce(a.meta->>'presence', 'false') not in ('true', 't', '1')
    order by a.created_at desc
    limit 1
  ) owner on true
  left join public.profiles commenter on commenter.id = c.user_id
  where c.deleted_at is null
    and owner.user_id is distinct from c.user_id
    and (p_recipient_id is null or owner.user_id = p_recipient_id)
    and exists (select 1 from public.profiles r where r.id = owner.user_id)
    and not exists (
      select 1
      from public.board_notifications existing
      where existing.metadata->>'legacyKey' = 'drop_comment:' || c.id::text
         or existing.comment_id = c.id
    );

  get diagnostics v_inserted = row_count;
  v_count := v_count + v_inserted;
  exception
    when undefined_table then
      v_inserted := 0;
    when undefined_column then
      v_inserted := 0;
  end;

  return v_count;
end;
$$;

create or replace function public.backfill_my_board_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  return public.backfill_board_notifications(auth.uid());
end;
$$;

revoke all on function public.backfill_board_notifications(uuid) from public;
revoke all on function public.backfill_my_board_notifications() from public;
grant execute on function public.backfill_my_board_notifications() to authenticated;

-- When run in the SQL editor as the project owner, fill every inbox.
select public.backfill_board_notifications(null) as notifications_backfilled;

notify pgrst, 'reload schema';
