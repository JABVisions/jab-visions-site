import { isSkinFor } from '../skins/catalog';
import { isPlayableRyder, type RaidSquad, type SquadSlot } from './squad';

/** A friend who joined with the access code. The host seats them before the raid starts. */
export interface LiveGuest {
  guestId: string;
  name: string;
  ryderId?: string | null;
  /** Their equipped skin for that Ryder. Appearance only. */
  skinId?: string | null;
  ready?: boolean;
}

export type LiveIntent =
  | { intent: 'join'; guestId: string; name?: string; ryderId?: string | null; skinId?: string | null; ready?: boolean }
  | { intent: 'ready'; guestId: string; ready: boolean; name?: string }
  | { intent: 'character'; guestId: string; slot: number; ryderId: string; skinId?: string | null; name?: string };

/**
 * Put each joined human into a computer or open seat.
 * Someone already seated keeps that seat, so a second poll cannot duplicate them.
 */
export function seatGuests(squad: RaidSquad, guests: LiveGuest[]): RaidSquad {
  const slots = squad.slots.map((slot) => ({ ...slot }));
  for (const guest of guests) {
    if (!guest.guestId) continue;
    const existing = slots.find((slot) => slot.playerId === guest.guestId);
    if (existing) {
      seatHuman(existing, guest, false);
      continue;
    }
    const open = slots.find((slot) => slot.control === 'computer' || slot.control === 'open');
    if (!open) continue;
    seatHuman(open, guest, true);
  }
  return { ...squad, slots };
}

/** Add friends the server copy never saw. People already seated keep the server ready state. */
export function seatMissing(squad: RaidSquad, guests: LiveGuest[]): RaidSquad {
  const present = new Set(squad.slots.map((slot) => slot.playerId).filter((id): id is string => Boolean(id)));
  return seatGuests(
    squad,
    guests.filter((guest) => !present.has(guest.guestId)),
  );
}

function seatHuman(slot: SquadSlot, guest: LiveGuest, fresh: boolean) {
  slot.control = 'human';
  slot.playerId = guest.guestId;
  slot.displayName = guest.name || slot.displayName || 'Raider';
  slot.connected = true;
  slot.aiCover = false;
  if (guest.ready != null) slot.ready = guest.ready;
  else if (fresh) slot.ready = false;
  if (guest.ryderId && isPlayableRyder(guest.ryderId)) slot.ryderId = guest.ryderId;
  slot.skinId = isSkinFor(slot.ryderId, guest.skinId) ? guest.skinId : null;
}

export function rememberGuest(guests: LiveGuest[], next: LiveGuest): LiveGuest[] {
  const previous = guests.find((guest) => guest.guestId === next.guestId);
  const rest = guests.filter((guest) => guest.guestId !== next.guestId);
  return [
    ...rest,
    {
      guestId: next.guestId,
      name: next.name || previous?.name || 'Raider',
      ryderId: next.ryderId ?? previous?.ryderId ?? null,
      skinId: next.skinId !== undefined ? next.skinId : previous?.skinId ?? null,
      ready: next.ready ?? previous?.ready ?? false,
    },
  ];
}

/** Host applies a guest's join, ready, or character intent onto the squad that will launch. */
export function applyGuestIntent(
  squad: RaidSquad,
  guests: LiveGuest[],
  intent: LiveIntent,
): { squad: RaidSquad; guests: LiveGuest[] } {
  if (!intent.guestId) return { squad, guests };
  if (intent.intent === 'character') {
    const ryderId = intent.ryderId;
    if (!isPlayableRyder(ryderId)) return { squad, guests };
    const owned = squad.slots.find((slot) => slot.index === intent.slot && slot.playerId === intent.guestId);
    if (!owned) return { squad, guests };
    const skinId = isSkinFor(ryderId, intent.skinId) ? intent.skinId : null;
    const slots = squad.slots.map((slot) => (slot === owned ? { ...slot, ryderId, skinId, ready: false } : slot));
    return {
      squad: { ...squad, slots },
      guests: rememberGuest(guests, { guestId: intent.guestId, name: intent.name || owned.displayName, ryderId, skinId, ready: false }),
    };
  }
  const nextGuests = rememberGuest(guests, {
    guestId: intent.guestId,
    name: intent.name || '',
    ryderId: intent.intent === 'join' ? intent.ryderId : undefined,
    skinId: intent.intent === 'join' ? intent.skinId : undefined,
    ready: intent.intent === 'ready' ? intent.ready : undefined,
  });
  return { squad: seatGuests(squad, nextGuests), guests: nextGuests };
}
