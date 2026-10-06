'use client';

import { useMemo, useState } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import { charactersForMode, filterRoster, type RaidCharacter, type RosterFilter } from '@/lib/ryderz-raid/roster';
import GlitchButton from '../start/GlitchButton';
import { CharacterGrid } from '../roster/CharacterGrid';
import styles from './PvpFlow.module.css';

export type PvpType = 'singlePlayer' | 'localTwoPlayer';

export interface PvpLineup {
  type: PvpType;
  player: RyderId;
  opponent: RyderId;
}

/** Versus select. One player picks both sides against CPU, or each side is a local player. */
export default function PvpFlow({
  onBack,
  onFight,
}: {
  onBack: () => void;
  onFight: (lineup: PvpLineup) => void;
}) {
  const roster = useMemo(() => charactersForMode(GameMode.PVP), []);
  const [step, setStep] = useState<'type' | 'select'>('type');
  const [type, setType] = useState<PvpType>('singlePlayer');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [side, setSide] = useState<'p1' | 'p2'>('p1');
  const [p1, setP1] = useState<RaidCharacter | null>(null);
  const [p2, setP2] = useState<RaidCharacter | null>(null);
  const shown = filterRoster(roster, filter);
  const active = side === 'p1' ? p1 : p2;
  const ready = Boolean(p1?.ryderId && p2?.ryderId);

  const assign = (character: RaidCharacter) => {
    if (!character.ryderId) return;
    if (side === 'p1') {
      setP1(character);
      if (!p2?.ryderId) setSide('p2');
    } else {
      setP2(character);
    }
  };

  return (
    <div className={styles.screen}>
      <header>
        <p>Those Ryderz · PvP</p>
        <h2>{step === 'type' ? 'Who is fighting?' : 'Choose your Ryderz.'}</h2>
        <span>
          {step === 'type'
            ? '1 Player picks a Ryder and a CPU opponent. 2 Player puts two local Ryderz in the arena.'
            : type === 'singlePlayer'
              ? 'Pick Player 1, then the CPU. The CPU closes in and strikes. It does not cast signature powers yet.'
              : 'Player 1 uses the normal controls. Player 2 moves with I J K L and punches with U.'}
        </span>
      </header>
      <button type="button" className={styles.back} onClick={() => (step === 'select' ? setStep('type') : onBack())}>
        Back
      </button>
      {step === 'type' ? (
        <div className={styles.types}>
          <GlitchButton label="1 Player" hint="You vs CPU" onClick={() => { setType('singlePlayer'); setStep('select'); }} />
          <GlitchButton label="2 Player" hint="Local versus" onClick={() => { setType('localTwoPlayer'); setStep('select'); }} />
          <GlitchButton label="Online" hint="Later" disabled />
        </div>
      ) : (
        <>
          <div className={styles.versus}>
            <section className={`${styles.side} ${side === 'p1' ? styles.sideOn : ''}`}>
              <button type="button" className={styles.pick} onClick={() => setSide('p1')}>
                <Face character={p1} />
                <span>
                  <small>Player 1</small>
                  <strong style={p1 ? { color: p1.primaryColor } : undefined}>{p1?.name ?? 'Choose Ryder'}</strong>
                  <em className={p1?.ryderId ? styles.ready : ''}>{p1?.ryderId ? 'Ready' : 'Not ready'}</em>
                </span>
              </button>
            </section>
            <div className={styles.vs}>VS</div>
            <section className={`${styles.side} ${side === 'p2' ? styles.sideOn : ''}`}>
              <button type="button" className={styles.pick} onClick={() => setSide('p2')}>
                <Face character={p2} />
                <span>
                  <small>{type === 'singlePlayer' ? 'CPU' : 'Player 2'}</small>
                  <strong style={p2 ? { color: p2.primaryColor } : undefined}>{p2?.name ?? 'Choose Ryder'}</strong>
                  <em className={p2?.ryderId ? styles.ready : ''}>{p2?.ryderId ? 'Ready' : 'Not ready'}</em>
                </span>
              </button>
            </section>
          </div>
          <CharacterGrid
            characters={shown}
            selectedId={active?.id ?? null}
            filter={filter}
            onFilter={setFilter}
            onSelect={assign}
          />
          <div className={styles.actions}>
            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                if (!p1?.ryderId || !p2?.ryderId) return;
                onFight({ type, player: p1.ryderId, opponent: p2.ryderId });
              }}
            >
              Fight
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Face({ character }: { character: RaidCharacter | null }) {
  return (
    <span className={styles.face}>
      {character?.portrait ? <img src={character.portrait} alt="" /> : null}
    </span>
  );
}
