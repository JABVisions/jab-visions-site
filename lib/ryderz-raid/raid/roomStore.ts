import { RYDERZ, BOUNDARY, type RyderId } from '../config';
import {
  SQUAD_SIZE,
  computerSlot,
  defaultAllyIds,
  defaultSquad,
  isPlayableRyder,
  squadReady,
  type RaidDifficulty,
  type RaidLifecycle,
  type RaidSquad,
  type SquadSlot,
} from './squad';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_MS = 20000;
const LOBBY_DROP_MS = 12000;

export interface RoomMember {
  guestId: string;
  name: string;
  slot: number | null;
  lastSeen: number;
}

export interface FighterSnap {
  id: string;
  ryderId: string | null;
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  ally: boolean;
  human: boolean;
}

export interface RaidSnapshot {
  phase: 'playing' | 'victory' | 'dead';
  wave: number;
  waves: number;
  enemiesLeft: number;
  defeated: number;
  dealt: number;
  taken: number;
  fighters: FighterSnap[];
  contributions: { name: string; dealt: number }[];
  at: number;
}

export interface RaidRoom {
  code: string;
  hostGuestId: string;
  authorityGuestId: string;
  lifecycle: RaidLifecycle;
  squad: RaidSquad;
  members: RoomMember[];
  startedAt: number;
  snapshot: RaidSnapshot | null;
  inputs: Record<string, { x: number; z: number; at: number }>;
  /** Guest ids reserved during a reconnect window. */
  reserved: { guestId: string; slot: number; until: number; ryderId: RyderId | null; name: string }[];
}

export interface RoomView {
  code: string;
  lifecycle: RaidLifecycle;
  squad: RaidSquad;
  youAreHost: boolean;
  youAreAuthority: boolean;
  yourSlot: number | null;
  members: number;
  snapshot: RaidSnapshot | null;
  inputs: Record<string, { x: number; z: number; at: number }>;
  countdownLeft: number;
}

type Book = { rooms: Map<string, RaidRoom> };

function book(): Book {
  const g = globalThis as { __raidRooms?: Book };
  if (!g.__raidRooms) g.__raidRooms = { rooms: new Map() };
  return g.__raidRooms;
}

function code(): string {
  let out = '';
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

function freshCode(): string {
  const rooms = book().rooms;
  let next = code();
  while (rooms.has(next)) next = code();
  return next;
}

function lifecycleOf(room: RaidRoom, now: number): RaidLifecycle {
  if (room.lifecycle === 'COUNTDOWN') {
    return now - room.startedAt >= 3000 ? 'IN_PROGRESS' : 'COUNTDOWN';
  }
  if (room.lifecycle === 'IN_PROGRESS' && room.snapshot?.phase === 'victory') return 'VICTORY';
  if (room.lifecycle === 'IN_PROGRESS' && room.snapshot?.phase === 'dead') return 'DEFEAT';
  if (room.lifecycle === 'VICTORY' || room.lifecycle === 'DEFEAT') return 'RESULTS';
  return room.lifecycle;
}

function sweep(room: RaidRoom, now: number) {
  room.lifecycle = lifecycleOf(room, now);
  for (const member of room.members) {
    if (now - member.lastSeen < LOBBY_DROP_MS) continue;
    if (member.slot == null) continue;
    const slot = room.squad.slots[member.slot];
    if (!slot || slot.playerId !== member.guestId) continue;
    if (room.lifecycle === 'LOBBY' || room.lifecycle === 'READY') {
      restoreComputer(room, slot.index);
      member.slot = null;
      continue;
    }
    slot.connected = false;
    slot.control = 'disconnected';
    const already = room.reserved.find((entry) => entry.guestId === member.guestId);
    if (!already) {
      room.reserved.push({
        guestId: member.guestId,
        slot: slot.index,
        until: now + RECONNECT_MS,
        ryderId: slot.ryderId,
        name: slot.displayName,
      });
    }
    if (now - member.lastSeen > 8000) slot.aiCover = true;
  }
  room.reserved = room.reserved.filter((entry) => entry.until > now);
  if (room.authorityGuestId && !room.members.some((member) => member.guestId === room.authorityGuestId && now - member.lastSeen < LOBBY_DROP_MS)) {
    const next = room.members.find((member) => member.guestId !== room.authorityGuestId && now - member.lastSeen < LOBBY_DROP_MS);
    if (next) room.authorityGuestId = next.guestId;
  }
}

function restoreComputer(room: RaidRoom, index: number) {
  if (!room.squad.aiFill) {
    room.squad.slots[index] = {
      index,
      control: 'open',
      ryderId: null,
      displayName: 'Open',
      ready: false,
      playerId: null,
      connected: false,
      aiCover: false,
    };
    return;
  }
  const taken = new Set(room.squad.slots.filter((slot) => slot.index !== index).map((slot) => slot.ryderId));
  const hostId = room.squad.slots[0]?.ryderId ?? null;
  const pick =
    defaultAllyIds(null).find((id) => !taken.has(id)) ??
    defaultAllyIds(hostId).find((id) => !taken.has(id));
  if (!pick) return;
  room.squad.slots[index] = computerSlot(index, pick);
}

function view(room: RaidRoom, guestId: string, now: number): RoomView {
  sweep(room, now);
  const member = room.members.find((entry) => entry.guestId === guestId);
  const countdownLeft =
    room.lifecycle === 'COUNTDOWN' ? Math.max(0, 3 - (now - room.startedAt) / 1000) : 0;
  return {
    code: room.code,
    lifecycle: room.lifecycle === 'COUNTDOWN' && countdownLeft <= 0 ? 'IN_PROGRESS' : room.lifecycle,
    squad: room.squad,
    youAreHost: room.hostGuestId === guestId,
    youAreAuthority: room.authorityGuestId === guestId,
    yourSlot: member?.slot ?? null,
    members: room.members.length,
    snapshot: room.snapshot,
    inputs: room.inputs,
    countdownLeft,
  };
}

function touch(room: RaidRoom, guestId: string, now: number) {
  const member = room.members.find((entry) => entry.guestId === guestId);
  if (member) member.lastSeen = now;
}

export function createRoom(guestId: string, name: string, hostRyder: RyderId | null, now = Date.now()): RoomView {
  if (!guestId) throw new Error('guest required');
  const squad = defaultSquad(isPlayableRyder(hostRyder) ? hostRyder : 'rubi', name || 'Host');
  squad.slots[0].playerId = guestId;
  squad.slots[0].displayName = name || squad.slots[0].displayName;
  const room: RaidRoom = {
    code: freshCode(),
    hostGuestId: guestId,
    authorityGuestId: guestId,
    lifecycle: 'LOBBY',
    squad,
    members: [{ guestId, name: name || 'Host', slot: 0, lastSeen: now }],
    startedAt: 0,
    snapshot: null,
    inputs: {},
    reserved: [],
  };
  book().rooms.set(room.code, room);
  return view(room, guestId, now);
}

export function readRoom(code: string, guestId: string, now = Date.now()): RoomView | null {
  const room = book().rooms.get(code.toUpperCase());
  if (!room) return null;
  touch(room, guestId, now);
  return view(room, guestId, now);
}

export interface RoomAct {
  action: 'join' | 'claim' | 'ready' | 'difficulty' | 'arena' | 'character' | 'start' | 'leave' | 'snapshot' | 'return' | 'input';
  x?: number;
  z?: number;
  code?: string;
  guestId: string;
  name?: string;
  slot?: number;
  ryderId?: string;
  difficulty?: RaidDifficulty;
  arenaId?: string;
  ready?: boolean;
  snapshot?: RaidSnapshot;
}

export function actRoom(body: RoomAct, now = Date.now()): RoomView {
  if (!body.guestId) throw new Error('guest required');
  if (body.action === 'join') return joinRoom(body, now);
  const room = book().rooms.get((body.code ?? '').toUpperCase());
  if (!room) throw new Error('room not found');
  touch(room, body.guestId, now);
  sweep(room, now);
  if (body.action === 'claim') claimSlot(room, body);
  if (body.action === 'ready') setReady(room, body);
  if (body.action === 'difficulty') setDifficulty(room, body);
  if (body.action === 'arena') setArena(room, body);
  if (body.action === 'character') setCharacter(room, body);
  if (body.action === 'start') startRoom(room, body, now);
  if (body.action === 'leave') leaveRoom(room, body, now);
  if (body.action === 'snapshot') acceptSnapshot(room, body, now);
  if (body.action === 'return') returnLobby(room, body);
  if (body.action === 'input') setInput(room, body, now);
  return view(room, body.guestId, now);
}

function joinRoom(body: RoomAct, now: number): RoomView {
  const room = book().rooms.get((body.code ?? '').toUpperCase());
  if (!room) throw new Error('room not found');
  if (!/^[A-Z0-9]{6}$/.test(room.code)) throw new Error('bad code');
  sweep(room, now);
  let member = room.members.find((entry) => entry.guestId === body.guestId);
  if (!member) {
    member = { guestId: body.guestId, name: body.name || 'Raider', slot: null, lastSeen: now };
    room.members.push(member);
  }
  member.lastSeen = now;
  member.name = body.name || member.name;
  const reserved = room.reserved.find((entry) => entry.guestId === body.guestId);
  if (reserved) {
    const slot = room.squad.slots[reserved.slot];
    slot.control = 'human';
    slot.playerId = body.guestId;
    slot.connected = true;
    slot.aiCover = false;
    slot.ryderId = reserved.ryderId;
    slot.displayName = reserved.name;
    member.slot = reserved.slot;
    room.reserved = room.reserved.filter((entry) => entry.guestId !== body.guestId);
    return view(room, body.guestId, now);
  }
  if (member.slot != null) return view(room, body.guestId, now);
  if (room.lifecycle !== 'LOBBY' && room.lifecycle !== 'READY') throw new Error('match already started');
  const open = room.squad.slots.find((slot) => slot.control === 'computer' || slot.control === 'open');
  if (!open) throw new Error('squad is full');
  open.control = 'human';
  open.playerId = body.guestId;
  open.displayName = member.name;
  open.ready = false;
  open.connected = true;
  open.aiCover = false;
  member.slot = open.index;
  return view(room, body.guestId, now);
}

function claimSlot(room: RaidRoom, body: RoomAct) {
  if (room.lifecycle !== 'LOBBY' && room.lifecycle !== 'READY') throw new Error('roster is locked');
  const index = body.slot;
  if (index == null || index < 0 || index >= SQUAD_SIZE) throw new Error('bad slot');
  const slot = room.squad.slots[index];
  if (slot.control === 'human' && slot.playerId && slot.playerId !== body.guestId) throw new Error('slot taken');
  const member = room.members.find((entry) => entry.guestId === body.guestId);
  if (!member) throw new Error('not in room');
  if (member.slot != null && member.slot !== index) {
    restoreComputer(room, member.slot);
  }
  slot.control = 'human';
  slot.playerId = body.guestId;
  slot.displayName = member.name;
  slot.ready = false;
  slot.connected = true;
  slot.aiCover = false;
  member.slot = index;
}

function setReady(room: RaidRoom, body: RoomAct) {
  const slot = slotOf(room, body.guestId);
  if (!slot || slot.control !== 'human') throw new Error('not your slot');
  slot.ready = body.ready !== false;
  const humans = room.squad.slots.filter((entry) => entry.control === 'human');
  room.lifecycle = humans.length > 0 && humans.every((entry) => entry.ready) ? 'READY' : 'LOBBY';
}

function setDifficulty(room: RaidRoom, body: RoomAct) {
  if (body.guestId !== room.hostGuestId) throw new Error('host only');
  if (room.lifecycle !== 'LOBBY' && room.lifecycle !== 'READY') throw new Error('roster is locked');
  if (body.difficulty === 'easy' || body.difficulty === 'normal' || body.difficulty === 'hard') {
    room.squad.difficulty = body.difficulty;
  }
}

function setArena(room: RaidRoom, body: RoomAct) {
  if (body.guestId !== room.hostGuestId) throw new Error('host only');
  if (room.lifecycle !== 'LOBBY' && room.lifecycle !== 'READY') throw new Error('roster is locked');
  if (body.arenaId === 'training-pad' || body.arenaId === 'block') room.squad.arenaId = body.arenaId;
}

function setCharacter(room: RaidRoom, body: RoomAct) {
  if (room.lifecycle !== 'LOBBY' && room.lifecycle !== 'READY') throw new Error('roster is locked');
  const index = body.slot;
  if (index == null || index < 0 || index >= SQUAD_SIZE) throw new Error('bad slot');
  if (!isPlayableRyder(body.ryderId)) throw new Error('character unavailable');
  const slot = room.squad.slots[index];
  const mine = slot.playerId === body.guestId;
  const hostEditingAi = body.guestId === room.hostGuestId && (slot.control === 'computer' || slot.control === 'open');
  if (!mine && !hostEditingAi) throw new Error('cannot edit that slot');
  slot.ryderId = body.ryderId;
  slot.displayName = slot.control === 'human' ? room.members.find((entry) => entry.guestId === slot.playerId)?.name || RYDERZ[body.ryderId].name : RYDERZ[body.ryderId].name;
  if (slot.control === 'human') slot.ready = false;
  room.lifecycle = 'LOBBY';
}

function startRoom(room: RaidRoom, body: RoomAct, now: number) {
  if (body.guestId !== room.hostGuestId) throw new Error('host only');
  if (!squadReady(room.squad)) throw new Error('squad is not ready');
  room.lifecycle = 'COUNTDOWN';
  room.startedAt = now;
  room.snapshot = null;
  room.authorityGuestId = room.hostGuestId;
}

function leaveRoom(room: RaidRoom, body: RoomAct, now: number) {
  const member = room.members.find((entry) => entry.guestId === body.guestId);
  if (!member) return;
  member.lastSeen = now - LOBBY_DROP_MS - 1;
  sweep(room, now);
}

function returnLobby(room: RaidRoom, body: RoomAct) {
  if (body.guestId !== room.authorityGuestId && body.guestId !== room.hostGuestId) throw new Error('host only');
  room.lifecycle = 'LOBBY';
  room.snapshot = null;
  room.startedAt = 0;
  for (const slot of room.squad.slots) {
    if (slot.control === 'human') slot.ready = false;
    slot.aiCover = false;
    if (slot.control === 'disconnected') restoreComputer(room, slot.index);
  }
}

function setInput(room: RaidRoom, body: RoomAct, now: number) {
  const life = lifecycleOf(room, now);
  if (life !== 'IN_PROGRESS' && life !== 'COUNTDOWN') throw new Error('match is not running');
  const slot = slotOf(room, body.guestId);
  if (!slot) throw new Error('not in the squad');
  const x = clampNum(body.x ?? 0, -1, 1);
  const z = clampNum(body.z ?? 0, -1, 1);
  room.inputs[body.guestId] = { x, z, at: now };
}

function slotOf(room: RaidRoom, guestId: string): SquadSlot | null {
  return room.squad.slots.find((slot) => slot.playerId === guestId) ?? null;
}

function acceptSnapshot(room: RaidRoom, body: RoomAct, now: number) {
  if (body.guestId !== room.authorityGuestId) throw new Error('authority only');
  const life = lifecycleOf(room, now);
  if (life !== 'IN_PROGRESS' && life !== 'VICTORY' && life !== 'DEFEAT' && room.lifecycle !== 'COUNTDOWN') {
    throw new Error('match is not running');
  }
  const snap = body.snapshot;
  if (!snap || !Array.isArray(snap.fighters)) throw new Error('snapshot required');
  const fighters = snap.fighters.slice(0, 16).map((fighter) => ({
    id: String(fighter.id).slice(0, 40),
    ryderId: fighter.ryderId,
    name: String(fighter.name ?? '').slice(0, 40),
    hp: clampNum(fighter.hp, 0, 100000),
    maxHp: clampNum(fighter.maxHp, 1, 100000),
    x: clampNum(fighter.x, -BOUNDARY, BOUNDARY),
    z: clampNum(fighter.z, -BOUNDARY, BOUNDARY),
    ally: Boolean(fighter.ally),
    human: Boolean(fighter.human),
  }));
  const prev = room.snapshot;
  if (prev) {
    for (const fighter of fighters) {
      const before = prev.fighters.find((entry) => entry.id === fighter.id);
      if (before && fighter.hp > before.hp + 1) fighter.hp = before.hp;
    }
  }
  room.snapshot = {
    phase: snap.phase === 'victory' || snap.phase === 'dead' ? snap.phase : 'playing',
    wave: clampNum(snap.wave, 1, 9),
    waves: clampNum(snap.waves, 1, 9),
    enemiesLeft: clampNum(snap.enemiesLeft, 0, 99),
    defeated: clampNum(snap.defeated, 0, 999),
    dealt: clampNum(snap.dealt, 0, 999999),
    taken: clampNum(snap.taken, 0, 999999),
    fighters,
    contributions: (snap.contributions ?? []).slice(0, 8).map((row) => ({
      name: String(row.name).slice(0, 40),
      dealt: clampNum(row.dealt, 0, 999999),
    })),
    at: now,
  };
  if (prev && room.snapshot.wave < prev.wave) room.snapshot.wave = prev.wave;
  if (room.snapshot.phase === 'victory') room.lifecycle = 'VICTORY';
  if (room.snapshot.phase === 'dead') room.lifecycle = 'DEFEAT';
  else if (room.lifecycle === 'COUNTDOWN') room.lifecycle = 'IN_PROGRESS';
}

function clampNum(value: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Test hook. Production rooms live for the process. */
export function resetRoomsForTests() {
  book().rooms.clear();
}

/** Test hook. Marks guests present without running the disconnect sweep. */
export function notePresenceForTests(code: string, guestIds: string[], now: number) {
  const room = book().rooms.get(code);
  if (!room) return;
  for (const guestId of guestIds) {
    const member = room.members.find((entry) => entry.guestId === guestId);
    if (member) member.lastSeen = now;
  }
}
