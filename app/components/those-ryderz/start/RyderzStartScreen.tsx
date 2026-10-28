'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { GAME_MODES, GameMode } from '@/lib/ryderz-raid/game-mode';
import type { SaveSlot } from '@/lib/ryderz-raid/saves/saveManager';
import { LEADERBOARD_NAME_KEY, readLeaderboardName, sanitizeLeaderboardName } from '@/lib/ryderz-raid/raid/leaderboard';
import { useMenuKeys, wrap } from '../menu/useMenuKeys';
import LeaderboardPanel from './LeaderboardPanel';
import GlitchButton from './GlitchButton';
import styles from './RyderzStartScreen.module.css';

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 19c1.2-3.4 3.3-5 7-5s5.8 1.6 7 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SwordsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 19 19 5M14 5h5v5M10 19H5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RaidIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="8" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 19c.8-2.6 2.2-4 4.4-4M19.5 19c-.8-2.6-2.2-4-4.4-4M8 19c.9-2.4 2.2-3.6 4-3.6s3.1 1.2 4 3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const MODE_ICONS = {
  [GameMode.SOLO]: <PersonIcon />,
  [GameMode.PVP]: <SwordsIcon />,
  [GameMode.RAID]: <RaidIcon />,
};

export default function RyderzStartScreen({
  slots,
  activeSlot,
  lastMode,
  onSelectSlot,
  onContinue,
  onNewGame,
  onPickMode,
}: {
  slots: SaveSlot[];
  activeSlot: number;
  lastMode: GameMode;
  onSelectSlot: (index: number) => void;
  onContinue: () => void;
  onNewGame: () => void;
  onPickMode: (mode: GameMode) => void;
}) {
  const hasSave = slots.some((slot) => !slot.empty);
  const current = slots[activeSlot];
  const canContinue = Boolean(current && !current.empty);
  const [modeFocus, setModeFocus] = useState(Math.max(0, GAME_MODES.findIndex((mode) => mode.id === lastMode)));
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [callsign, setCallsign] = useState('');
  const [callsignOpen, setCallsignOpen] = useState(false);
  const [callsignError, setCallsignError] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'mode'; mode: GameMode } | { type: 'continue' } | null>(null);

  useEffect(() => {
    let saved = '';
    try {
      saved = sanitizeLeaderboardName(window.localStorage.getItem(LEADERBOARD_NAME_KEY) ?? '');
    } catch {
      // The required gate will request a callsign and explain if saving fails.
    }
    setCallsign(saved);
    if (saved.length < 2) setCallsignOpen(true);
  }, []);

  const requestMode = (mode: GameMode) => {
    const savedCallsign = readLeaderboardName('');
    setCallsign(savedCallsign);
    if (savedCallsign.length < 2) {
      setPendingAction({ type: 'mode', mode });
      setCallsignOpen(true);
      return;
    }
    onPickMode(mode);
  };

  const requestContinue = () => {
    const savedCallsign = readLeaderboardName('');
    setCallsign(savedCallsign);
    if (savedCallsign.length < 2) {
      setPendingAction({ type: 'continue' });
      setCallsignOpen(true);
      return;
    }
    onContinue();
  };

  const saveCallsign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const safe = sanitizeLeaderboardName(callsign);
    if (safe.length < 2) {
      setCallsignError('Use at least 2 characters for your public callsign.');
      return;
    }
    try {
      window.localStorage.setItem(LEADERBOARD_NAME_KEY, safe);
    } catch {
      setCallsignError('Your browser could not save the callsign. Allow site storage, then try again.');
      return;
    }
    setCallsign(safe);
    setCallsignError('');
    setCallsignOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (action?.type === 'mode') onPickMode(action.mode);
    else if (action?.type === 'continue') onContinue();
  };

  useMenuKeys((key) => {
    if (key === 'left' || key === 'up') setModeFocus((i) => wrap(i - 1, GAME_MODES.length));
    else if (key === 'right' || key === 'down') setModeFocus((i) => wrap(i + 1, GAME_MODES.length));
    else if (key === 'confirm') requestMode(GAME_MODES[modeFocus].id);
    else return false;
    return true;
  }, true);

  return (
    <div className={styles.screen} role="dialog" aria-label="Those Ryderz: Raid">
      <img className={styles.art} src="/assets/those-ryderz/title-screen.png" alt="Those Ryderz: Raid" />
      <div className={styles.veil} aria-hidden="true" />
      <div className={styles.scan} aria-hidden="true" />
      <div className={styles.noise} aria-hidden="true" />

      <div className={styles.cluster}>
        {hasSave ? (
          <div className={styles.saves} role="listbox" aria-label="Save slots">
            {slots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                role="option"
                aria-selected={slot.slotIndex === activeSlot}
                className={`${styles.slot} ${slot.slotIndex === activeSlot ? styles.slotOn : ''} ${slot.empty ? styles.slotEmpty : ''}`}
                onClick={() => onSelectSlot(slot.slotIndex)}
              >
                <span>Slot {slot.slotIndex + 1}</span>
                <strong>{slot.empty ? 'Empty' : slot.displayName}</strong>
              </button>
            ))}
          </div>
        ) : null}

        {canContinue ? (
          <div className={styles.continueRow}>
            <GlitchButton
              label="Continue"
              hint={current?.displayName ?? 'Load save'}
              onClick={requestContinue}
            />
            <GlitchButton label="New Save" hint="Fresh slot" dim onClick={onNewGame} />
          </div>
        ) : null}

        <div className={styles.modes} role="listbox" aria-label="Game modes">
          {GAME_MODES.map((mode, i) => (
            <GlitchButton
              key={mode.id}
              label={mode.name}
              hint={mode.tagline}
              icon={MODE_ICONS[mode.id]}
              selected={modeFocus === i}
              onMouseEnter={() => setModeFocus(i)}
              onClick={() => requestMode(mode.id)}
            />
          ))}
        </div>

        <button
          className={styles.leaderboardButton}
          type="button"
          onClick={() => setLeaderboardOpen(true)}
        >
          <span aria-hidden="true">◉</span> Global raid leaderboard
        </button>
      </div>

      <footer className={styles.foot}>
        <span>Enter select</span>
        <span>Arrows move</span>
        <span>Q E R later</span>
        <span className={styles.footRight}>{callsign ? `${callsign} · ` : ''}Save data · Slot {activeSlot + 1}</span>
      </footer>

      {leaderboardOpen ? <LeaderboardPanel onClose={() => setLeaderboardOpen(false)} /> : null}
      {callsignOpen ? (
        <div className={styles.callsignShade}>
          <form className={styles.callsignCard} role="dialog" aria-modal="true" aria-labelledby="callsign-title" onSubmit={saveCallsign}>
            <small>Player registration · global leaderboard</small>
            <h2 id="callsign-title">Choose your callsign</h2>
            <p>This public name will identify your runs on the global leaderboard.</p>
            <label htmlFor="player-callsign">Username or public callsign</label>
            <input
              id="player-callsign"
              autoFocus
              autoComplete="nickname"
              maxLength={16}
              minLength={2}
              required
              value={callsign}
              onChange={(event) => {
                setCallsign(event.target.value);
                setCallsignError('');
              }}
              placeholder="e.g. NeonRyder"
            />
            {callsignError ? <p className={styles.callsignError} role="alert">{callsignError}</p> : null}
            <button type="submit" disabled={sanitizeLeaderboardName(callsign).length < 2}>Save callsign &amp; continue</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
