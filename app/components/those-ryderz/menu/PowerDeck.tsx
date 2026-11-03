'use client';

import { Lock } from 'lucide-react';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { INPUT_SLOTS, type InputSlot, type RyderAbility, type RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { useMenuKeys, wrap } from './useMenuKeys';
import styles from './PauseMenu.module.css';

/**
 * Assign unlocked powers to Q / E / R and any slot the Power Tree has opened
 * for one Ryder. Left/Right picks a slot, Down moves into the power list,
 * Enter equips, Esc steps back out. Closed slots show their lock.
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
  const subscribe = useCallback((listener: () => void) => manager.subscribe(listener), [manager]);
  const getSnapshot = useCallback(() => manager.getState(), [manager]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [slot, setSlot] = useState<InputSlot>('Q');
  const [column, setColumn] = useState<'slots' | 'pool'>('slots');
  const [poolIndex, setPoolIndex] = useState(0);

  const deck = manager.loadout(ryderId);
  const pool = manager.abilityPool(ryderId);
  const open = manager.slotsFor(ryderId);
  const tree = manager.tree(ryderId);
  const spec = RYDERZ[ryderId];
  const poolColumns = 3;

  const slotNode = (key: InputSlot) => tree.nodes.find((node) => node.effect.kind === 'slot' && node.effect.slot === key);

  const equip = (ability: RyderAbility) => {
    if (!ability.unlocked || !open.includes(slot)) return;
    manager.equip(ryderId, slot, ability.id);
  };

  const clear = (key: InputSlot) => {
    if (key === '4' || key === '5') manager.unequip(ryderId, key);
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
      if (key === 'left' || key === 'right') {
        const i = open.indexOf(slot);
        setSlot(open[wrap(i + (key === 'right' ? 1 : -1), open.length)]);
        return true;
      }
      if (key === 'down' || key === 'confirm') {
        setColumn('pool');
        setPoolIndex(Math.max(0, pool.findIndex((p) => p.inputSlot === slot)));
        return true;
      }
      return key === 'up';
    }
    if (key === 'up') {
      if (poolIndex < poolColumns) setColumn('slots');
      else setPoolIndex((i) => i - poolColumns);
      return true;
    }
    if (key === 'down') {
      setPoolIndex((i) => Math.min(pool.length - 1, i + poolColumns));
      return true;
    }
    if (key === 'left' || key === 'right') {
      setPoolIndex((i) => wrap(i + (key === 'right' ? 1 : -1), pool.length));
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
          Bind powers to Q, E and R{open.length > 3 ? `, plus slot${open.length > 4 ? 's' : ''} ${open.slice(3).join(' and ')}` : ''}.{' '}
          {spec.name.split(' ')[0]} keeps this deck when you switch Ryderz and picks it back up when you return. Extra slots open on the Power Tree.
        </p>
      </header>

      <div className={styles.deck}>
        <div className={styles.slots} style={{ gridTemplateColumns: `repeat(${INPUT_SLOTS.length}, minmax(0, 1fr))` }}>
          {INPUT_SLOTS.map((key) => {
            const ability = pool.find((p) => p.id === deck[key]);
            const isOpen = open.includes(key);
            const node = isOpen ? undefined : slotNode(key);
            return (
              <button
                key={key}
                type="button"
                className={`${styles.slot} ${slot === key ? styles.slotActive : ''} ${isOpen ? '' : styles.powerLocked}`}
                disabled={!isOpen}
                onMouseEnter={() => {
                  if (!isOpen) return;
                  setSlot(key);
                  setColumn('slots');
                }}
                onClick={() => {
                  if (!isOpen) return;
                  setSlot(key);
                  setColumn('pool');
                }}
                aria-pressed={slot === key}
                title={isOpen ? undefined : `Open on the Power Tree${node ? ` · ${node.name} · ${node.cost} SP` : ''}`}
              >
                <span className={styles.slotKey}>{isOpen ? key : <Lock size={16} />}</span>
                <strong>{isOpen ? (ability?.name ?? 'Empty') : 'Locked'}</strong>
                <em>{isOpen ? ability?.description : node ? `${node.name} · ${node.cost} SP on the tree` : 'Open on the Power Tree'}</em>
              </button>
            );
          })}
        </div>

        <div className={styles.scroll}>
          <div className={styles.poolHead}>
            <p className={styles.eyebrow}>Available powers · slot {slot}</p>
            <p className={styles.eyebrow} style={{ color: 'rgba(229,246,234,0.45)' }}>
              {pool.filter((p) => p.unlocked).length} / {pool.length} unlocked
            </p>
            {(slot === '4' || slot === '5') && deck[slot] ? (
              <button type="button" className={styles.ghostBtn} onClick={() => clear(slot)}>
                Clear slot {slot}
              </button>
            ) : null}
            <button type="button" className={styles.ghostBtn} onClick={() => manager.resetLoadout(ryderId)}>
              Reset deck
            </button>
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
                  {ability.derived && <>· Tree</>}
                </span>
                {ability.inputSlot && <span className={styles.tag}>{ability.inputSlot}</span>}
                {!ability.unlocked && <span className={`${styles.tag} ${styles.tagMuted}`}>{ability.derived ? 'Tree' : 'Locked'}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
