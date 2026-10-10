'use client';

import { useEffect, useState } from 'react';
import type { RoomView } from '@/lib/ryderz-raid/raid/roomStore';
import styles from './RaidLobby.module.css';

/**
 * Non-authority client. It does not simulate the raid. It shows the host's
 * authoritative snapshot and sends this player's move input upstream.
 */
export default function RaidWatch({
  code,
  guestId,
  onLeave,
}: {
  code: string;
  guestId: string;
  onLeave: () => void;
}) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [axes, setAxes] = useState({ x: 0, z: 0 });

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      const response = await fetch(`/api/raid/room?code=${code}&guest=${guestId}`);
      if (!response.ok || stop) return;
      setRoom((await response.json()) as RoomView);
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 250);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [code, guestId]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      setAxes((current) => ({
        x: key === 'a' ? -1 : key === 'd' ? 1 : current.x,
        z: key === 'w' ? 1 : key === 's' ? -1 : current.z,
      }));
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      setAxes((current) => ({
        x: key === 'a' || key === 'd' ? 0 : current.x,
        z: key === 'w' || key === 's' ? 0 : current.z,
      }));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetch('/api/raid/room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'input', code, guestId, x: axes.x, z: axes.z }),
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [axes.x, axes.z, code, guestId]);

  const snap = room?.snapshot;
  return (
    <div className={styles.screen}>
      <header>
        <p>Those Ryderz · Raid room {code}</p>
        <h2>{room?.lifecycle ?? 'Connecting'}</h2>
        <span>This screen follows the host simulation. WASD sends your movement to the squad.</span>
      </header>
      <p className={styles.note}>
        Wave {snap?.wave ?? 0}/{snap?.waves ?? 3} · Enemies left {snap?.enemiesLeft ?? '—'} · Defeated {snap?.defeated ?? 0} · Dealt {snap?.dealt ?? 0} · Taken {snap?.taken ?? 0}
      </p>
      <div className={styles.seats}>
        {(snap?.fighters ?? room?.squad.slots.map((slot) => ({
          id: String(slot.index),
          name: slot.displayName,
          hp: 0,
          maxHp: 1,
          x: 0,
          z: 0,
          ally: true,
          human: slot.control === 'human',
        })) ?? []).map((fighter) => (
          <div key={fighter.id} className={styles.seat}>
            <small>{fighter.human ? 'Human' : fighter.ally ? 'Computer' : 'Enemy'}</small>
            <strong>{fighter.name}</strong>
            <em>
              {Math.round(fighter.hp)}/{Math.round(fighter.maxHp)} · {fighter.x.toFixed(1)}, {fighter.z.toFixed(1)}
            </em>
          </div>
        ))}
      </div>
      <ul>
        {(snap?.contributions ?? []).map((row) => (
          <li key={row.name}>
            {row.name}: {row.dealt} damage
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button type="button" onClick={onLeave}>
          Return to lobby
        </button>
      </div>
    </div>
  );
}
