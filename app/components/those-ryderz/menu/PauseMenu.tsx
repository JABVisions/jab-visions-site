'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import type { RaidEngine } from '@/lib/ryderz-raid/engine';
import type { GameMode } from '@/lib/ryderz-raid/game-mode';
import { INPUT_SLOTS, type RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import ArenaSelector from './ArenaSelector';
import GameModeSelector from './GameModeSelector';
import PauseMenuNavigation, { type NavItem } from './PauseMenuNavigation';
import PowerDeck from './PowerDeck';
import RyderSelector from './RyderSelector';
import RyderShowcase from './RyderShowcase';
import SettingsMenu from './SettingsMenu';
import { RYDER_THEME } from './theme';
import { useMenuKeys, wrap } from './useMenuKeys';
import styles from './PauseMenu.module.css';

type View = 'root' | 'deck' | 'ryder' | 'arena' | 'mode' | 'settings';
type RootAction = View | 'resume' | 'exit';

const ROOT_ITEMS: NavItem<RootAction>[] = [
  { id: 'resume', label: 'Resume', hint: 'Back onto the block' },
  { id: 'deck', label: 'Power Deck', hint: 'Bind Q · E · R' },
  { id: 'ryder', label: 'Switch Ryder', hint: 'Change who is in play' },
  { id: 'arena', label: 'Arena', hint: 'Where the raid happens', soon: true },
  { id: 'mode', label: 'Game Mode', hint: 'PvE · PvP' },
  { id: 'settings', label: 'Settings', hint: 'Camera & controls' },
  { id: 'exit', label: 'Exit Raid', hint: 'Drop the signal', danger: true },
];

/**
 * Pause screen: command list on the left, the active screen in the middle and
 * a live full-body showcase of the Ryder on the right. Submenus own their
 * keyboard handling while open; this component handles the root list.
 */
export default function PauseMenu({
  manager,
  engine,
  activeRyder,
  gameMode,
  arenaId,
  round,
  points,
  layout,
  onResume,
  onExit,
  onRyderSwitched,
  onOpenCameraTuning,
}: {
  manager: RyderManager;
  engine: RaidEngine | null;
  activeRyder: RyderId;
  gameMode: GameMode;
  arenaId: string;
  round: number;
  points: number;
  layout: 'embed' | 'page';
  onResume: () => void;
  onExit: () => void;
  onRyderSwitched?: (id: RyderId) => void;
  onOpenCameraTuning?: () => void;
}) {
  const [view, setView] = useState<View>('root');
  const [index, setIndex] = useState(0);
  const [poseKey, setPoseKey] = useState(0);
  const [preview, setPreview] = useState<RyderId | null>(null);
  const [switching, setSwitching] = useState(false);

  const shown = preview ?? activeRyder;
  const spec = RYDERZ[shown];
  const theme = RYDER_THEME[shown];
  const deck = manager.loadoutSpecs(shown);

  // The figure shifts pose whenever focus or screen changes.
  useEffect(() => {
    setPoseKey((k) => k + 1);
  }, [index, view]);

  const back = useCallback(() => setView('root'), []);
  const previewRyder = useCallback((id: RyderId | null) => setPreview(id), []);

  const activate = (id: RootAction) => {
    if (id === 'resume') onResume();
    else if (id === 'exit') onExit();
    else setView(id);
  };

  useMenuKeys((key) => {
    if (key === 'up') setIndex((i) => wrap(i - 1, ROOT_ITEMS.length));
    else if (key === 'down') setIndex((i) => wrap(i + 1, ROOT_ITEMS.length));
    else if (key === 'confirm' || key === 'right') activate(ROOT_ITEMS[index].id);
    else if (key === 'back') onResume();
    else return false;
    return true;
  }, view === 'root');

  const switchRyder = async (id: RyderId) => {
    setSwitching(true);
    try {
      const ok = await manager.switchRyder(id);
      if (ok) onRyderSwitched?.(id);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      className={styles.menu}
      role="dialog"
      aria-modal="true"
      aria-label="Raid paused"
      style={{ ['--aura' as string]: theme.aura, ['--aura-soft' as string]: theme.soft }}
    >
      <aside className={styles.side}>
        <div>
          <p className={styles.eyebrow}>Raid paused · Round {round}</p>
          <h1 className={styles.title}>
            {RYDERZ[activeRyder].name}
            <small>
              {RYDERZ[activeRyder].title} · {points} signal
            </small>
          </h1>
        </div>
        <PauseMenuNavigation items={ROOT_ITEMS} index={index} onFocus={setIndex} onSelect={activate} />
        {layout === 'embed' && (
          <Link href="/those-ryderz/raid" className={styles.ghostBtn}>
            Fullscreen
          </Link>
        )}
      </aside>

      {view === 'root' && (
        <section className={styles.panel} aria-label="Status">
          <header className={styles.panelHead}>
            <p className={styles.eyebrow}>Signal held</p>
            <h2>Hosts freeze until you step back on</h2>
            <p>
              Pick a command on the left. Decks are saved per Ryder, so a loadout you build here is waiting the next
              time that Ryder drops in.
            </p>
          </header>
          <div className={styles.summaryCard}>
            <div className={styles.summaryRow}>
              <span>Game mode</span>
              <strong>{gameMode.toUpperCase()}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Arena</span>
              <strong>The Block</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Deck</span>
              <strong>{deck.map((m) => m.name).join(' / ')}</strong>
            </div>
          </div>
        </section>
      )}
      {view === 'deck' && <PowerDeck manager={manager} ryderId={activeRyder} active onBack={back} />}
      {view === 'ryder' && (
        <RyderSelector
          manager={manager}
          activeRyder={activeRyder}
          active
          busy={switching}
          onPreview={previewRyder}
          onSwitch={switchRyder}
          onBack={back}
        />
      )}
      {view === 'arena' && <ArenaSelector manager={manager} arenaId={arenaId} active onBack={back} />}
      {view === 'mode' && <GameModeSelector manager={manager} gameMode={gameMode} active onBack={back} />}
      {view === 'settings' && (
        <SettingsMenu engine={engine} active onBack={back} onOpenCameraTuning={onOpenCameraTuning} />
      )}

      <aside className={styles.showcase} aria-label={`${spec.name} preview`}>
        <div className={styles.aura} aria-hidden="true" />
        <span className={styles.watermark} aria-hidden="true">
          {theme.label} Ryder
        </span>
        <RyderShowcase ryderId={shown} poseKey={poseKey} />
        <div className={styles.caption}>
          <h3>
            <small>
              {theme.label} Ryder · {spec.role}
            </small>
            {spec.name}
          </h3>
          <div className={styles.equipped}>
            {deck.map((move, i) => (
              <span key={move.id}>
                <b>{INPUT_SLOTS[i]}</b>
                {move.name}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <footer className={styles.hints}>
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> select · <kbd>Esc</kbd> {view === 'root' ? 'resume' : 'back'}
        </span>
        <span>
          {spec.weapon} · {spec.flaw}
        </span>
      </footer>
    </div>
  );
}
