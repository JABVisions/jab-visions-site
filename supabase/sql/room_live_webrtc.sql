-- Forums Go Live (Board-native WebRTC)
-- Paste into Supabase Dashboard -> SQL Editor if room_sessions already exists.
-- Safe to re-run. Does not change storage RLS.
--
-- Go Live uses:
--   1. public.room_sessions (provider = webrtc, metadata.signals mailbox)
--   2. Supabase Realtime broadcast on channel room-live:{roomId}
-- No LiveKit / Daily / Agora keys are required.
--
-- Optional env (Vercel):
--   NEXT_PUBLIC_LIVE_STUN_URL=stun:stun.l.google.com:19302
--
-- After applying:
--   1. Database -> Replication: enable Realtime for room_sessions if you want
--      postgres_changes. Broadcast signaling works without that table listing.
--   2. Confirm room_sessions.provider check includes 'webrtc' (board_rooms.sql).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_sessions'
      and column_name = 'provider'
  ) then
    begin
      alter table public.room_sessions
        drop constraint if exists room_sessions_provider_check;
      alter table public.room_sessions
        add constraint room_sessions_provider_check
        check (provider in ('none', 'livekit', 'daily', 'agora', 'webrtc'));
    exception
      when others then
        null;
    end;
  end if;
end
$$;
