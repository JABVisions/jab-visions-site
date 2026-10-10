'use client';

import { useEffect, useMemo, useState } from 'react';
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
  onBack,
  onStart,
  onSpectate,
}: {
  onBack: () => void;
  onStart: (squad: RaidSquad, net: { code: string; guestId: string; authority: boolean } | null) => void;
  onSpectate: (net: { code: string; guestId: string }) => void;
}) {
  const roster = useMemo(() => playableCharacters(GameMode.RAID), []);
  const arenas = useMemo(() => listArenas().filter((arena) => arena.available), []);
  const [guest, setGuest] = useState('');
  const [squad, setSquad] = useState<RaidSquad>(() => defaultSquad('rubi'));
  const [focus, setFocus] = useState(0);
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState('Offline squad. Create a room when friends are ready to replace a computer slot.');
  const [error, setError] = useState('');
  const [netGuest, setNetGuest] = useState('');
  const launched = useMemo(() => ({ current: false }), []);
  const focused = squad.slots[focus];
  const online = Boolean(code);

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
      setSquad(room.squad);
      setNetGuest(guest);
      const humans = room.squad.slots.filter((slot) => slot.control === 'human').length;
      const computers = room.squad.slots.filter((slot) => slot.control === 'computer').length;
      setStatus(`${room.lifecycle} · ${humans} human · ${computers} computer · ${room.youAreHost ? 'you are host' : 'joined'}`);
      if (launched.current) return;
      if (room.lifecycle === 'IN_PROGRESS' && room.youAreAuthority) {
        launched.current = true;
        onStart(room.squad, { code: room.code, guestId: guest, authority: true });
      } else if (room.lifecycle === 'IN_PROGRESS' && !room.youAreAuthority) {
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
  }, [code, guest, launched, onStart, onSpectate]);

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
      try {
        const room = await roomPost({ action: 'character', code, guestId: guest, slot: focused.index, ryderId });
        setSquad(room.squad);
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
      setCode(room.code);
      setSquad(room.squad);
      setError('');
      setStatus(`Room ${room.code} is live.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'could not create room');
    }
  };

  const join = async () => {
    try {
      const room = await roomPost({
        action: 'join',
        code: joinCode.trim().toUpperCase(),
        guestId: guest,
        name: 'Raider',
      });
      setCode(room.code);
      setSquad(room.squad);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'could not join');
    }
  };

  const ready = async () => {
    if (online) {
      const mine = squad.slots.find((slot) => slot.playerId === guest);
      const room = await roomPost({ action: 'ready', code, guestId: guest, ready: !mine?.ready });
      setSquad(room.squad);
      return;
    }
    setSquad((current) => ({
      ...current,
      slots: current.slots.map((slot) => (slot.index === 0 ? { ...slot, ready: !slot.ready } : slot)),
    }));
  };

  const start = () => {
    if (!squadReady(squad)) return;
    onStart(squad, online ? { code, guestId: netGuest || guest, authority: true } : null);
  };

  return (
    <div className={styles.screen}>
      <header>
        <p>Those Ryderz · Cooperative raid</p>
        <h2>One squad. Civilians are the enemy.</h2>
        <span>
          Slot 1 is you. The other three start as computer teammates using their own powers. Friends who join replace a computer slot. Friendly fire stays off.
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
              <strong>{spec?.name ?? slot.displayName}</strong>
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
              if (online) void roomPost({ action: 'difficulty', code, guestId: guest, difficulty }).then(setRoom(setSquad)).catch(() => {});
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
              if (online) void roomPost({ action: 'arena', code, guestId: guest, arenaId }).then((room) => setSquad(room.squad));
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
          {squad.slots[0].ready ? 'Unready' : 'Ready'}
        </button>
        <button type="button" disabled={!squadReady(squad)} onClick={start}>
          Start raid
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

function setRoom(setSquad: (squad: RaidSquad) => void) {
  return (room: RoomView) => setSquad(room.squad);
}
