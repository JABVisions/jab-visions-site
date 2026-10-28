'use client';

import { useEffect, useState } from 'react';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import LeaderboardPanel from './LeaderboardPanel';
import styles from './LeaderboardPreview.module.css';

type Entry = {
  id: string;
  display_name: string;
  ryder_id: keyof typeof RYDERZ;
  difficulty: string;
  wave_reached: number;
  kills: number;
  score: number | string;
};

export default function LeaderboardPreview({ refreshKey }: { refreshKey: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch('/api/raid/leaderboard', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load scores.');
        return body.entries as Entry[];
      })
      .then((rows) => {
        if (!cancelled) setEntries(rows.slice(0, 5));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load scores.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className={styles.preview} aria-label="Global raid leaderboard">
      <header>
        <div>
          <small>Global standings</small>
          <strong>Top raiders</strong>
        </div>
        <button type="button" onClick={() => setOpen(true)}>View all</button>
      </header>
      {loading ? <p className={styles.message}>Receiving signal…</p> : null}
      {!loading && error ? <p className={styles.message}>{error}</p> : null}
      {!loading && !error && entries.length === 0 ? <p className={styles.message}>No runs recorded yet.</p> : null}
      {!loading && !error && entries.length > 0 ? (
        <ol>
          {entries.map((entry, index) => {
            const ryder = RYDERZ[entry.ryder_id];
            return (
              <li key={entry.id}>
                <b className={styles.rank}>{String(index + 1).padStart(2, '0')}</b>
                <img src={ryder?.icon || ryder?.portrait} alt="" />
                <span className={styles.raider}><strong>{entry.display_name}</strong><small>{ryder?.name ?? entry.ryder_id} · {entry.difficulty}</small></span>
                <span className={styles.stats}>W{entry.wave_reached}<small>{Number(entry.score).toLocaleString('en-US')} pts</small></span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {open ? <LeaderboardPanel onClose={() => setOpen(false)} /> : null}
    </section>
  );
}
