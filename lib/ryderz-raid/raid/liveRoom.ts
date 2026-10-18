import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseBrowser } from '@/lib/supabase/browser';
import type { RaidSquad } from './squad';

/** Roster broadcast by the host. Guests render and enter from this, not from a private lambda. */
export interface RaidRoomCast {
  code: string;
  hostGuestId: string;
  lifecycle: 'LOBBY' | 'READY' | 'COUNTDOWN' | 'IN_PROGRESS';
  squad: RaidSquad;
}

export type RaidWireIntent =
  | { intent: 'join'; guestId: string; name?: string; ryderId?: string | null; ready?: boolean }
  | { intent: 'ready'; guestId: string; ready: boolean; name?: string }
  | { intent: 'character'; guestId: string; slot: number; ryderId: string; name?: string }
  | { intent: 'input'; guestId: string; x: number; z: number };

type Handlers = {
  onRoom?: (room: RaidRoomCast) => void;
  onIntent?: (intent: RaidWireIntent) => void;
};

type Entry = {
  channel: RealtimeChannel;
  ready: Promise<boolean>;
  handlers: Set<Handlers>;
};

const open = new Map<string, Entry>();

export function raidLiveEnabled() {
  return isSupabaseConfigured();
}

function entry(code: string): Entry | null {
  if (!isSupabaseConfigured()) return null;
  const key = code.toUpperCase();
  const existing = open.get(key);
  if (existing) return existing;
  const channel = supabaseBrowser().channel(`ryderz-raid:${key}`, {
    config: { broadcast: { ack: false, self: false } },
  });
  const handlers = new Set<Handlers>();
  let settle: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  const timer = setTimeout(() => settle(false), 4000);
  channel.on('broadcast', { event: 'room' }, ({ payload }) => {
    const room = payload as RaidRoomCast;
    if (!room?.squad || room.code?.toUpperCase() !== key) return;
    for (const handler of handlers) handler.onRoom?.(room);
  });
  channel.on('broadcast', { event: 'intent' }, ({ payload }) => {
    const intent = payload as RaidWireIntent;
    if (!intent?.guestId || !intent.intent) return;
    for (const handler of handlers) handler.onIntent?.(intent);
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      clearTimeout(timer);
      settle(true);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      clearTimeout(timer);
      settle(false);
    }
  });
  const created: Entry = { channel, ready, handlers };
  open.set(key, created);
  return created;
}

/** Share one channel per access code. The last listener closes it. */
export function subscribeRaidLive(code: string, handlers: Handlers): () => void {
  const slot = entry(code);
  if (!slot) return () => {};
  slot.handlers.add(handlers);
  const key = code.toUpperCase();
  return () => {
    slot.handlers.delete(handlers);
    if (slot.handlers.size > 0) return;
    if (open.get(key) !== slot) return;
    open.delete(key);
    void supabaseBrowser().removeChannel(slot.channel);
  };
}

export async function sendRaidRoom(room: RaidRoomCast) {
  const slot = entry(room.code);
  if (!slot) return;
  await slot.ready;
  await slot.channel.send({ type: 'broadcast', event: 'room', payload: room });
}

export async function sendRaidIntent(code: string, intent: RaidWireIntent) {
  const slot = entry(code);
  if (!slot) return;
  await slot.ready;
  await slot.channel.send({ type: 'broadcast', event: 'intent', payload: intent });
}
