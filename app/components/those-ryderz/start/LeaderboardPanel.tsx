'use client';

import { useEffect, useState } from 'react';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import { LEADERBOARD_NAME_KEY } from '@/lib/ryderz-raid/raid/leaderboard';
import styles from './LeaderboardPanel.module.css';

type Difficulty = 'all' | 'easy' | 'normal' | 'hard' | 'nightmare';
type Entry = {
  id: string;
  display_name: string;
  ryder_id: keyof typeof RYDERZ;
  difficulty: Exclude<Difficulty, 'all'>;
  result: 'victory' | 'defeat';
  wave_reached: number;
  kills: number;
  damage: number;
  score: number | string;
  created_at: string;
};

const DIFFICULTIES: Difficulty[] = ['all', 'easy', 'normal', 'hard', 'nightmare'];

export default function LeaderboardPanel({ onClose }: { onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setName(window.localStorage.getItem(LEADERBOARD_NAME_KEY) ?? '');
    } catch {
      setName('');
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const query = difficulty === 'all' ? '' : `?difficulty=${difficulty}`;
    fetch(`/api/raid/leaderboard${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load leaderboard.');
        return body.entries as Entry[];
      })
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load leaderboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [difficulty]);

  const saveName = (value: string) => {
    const safe = value.replace(/[<>\u0000-\u001f]/g, '').slice(0, 16);
    setName(safe);
    try {
      window.localStorage.setItem(LEADERBOARD_NAME_KEY, safe.trim().replace(/\s+/g, ' '));
    } catch {
      // The score can still be submitted with the default guest name.
    }
  };

  return (
    <div className={styles.shade} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="raid-leaderboard-title">
        <header className={styles.header}>
          <div>
            <small>Global signal · all raiders</small>
            <h2 id="raid-leaderboard-title">Raid leaderboard</h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Close leaderboard">×</button>
        </header>

        <label className={styles.nameField}>
          <span>Your public callsign</span>
          <input value={name} maxLength={16} onChange={(event) => saveName(event.target.value)} placeholder="Ryder Guest" />
        </label>

        <div className={styles.filters} role="group" aria-label="Filter leaderboard by difficulty">
          {DIFFICULTIES.map((item) => (
            <button key={item} type="button" aria-pressed={difficulty === item} onClick={() => setDifficulty(item)}>
              {item === 'all' ? 'All' : item}
            </button>
          ))}
        </div>

        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th scope="col">#</th><th scope="col">Raider</th><th scope="col">Difficulty</th><th scope="col">Result</th><th scope="col">Wave</th><th scope="col">Kills</th><th scope="col">Raid score</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className={styles.message}>Receiving signal…</td></tr> : null}
              {!loading && error ? <tr><td colSpan={7} className={styles.message}>{error}</td></tr> : null}
              {!loading && !error && entries.length === 0 ? <tr><td colSpan={7} className={styles.message}>No runs recorded yet. Your name is ready when you are.</td></tr> : null}
              {!loading && !error ? entries.map((entry, index) => {
                const ryder = RYDERZ[entry.ryder_id];
                return (
                  <tr key={entry.id}>
                    <td className={styles.rank}>{String(index + 1).padStart(2, '0')}</td>
                    <td className={styles.raider}>
                      <img src={ryder?.icon || ryder?.portrait} alt="" />
                      <span><b>{entry.display_name}</b><small>{ryder?.name ?? entry.ryder_id}</small></span>
                    </td>
                    <td className={styles.difficulty} data-difficulty={entry.difficulty}>{entry.difficulty}</td>
                    <td className={styles.result} data-result={entry.result}>{entry.result}</td>
                    <td>{entry.wave_reached}</td>
                    <td>{entry.kills.toLocaleString('en-US')}</td>
                    <td className={styles.score}>{Number(entry.score).toLocaleString('en-US')}</td>
                  </tr>
                );
              }) : null}
            </tbody>
          </table>
        </div>
        <footer className={styles.footer}>Scores rank by raid score. Callsigns are public and saved on this device.</footer>
      </section>
    </div>
  );
}
