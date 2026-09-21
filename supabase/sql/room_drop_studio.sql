-- Forum Room Drop Studio
-- Paste into Supabase Dashboard -> SQL Editor after board_rooms.sql.
-- Safe to re-run. Does not weaken board-media RLS or delete global Drops.
--
-- A Drop remains a Drop. A Room stores where that Drop was shared.
-- Conversation replies attach drop_id instead of duplicating media blobs.

-- ---------------------------------------------------------------------------
-- room_posts: attach an existing Drop to a conversation reply
-- ---------------------------------------------------------------------------

alter table public.room_posts
  add column if not exists drop_id text;

create index if not exists room_posts_drop_idx
  on public.room_posts (drop_id)
  where drop_id is not null;

-- Body may be a short pointer when a Drop is attached.
alter table public.room_posts drop constraint if exists room_posts_body_not_blank;
alter table public.room_posts
  add constraint room_posts_body_not_blank check (
    char_length(trim(body)) between 1 and 8000
    or (
      drop_id is not null
      and char_length(trim(drop_id)) > 0
    )
  );

-- ---------------------------------------------------------------------------
-- room_drop_shares: optional conversation pointer + create vs share origin
-- ---------------------------------------------------------------------------

alter table public.room_drop_shares
  add column if not exists conversation_id text;

alter table public.room_drop_shares
  add column if not exists origin text not null default 'share';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_drop_shares_origin_check'
  ) then
    alter table public.room_drop_shares
      add constraint room_drop_shares_origin_check
      check (origin in ('create', 'share', 'conversation'));
  end if;
end
$$;

create index if not exists room_drop_shares_conversation_idx
  on public.room_drop_shares (room_id, conversation_id, created_at desc)
  where conversation_id is not null;

-- Moderators may remove a share from the Room. This must NEVER delete board_drops.
-- Existing delete policy already allows owner or can_moderate_room.
-- Re-assert so a later paste cannot silently drop it.

drop policy if exists "users can remove own room drop shares" on public.room_drop_shares;
create policy "users can remove own room drop shares"
  on public.room_drop_shares for delete
  to authenticated
  using (auth.uid() = shared_by or public.can_moderate_room(room_id, auth.uid()));
