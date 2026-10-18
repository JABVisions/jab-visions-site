'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import { listArenas } from '@/lib/ryderz-raid/arenas';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import { playableCharacters } from '@/lib/ryderz-raid/roster';
import {
  defaultSquad,
  isPlayableRyder,
  squadReady,
  type RaidDifficulty,
  type RaidSquad,
  type SquadSlot,
} from '@/lib/ryderz-raid/raid/squad';
import { applyGuestIntent, seatMissing, type LiveGuest } from '@/lib/ryderz-raid/raid/online';
import { raidLiveEnabled, sendRaidIntent, sendRaidRoom, subscribeRaidLive } from '@/lib/ryderz-raid/raid/liveRoom';
import type { RoomView } from '@/lib/ryderz-raid/raid/roomStore';
import { CharacterGrid } from '../roster/CharacterGrid';
import styles from './RaidLobby.module.css';

const GUEST_KEY = 'ryderz-raid-guest';

function guestId() {
  const existing = sessionStorage.getItem(GUEST_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(GUEST_KEY, next);
  return next;
}

async function roomPost(body: Record<string, unknown>): Promise<RoomView> {
  const response = await fetch('/api/raid/room', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as RoomView & { error?: string };
  if (!response.ok) throw new Error(data.error || 'room request failed');
  return data;
}

function controlLabel(slot: SquadSlot) {
  if (slot.aiCover) return 'AI cover';
  if (slot.control === 'human') return slot.index === 0 ? 'Human · Host' : 'Human';
  if (slot.control === 'computer') return 'Computer';
  if (slot.control === 'disconnected') return 'Disconnected';
  if (slot.control === 'reconnecting') return 'Reconnecting';
  return 'Open';
}

export default function RaidLobby({
  hostId = 'rubi',
  onBack,
  onStart,
  onSpectate,
}: {
  hostId?: RyderId;
  onBack: () => void;
  onStart: (squad: RaidSquad, net: { code: string; guestId: string; authority: boolean } | null) => void;
  onSpectate: (net: { code: string; guestId: string }) => void;
}) {
  const roster = useMemo(() => playableCharacters(GameMode.RAID), []);
  const arenas = useMemo(() => listArenas().filter((arena) => arena.available), []);
  const [guest, setGuest] = useState('');
  const [squad, setSquad] = useState<RaidSquad>(() => defaultSquad(hostId));
  const [focus, setFocus] = useState(0);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState('Offline squad. Create a room when friends are ready to replace a computer slot.');
  const [error, setError] = useState('');
  const [amHost, setAmHost] = useState(true);
  const launched = useRef(false);
  const squadRef = useRef(squad);
  const amHostRef = useRef(true);
  const lifeRef = useRef<'LOBBY' | 'READY' | 'COUNTDOWN' | 'IN_PROGRESS'>('LOBBY');
  const liveGuests = useRef<LiveGuest[]>([]);
  const liveAt = useRef(0);
  squadRef.current = squad;
  amHostRef.current = amHost;
  const focused = squad.slots[focus];
  const online = Boolean(code);
  const mine = squad.slots.find((slot) => slot.playerId === guest) ?? squad.slots[0];

  useEffect(() => {
    setGuest(guestId());
  }, []);

  useEffect(() => {
    if (!code || !guest) return;
    let stop = false;
    const pull = async () => {
      const response = await fetch(`/api/raid/room?code=${code}&guest=${guest}`);
      if (!response.ok || stop) return;
      const room = (await response.json()) as RoomView;
      if (launched.current) return;
      if (!room.youAreHost && liveAt.current > 0 && !room.squad.slots.some((slot) => slot.playerId === guest)) {
        return;
      }
      const seated = room.youAreHost ? seatMissing(room.squad, liveGuests.current) : room.squad;
      setAmHost(room.youAreHost);
      setSquad(seated);
      if (room.lifecycle === 'IN_PROGRESS' || room.lifecycle === 'COUNTDOWN' || room.lifecycle === 'LOBBY' || room.lifecycle === 'READY') {
        lifeRef.current = room.lifecycle === 'COUNTDOWN' ? 'COUNTDOWN' : room.lifecycle === 'IN_PROGRESS' ? 'IN_PROGRESS' : room.lifecycle;
      }
      const humans = seated.slots.filter((slot) => slot.control === 'human').length;
      const computers = seated.slots.filter((slot) => slot.control === 'computer').length;
      setStatus(`${room.lifecycle} · ${humans} human · ${computers} computer · ${room.youAreHost ? 'you are host' : 'joined'}`);
      if ((room.lifecycle === 'IN_PROGRESS' || room.lifecycle === 'COUNTDOWN') && room.youAreAuthority) {
        launched.current = true;
        onStart(seated, { code: room.code, guestId: guest, authority: true });
      } else if ((room.lifecycle === 'IN_PROGRESS' || room.lifecycle === 'COUNTDOWN') && !room.youAreAuthority) {
        launched.current = true;
        onSpectate({ code: room.code, guestId: guest });
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 700);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [code, guest, onStart, onSpectate]);

  useEffect(() => {
    if (!code || !guest) return;
    return subscribeRaidLive(code, {
      onRoom: (room) => {
        if (amHostRef.current || room.hostGuestId === guest) return;
        liveAt.current = Date.now();
        setSquad(room.squad);
        setAmHost(false);
        const humans = room.squad.slots.filter((slot) => slot.control === 'human').length;
        const computers = room.squad.slots.filter((slot) => slot.control === 'computer').length;
        setStatus(`${room.lifecycle} · ${humans} human · ${computers} computer · joined`);
        if (launched.current) return;
        if (room.lifecycle === 'IN_PROGRESS' || room.lifecycle === 'COUNTDOWN') {
          launched.current = true;
          onSpectate({ code: room.code, guestId: guest });
        }
      },
      onIntent: (intent) => {
        if (!amHostRef.current || intent.guestId === guest || intent.intent === 'input') return;
        const applied = applyGuestIntent(squadRef.current, liveGuests.current, intent);
        liveGuests.current = applied.guests;
        squadRef.current = applied.squad;
        setSquad(applied.squad);
        const humans = applied.squad.slots.filter((slot) => slot.control === 'human').length;
        const computers = applied.squad.slots.filter((slot) => slot.control === 'computer').length;
        setStatus(`${lifeRef.current} · ${humans} human · ${computers} computer · you are host`);
      },
    });
  }, [code, guest, onSpectate]);

  useEffect(() => {
    if (!code || !guest || !amHost) return;
    const send = () => {
      void sendRaidRoom({
        code,
        hostGuestId: guest,
        lifecycle: lifeRef.current,
        squad: squadRef.current,
      });
    };
    send();
    const timer = window.setInterval(send, 600);
    return () => window.clearInterval(timer);
  }, [code, guest, amHost]);

  useEffect(() => {
    if (!code || !guest || amHost) return;
    const announce = () => {
      void sendRaidIntent(code, { intent: 'join', guestId: guest, name: 'Raider' });
    };
    announce();
    const timer = window.setInterval(announce, 800);
    return () => window.clearInterval(timer);
  }, [code, guest, amHost]);

  const patchLocal = (index: number, ryderId: RyderId) => {
    setSquad((current) => ({
      ...current,
      slots: current.slots.map((slot) =>
        slot.index === index
          ? {
              ...slot,
              ryderId,
              displayName: slot.control === 'human' ? slot.displayName : RYDERZ[ryderId].name,
              ready: slot.control === 'computer',
            }
          : slot,
      ),
    }));
  };

  const selectCharacter = async (ryderId: RyderId) => {
    if (!focused) return;
    if (online) {
      if (focused.playerId === guest) {
        void sendRaidIntent(code, { intent: 'character', guestId: guest, slot: focused.index, ryderId });
      }
      try {
        const room = await roomPost({ action: 'character', code, guestId: guest, slot: focused.index, ryderId });
        setSquad(amHostRef.current ? seatMissing(room.squad, liveGuests.current) : room.squad);
        setError('');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'could not change character');
      }
      return;
    }
    patchLocal(focus, ryderId);
  };

  const create = async () => {
    try {
      const room = await roomPost({
        action: 'create',
        guestId: guest,
        name: 'Host',
        ryderId: squad.slots[0].ryderId,
      });
      liveGuests.current = [];
      lifeRef.current = 'LOBBY';
      setAmHost(true);
      setCode(room.code);
      setSquad(room.squad);
      setError('');
      setStatus(`Room ${room.code} is live. Share this code.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'could not create room');
    }
  };

  const join = async () => {
    const typed = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(typed)) {
      setError('Enter the 6 character code');
      return;
    }
    try {
      const room = await roomPost({
        action: 'join',
        code: typed,
        guestId: guest,
        name: 'Raider',
      });
      setAmHost(room.youAreHost);
      setCode(room.code);
      setSquad(room.squad);
      setError('');
      setStatus(room.youAreHost ? 'You are the host.' : 'You are in the room.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'could not join';
      if (message === 'room not found' && raidLiveEnabled()) {
        setAmHost(false);
        setCode(typed);
        setError('');
        setStatus('Looking for that raid room…');
        return;
      }
      setError(message);
    }
  };

  const ready = async () => {
    const slot = squad.slots.find((entry) => entry.playerId === guest) ?? squad.slots[0];
    const nextReady = !slot?.ready;
    if (online) {
      if (!amHostRef.current) {
        void sendRaidIntent(code, { intent: 'ready', guestId: guest, ready: nextReady, name: slot?.displayName || 'Raider' });
      }
      try {
        const room = await roomPost({ action: 'ready', code, guestId: guest, ready: nextReady });
        setSquad(amHostRef.current ? seatMissing(room.squad, liveGuests.current) : room.squad);
        setError('');
      } catch (reason) {
        if (!amHostRef.current) {
          setSquad((current) => ({
            ...current,
            slots: current.slots.map((entry) => (entry.playerId === guest ? { ...entry, ready: nextReady } : entry)),
          }));
        }
        setError(reason instanceof Error ? reason.message : 'could not ready');
      }
      return;
    }
    setSquad((current) => ({
      ...current,
      slots: current.slots.map((entry) => (entry.index === 0 ? { ...entry, ready: !entry.ready } : entry)),
    }));
  };

  const start = async () => {
    if (online && !amHostRef.current) return;
    const current = squadRef.current;
    if (!squadReady(current)) return;
    if (!online) {
      onStart(current, null);
      return;
    }
    launched.current = true;
    let next = seatMissing(current, liveGuests.current);
    try {
      const room = await roomPost({ action: 'start', code, guestId: guest });
      next = seatMissing(room.squad, liveGuests.current);
    } catch (reason) {
      next = seatMissing(squadRef.current, liveGuests.current);
      const message = reason instanceof Error ? reason.message : '';
      if (message === 'host only') {
        launched.current = false;
        setError(message);
        return;
      }
      if (!squadReady(next)) {
        launched.current = false;
        setError(message || 'squad is not ready');
        return;
      }
    }
    lifeRef.current = 'IN_PROGRESS';
    squadRef.current = next;
    await sendRaidRoom({ code, hostGuestId: guest, lifecycle: 'IN_PROGRESS', squad: next });
    onStart(next, { code, guestId: guest, authority: true });
  };

  return (
    <div className={styles.screen}>
      <header>
        <p>Those Ryderz · Cooperative raid</p>
        <h2>One squad. Civilians are the enemy.</h2>
        <span>
          Slot 1 is you. The other four start as computer teammates using their own powers. Friends who join replace a computer slot, up to five fighters. Friendly fire stays off.
        </span>
      </header>
      <div className={styles.seats}>
        {squad.slots.map((slot) => {
          const spec = slot.ryderId ? RYDERZ[slot.ryderId] : null;
          return (
            <button
              key={slot.index}
              type="button"
              className={[styles.seat, focus === slot.index ? styles.seatOn : '', slot.control === 'open' ? styles.empty : ''].join(' ')}
              onClick={() => setFocus(slot.index)}
            >
              {spec?.icon || spec?.portrait ? <img src={spec.icon || spec.portrait} alt="" /> : <span className={styles.mono}>{slot.index + 1}</span>}
              <small>
                P{slot.index + 1} · {controlLabel(slot)}
              </small>
              <strong>{slot.control === 'human' ? slot.displayName : spec?.name ?? slot.displayName}</strong>
              <em>{slot.connected ? (slot.ready ? 'Ready' : 'Not ready') : 'Waiting'}</em>
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={onBack}>
          Back
        </button>
        <label>
          Difficulty
          <select
            value={squad.difficulty}
            onChange={(event) => {
              const difficulty = event.target.value as RaidDifficulty;
              if (online) {
                void roomPost({ action: 'difficulty', code, guestId: guest, difficulty })
                  .then((room) => setSquad(amHostRef.current ? seatMissing(room.squad, liveGuests.current) : room.squad))
                  .catch(() => {});
              }
              else setSquad((current) => ({ ...current, difficulty }));
            }}
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Arena
          <select
            value={squad.arenaId}
            onChange={(event) => {
              const arenaId = event.target.value;
              if (online) {
                void roomPost({ action: 'arena', code, guestId: guest, arenaId }).then((room) =>
                  setSquad(amHostRef.current ? seatMissing(room.squad, liveGuests.current) : room.squad),
                );
              }
              else setSquad((current) => ({ ...current, arenaId }));
            }}
          >
            {arenas.map((arena) => (
              <option key={arena.id} value={arena.id}>
                {arena.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void ready()}>
          {mine?.ready ? 'Unready' : 'Ready'}
        </button>
        <button type="button" disabled={!squadReady(squad) || (online && !amHost)} onClick={() => void start()}>
          {online && !amHost ? 'Waiting for host' : 'Start raid'}
        </button>
        <button type="button" onClick={() => void create()}>
          Create online room
        </button>
        <input
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          placeholder="Room code"
          maxLength={6}
          aria-label="Room code"
        />
        <button type="button" onClick={() => void join()}>
          Join online room
        </button>
        <button
          type="button"
          disabled={!code}
          onClick={() => void navigator.clipboard.writeText(code)}
        >
          Copy invitation code
        </button>
      </div>
      <p className={styles.note}>
        {code ? `Invitation ${code}` : 'No room yet'} · {status}
        {error ? ` · ${error}` : ''}
      </p>
      <CharacterGrid
        characters={roster}
        selectedId={focused?.ryderId}
        filter="all"
        onSelect={(character) => {
          if (character.ryderId && isPlayableRyder(character.ryderId)) void selectCharacter(character.ryderId);
        }}
      />
    </div>
  );
}
