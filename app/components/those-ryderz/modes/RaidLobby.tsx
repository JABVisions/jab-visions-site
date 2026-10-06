'use client';

import { useMemo, useState } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import { charactersForMode, filterRoster, type RaidCharacter, type RosterFilter } from '@/lib/ryderz-raid/roster';
import { PARTY_HUD_CAPACITY } from '@/lib/ryderz-raid/multiplayer';
import { CharacterGrid } from '../roster/CharacterGrid';
import styles from './RaidLobby.module.css';

export interface RaidSeat {
  index: number;
  occupied: boolean;
  displayName: string;
  character: RaidCharacter | null;
  ready: boolean;
  isLocal: boolean;
}

function emptySeat(index: number, local = false): RaidSeat {
  return {
    index,
    occupied: local,
    displayName: local ? 'Player 1' : `Player ${index + 1}`,
    character: null,
    ready: false,
    isLocal: local,
  };
}

/** Shared raid lobby. Empty seats can be joined locally until networking exists. */
export default function RaidLobby({
  onBack,
  onStart,
}: {
  onBack: () => void;
  onStart: (seats: RaidSeat[]) => void;
}) {
  const roster = useMemo(() => charactersForMode(GameMode.RAID), []);
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [focus, setFocus] = useState(0);
  const [seats, setSeats] = useState<RaidSeat[]>(() =>
    Array.from({ length: PARTY_HUD_CAPACITY }, (_, index) => emptySeat(index, index === 0)),
  );
  const shown = filterRoster(roster, filter);
  const focused = seats[focus];
  const canStart = seats.some((seat) => seat.occupied && seat.character?.ryderId && seat.ready) &&
    seats.every((seat) => !seat.occupied || (seat.character?.ryderId && seat.ready));

  const patch = (index: number, next: Partial<RaidSeat>) => {
    setSeats((current) => current.map((seat) => (seat.index === index ? { ...seat, ...next } : seat)));
  };

  return (
    <div className={styles.screen}>
      <header>
        <p>Those Ryderz · Raid lobby</p>
        <h2>Join, pick a Ryder, ready up.</h2>
        <span>
          Five seats is one party. Later raid instances can hold more parties. The host can start once every joined seat is ready, even if some seats are still open.
        </span>
      </header>
      <div className={styles.seats}>
        {seats.map((seat) => (
          <button
            key={seat.index}
            type="button"
            className={[styles.seat, focus === seat.index ? styles.seatOn : '', seat.occupied ? '' : styles.empty].join(' ')}
            onClick={() => {
              setFocus(seat.index);
              if (!seat.occupied) patch(seat.index, { occupied: true, ready: false, isLocal: false });
            }}
          >
            {seat.character?.portrait ? (
              <img src={seat.character.portrait} alt="" />
            ) : (
              <span className={styles.mono}>{seat.occupied ? seat.displayName.slice(0, 1) : '+'}</span>
            )}
            <small>P{seat.index + 1}{seat.isLocal ? ' · Host' : ''}</small>
            <strong>{seat.occupied ? seat.character?.name ?? seat.displayName : 'Open'}</strong>
            <em>{seat.occupied ? (seat.ready ? 'Ready' : 'Not ready') : 'Join'}</em>
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={onBack}>
          Back
        </button>
        {!focused?.occupied ? (
          <button type="button" onClick={() => patch(focus, { occupied: true, ready: false, isLocal: false })}>
            Join P{focus + 1}
          </button>
        ) : (
          <button type="button" onClick={() => patch(focus, { ready: !focused.ready })} disabled={!focused.character?.ryderId}>
            {focused.ready ? 'Unready' : 'Ready'} P{focus + 1}
          </button>
        )}
        {focused?.occupied && !focused.isLocal ? (
          <button type="button" onClick={() => patch(focus, emptySeat(focus))}>
            Leave
          </button>
        ) : null}
        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart(seats.filter((seat) => seat.occupied))}
        >
          Start raid
        </button>
      </div>
      <CharacterGrid
        characters={shown}
        selectedId={focused?.character?.id ?? null}
        filter={filter}
        onFilter={setFilter}
        onSelect={(character) => {
          if (!focused?.occupied || !character.ryderId) return;
          patch(focus, { character, ready: false });
        }}
      />
    </div>
  );
}

export function seatRyder(seat: RaidSeat): RyderId | null {
  return seat.character?.ryderId ?? null;
}
