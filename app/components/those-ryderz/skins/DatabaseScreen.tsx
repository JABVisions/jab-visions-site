'use client';

import type { RyderId } from '@/lib/ryderz-raid/config';
import type { RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import DatabasePanel from '../menu/DatabasePanel';
import { RYDER_THEME } from '../menu/theme';
import styles from './SkinVault.module.css';

const noop = () => {};

/** The Database opened from the start screen, outside a raid. Opens on Skins. */
export default function DatabaseScreen({ manager, activeRyder, onBack }: { manager: RyderManager; activeRyder: RyderId; onBack: () => void }) {
  const theme = RYDER_THEME[activeRyder];
  return (
    <div
      className={styles.screen}
      role="dialog"
      aria-modal="true"
      aria-label="Database"
      style={{ ['--aura' as string]: theme.aura, ['--aura-soft' as string]: theme.soft }}
    >
      <DatabasePanel manager={manager} activeRyder={activeRyder} active initialTab="skins" onPreview={noop} onBack={onBack} />
    </div>
  );
}
