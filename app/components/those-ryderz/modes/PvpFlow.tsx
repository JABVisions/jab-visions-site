'use client';

import { useState } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import type { RaidCharacter } from '@/lib/ryderz-raid/roster';
import GlitchButton from '../start/GlitchButton';
import PremiereCharacterSelect from '../premiere/PremiereCharacterSelect';
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
  const [step, setStep] = useState<'type' | 'select'>('type');
  const [type, setType] = useState<PvpType>('singlePlayer');
  const [side, setSide] = useState<'p1' | 'p2'>('p1');
  const [p1, setP1] = useState<RaidCharacter | null>(null);
  const [p2, setP2] = useState<RaidCharacter | null>(null);
  const [pin, setPin] = useState<{ token: number; id: string | null }>({ token: 0, id: null });
  const active = side === 'p1' ? p1 : p2;
  const ready = Boolean(p1?.ryderId && p2?.ryderId);

  const assign = (character: RaidCharacter) => {
    if (!character.ryderId) return;
    if (side === 'p1') setP1(character);
    else setP2(character);
  };

  const focusSide = (next: 'p1' | 'p2') => {
    setSide(next);
    const character = next === 'p1' ? p1 : p2;
    setPin({ token: Date.now(), id: character?.id ?? null });
  };

  if (step === 'select') {
    return (
      <PremiereCharacterSelect
        mode="pvp"
        initialId={active?.id ?? p1?.id}
        pin={pin}
        onBack={() => setStep('type')}
        onHighlight={assign}
        confirmLabel="Fight"
        confirmDisabled={!ready}
        onConfirm={(character) => {
          const nextP1 = side === 'p1' ? character : p1;
          const nextP2 = side === 'p2' ? character : p2;
          if (!nextP1?.ryderId || !nextP2?.ryderId) return;
          onFight({ type, player: nextP1.ryderId, opponent: nextP2.ryderId });
        }}
        toolbar={
          <div className={styles.versus}>
            <section className={`${styles.side} ${side === 'p1' ? styles.sideOn : ''}`}>
              <button type="button" className={styles.pick} onClick={() => focusSide('p1')}>
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
              <button type="button" className={styles.pick} onClick={() => focusSide('p2')}>
                <Face character={p2} />
                <span>
                  <small>{type === 'singlePlayer' ? 'CPU' : 'Player 2'}</small>
                  <strong style={p2 ? { color: p2.primaryColor } : undefined}>{p2?.name ?? 'Choose Ryder'}</strong>
                  <em className={p2?.ryderId ? styles.ready : ''}>{p2?.ryderId ? 'Ready' : 'Not ready'}</em>
                </span>
              </button>
            </section>
          </div>
        }
      />
    );
  }

  return (
    <div className={styles.screen}>
      <header>
        <p>Those Ryderz · PvP</p>
        <h2>Who is fighting?</h2>
        <span>1 Player picks a Ryder and a CPU opponent. 2 Player puts two local Ryderz in the arena.</span>
      </header>
      <button type="button" className={styles.back} onClick={onBack}>
        Back
      </button>
      <div className={styles.types}>
          <GlitchButton label="1 Player" hint="You vs CPU" onClick={() => { setType('singlePlayer'); setStep('select'); }} />
          <GlitchButton label="2 Player" hint="Local versus" onClick={() => { setType('localTwoPlayer'); setStep('select'); }} />
          <GlitchButton label="Online" hint="Later" disabled />
        </div>
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
