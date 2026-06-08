-- Board Direct Messages
-- Run this once in Supabase Dashboard -> SQL Editor for the Board project.

create extension if not exists pgcrypto;

create table if not exists public.board_direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint board_direct_messages_no_self_dm check (sender_id <> recipient_id)
);

create index if not exists board_direct_messages_sender_created_idx
  on public.board_direct_messages (sender_id, created_at desc);

create index if not exists board_direct_messages_recipient_created_idx
  on public.board_direct_messages (recipient_id, created_at desc);

create index if not exists board_direct_messages_pair_created_idx
  on public.board_direct_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at
  );

alter table public.board_direct_messages enable row level security;

drop policy if exists "dm participants can read messages" on public.board_direct_messages;
create policy "dm participants can read messages"
  on public.board_direct_messages
  for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "users can send their own dms" on public.board_direct_messages;
create policy "users can send their own dms"
  on public.board_direct_messages
  for insert
  to authenticated
  with check (auth.uid() = sender_id and auth.uid() <> recipient_id);

drop policy if exists "sender can delete own dms" on public.board_direct_messages;
create policy "sender can delete own dms"
  on public.board_direct_messages
  for delete
  to authenticated
  using (auth.uid() = sender_id);

grant usage on schema public to authenticated;
grant select, insert, delete on public.board_direct_messages to authenticated;

notify pgrst, 'reload schema';
