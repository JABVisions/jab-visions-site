'use client';

import { Lock } from 'lucide-react';
import { useState } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { INPUT_SLOTS, type InputSlot, type RyderAbility, type RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { useMenuKeys, wrap } from './useMenuKeys';
import styles from './PauseMenu.module.css';

/**
 * Assign unlocked powers to Q / E / R for one Ryder. Up/Down picks a slot,
 * Right moves into the power list, Enter equips, Esc steps back out.
 */
export default function PowerDeck({
  manager,
  ryderId,
  active,
  onBack,
}: {
  manager: RyderManager;
  ryderId: RyderId;
  active: boolean;
  onBack: () => void;
}) {
  const [slot, setSlot] = useState<InputSlot>('Q');
  const [column, setColumn] = useState<'slots' | 'pool'>('slots');
  const [poolIndex, setPoolIndex] = useState(0);

  const deck = manager.loadout(ryderId);
  const pool = manager.abilityPool(ryderId);
  const spec = RYDERZ[ryderId];
  const poolColumns = 2;

  const equip = (ability: RyderAbility) => {
    if (!ability.unlocked) return;
    manager.equip(ryderId, slot, ability.id);
  };

  useMenuKeys((key) => {
    if (key === 'back') {
      if (column === 'pool') {
        setColumn('slots');
        return true;
      }
      onBack();
      return true;
    }
    if (column === 'slots') {
      if (key === 'up' || key === 'down') {
        const i = INPUT_SLOTS.indexOf(slot);
        setSlot(INPUT_SLOTS[wrap(i + (key === 'down' ? 1 : -1), INPUT_SLOTS.length)]);
        return true;
      }
      if (key === 'right' || key === 'confirm') {
        setColumn('pool');
        setPoolIndex(Math.max(0, pool.findIndex((p) => p.inputSlot === slot)));
        return true;
      }
      return false;
    }
    if (key === 'up' || key === 'down') {
      setPoolIndex((i) => wrap(i + (key === 'down' ? poolColumns : -poolColumns), pool.length));
      return true;
    }
    if (key === 'left') {
      if (poolIndex % poolColumns === 0) setColumn('slots');
      else setPoolIndex((i) => i - 1);
      return true;
    }
    if (key === 'right') {
      setPoolIndex((i) => wrap(i + 1, pool.length));
      return true;
    }
    if (key === 'confirm') {
      equip(pool[poolIndex]);
      return true;
    }
    return false;
  }, active);

  return (
    <section className={styles.panel} aria-label="Power Deck">
      <header className={styles.panelHead}>
        <p className={styles.eyebrow}>Power Deck · {spec.name}</p>
        <h2>Loadout</h2>
        <p>
          Bind powers to Q, E and R. {spec.name.split(' ')[0]} keeps this deck when you switch Ryderz and picks it
          back up when you return.
        </p>
      </header>

      <div className={styles.deck}>
        <div className={styles.slots}>
          {INPUT_SLOTS.map((key) => {
            const ability = pool.find((p) => p.id === deck[key]);
            return (
              <button
                key={key}
                type="button"
                className={`${styles.slot} ${slot === key ? styles.slotActive : ''}`}
                onMouseEnter={() => {
                  setSlot(key);
                  setColumn('slots');
                }}
                onClick={() => {
                  setSlot(key);
                  setColumn('pool');
                }}
                aria-pressed={slot === key}
              >
                <span className={styles.slotKey}>{key}</span>
                <strong>{ability?.name ?? 'Empty'}</strong>
                <em>{ability?.description}</em>
              </button>
            );
          })}
          <button type="button" className={styles.ghostBtn} onClick={() => manager.resetLoadout(ryderId)}>
            Reset to signature kit
          </button>
        </div>

        <div className={styles.scroll}>
          <div className={styles.poolHead}>
            <p className={styles.eyebrow}>Available powers · slot {slot}</p>
            <p className={styles.eyebrow} style={{ color: 'rgba(229,246,234,0.45)' }}>
              {pool.filter((p) => p.unlocked).length} / {pool.length} unlocked
            </p>
          </div>
          <div className={styles.pool} role="listbox" aria-label={`Powers for slot ${slot}`}>
            {pool.map((ability, i) => (
              <button
                key={ability.id}
                type="button"
                role="option"
                aria-selected={column === 'pool' && poolIndex === i}
                disabled={!ability.unlocked}
                className={[
                  styles.power,
                  column === 'pool' && poolIndex === i ? styles.powerFocused : '',
                  ability.inputSlot ? styles.powerEquipped : '',
                  ability.unlocked ? '' : styles.powerLocked,
                ].join(' ')}
                onMouseEnter={() => {
                  setColumn('pool');
                  setPoolIndex(i);
                }}
                onClick={() => equip(ability)}
                title={ability.description}
              >
                <span className={styles.sigil}>{ability.unlocked ? ability.icon : <Lock size={14} />}</span>
                <strong>{ability.name}</strong>
                <span>
                  {ability.drain > 0 ? `${ability.drain}/s drain` : `${ability.auraCost} aura`}
                  {ability.owner !== ryderId && <>· {RYDERZ[ability.owner].name.split(' ')[0]}</>}
                </span>
                {ability.inputSlot && <span className={styles.tag}>{ability.inputSlot}</span>}
                {!ability.unlocked && <span className={`${styles.tag} ${styles.tagMuted}`}>Locked</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
