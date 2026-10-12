'use client';

import { useEffect, useState, type RefObject } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import type { HudState } from '@/lib/ryderz-raid/engine';
import { callSign, formatStat, rankLines, sumStats, type StatView } from '@/lib/ryderz-raid/raid/statboard';
import { RYDER_THEME } from '../menu/theme';
import MvpStage from './MvpStage';
import styles from './StatBoard.module.css';

export default function StatBoard({
  board,
  secondsRef,
  onContinue,
}: {
  board: NonNullable<HudState['statBoard']>;
  secondsRef: RefObject<HTMLElement | null>;
  onContinue: () => void;
}) {
  const [view, setView] = useState<StatView>('round');

  useEffect(() => {
    setView('round');
  }, [board.round]);

  const roundRanked = rankLines(board.lines, 'round');
  const ranked = view === 'round' ? roundRanked : rankLines(board.lines, view);
  const totals = sumStats(board.lines, view);
  const mvp = roundRanked[0];
  const mvpId = (mvp?.ryderId ?? board.lines[0]?.ryderId) as RyderId | undefined;
  const theme = mvpId ? RYDER_THEME[mvpId] : null;

  return (
    <section
      className={`${styles.board} ${board.mvp ? styles.withStage : ''}`}
      style={theme ? { ['--aura' as string]: theme.aura, ['--aura-soft' as string]: theme.soft } : undefined}
      aria-label="Raid stat board"
      data-stat-board={board.round}
      data-mvp={board.mvp ? '1' : '0'}
      data-view={view}
    >
      <div className={styles.report}>
        <header className={styles.mast}>
          <small>JAB Visions presents</small>
          <b>Ryderz: Raid</b>
          <strong>Round {board.round} complete</strong>
        </header>

        <div className={styles.views} role="tablist" aria-label="Stat view">
          <button type="button" role="tab" aria-selected={view === 'round'} className={view === 'round' ? styles.viewOn : ''} onClick={() => setView('round')}>
            Current round
          </button>
          <button type="button" role="tab" aria-selected={view === 'raid'} className={view === 'raid' ? styles.viewOn : ''} onClick={() => setView('raid')}>
            Total raid
          </button>
        </div>

        <dl className={styles.totals}>
          <div>
            <dt>Squad kills</dt>
            <dd>{formatStat(totals.kills)}</dd>
          </div>
          <div>
            <dt>Total damage</dt>
            <dd>{formatStat(totals.damage)}</dd>
          </div>
          <div>
            <dt>Total downs</dt>
            <dd>{formatStat(totals.downs)}</dd>
          </div>
        </dl>

        <ol className={styles.rows}>
          {ranked.map((row) => {
            const spec = RYDERZ[row.ryderId];
            const color = RYDER_THEME[row.ryderId];
            return (
              <li
                key={row.seat}
                style={{ ['--ryder' as string]: color.aura }}
                data-seat={row.seat}
                data-control={row.control}
                data-kills={row.stat.kills}
                data-downs={row.stat.downs}
                data-damage={Math.round(row.stat.damage)}
                data-place={row.place}
              >
                <img src={spec.icon || spec.portrait} alt="" />
                <div className={styles.who}>
                  <strong>{callSign(row.name)}</strong>
                  <em>{row.control === 'human' ? 'Human' : 'Computer'}</em>
                </div>
                <div className={styles.stats}>
                  <div className={styles.stat}>
                    <span>Kills</span>
                    <b>{formatStat(row.stat.kills)}</b>
                  </div>
                  <div className={styles.stat}>
                    <span>Downs</span>
                    <b>{formatStat(row.stat.downs)}</b>
                  </div>
                  <div className={styles.stat}>
                    <span>Damage</span>
                    <b>{formatStat(row.stat.damage)}</b>
                  </div>
                </div>
                <i className={row.place === 'MVP' ? styles.mvp : ''}>{row.place}</i>
              </li>
            );
          })}
        </ol>

        <footer className={styles.next}>
          <span>Next round: {board.nextRound}</span>
          <p>{board.raid ? 'Enemy reinforcements incoming' : 'Hold the spire to buy strength'}</p>
          <button type="button" onClick={onContinue}>
            Continue · <b ref={secondsRef}>{Math.ceil(board.left)}</b>s
          </button>
        </footer>
      </div>

      {board.mvp && mvpId ? (
        <aside className={styles.cinematic} aria-label="Raid MVP">
          <small>Raid MVP</small>
          <strong>{mvp ? callSign(mvp.name) : ''}</strong>
          <MvpStage ryderId={mvpId} />
          <em>Aura engaged</em>
        </aside>
      ) : null}
    </section>
  );
}
