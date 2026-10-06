'use client';

import type { Ref } from 'react';
import type { RyderId } from '@/lib/ryderz-raid/config';
import CircularPlayerHUD, { type CircularHudApi } from './CircularPlayerHUD';
import styles from './PvpVersusHUD.module.css';

export default function PvpVersusHUD({
  playerId,
  opponentId,
  opponentLabel,
  playerRef,
  opponentRef,
  burnout,
}: {
  playerId: RyderId;
  opponentId: RyderId;
  opponentLabel: string;
  playerRef: Ref<CircularHudApi>;
  opponentRef: Ref<CircularHudApi>;
  burnout: boolean;
}) {
  return (
    <div className={styles.row} aria-label="Versus">
      <CircularPlayerHUD ref={playerRef} ryderId={playerId} burnout={burnout} badge="P1" />
      <div className={styles.vs}>VS</div>
      <CircularPlayerHUD ref={opponentRef} ryderId={opponentId} badge={opponentLabel} />
    </div>
  );
}
