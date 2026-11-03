'use client';

import { Check, Lock } from 'lucide-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { BRANCH_LABEL, POWER_BRANCHES, type NodeEffect, type PowerBranch, type StatKey } from '@/lib/ryderz-raid/progression/power-tree';
import { levelProgress } from '@/lib/ryderz-raid/progression/signal-points';
import { type InputSlot, type PowerNodeView, type RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { useMenuKeys, wrap } from './useMenuKeys';
import menu from './PauseMenu.module.css';
import styles from './PowerTreePanel.module.css';

const STAT_LABEL: Record<StatKey, string> = {
  meleeDamage: 'melee damage',
  heavyDamage: 'heavy damage',
  launchPower: 'launch height',
  aerialDamage: 'aerial damage',
  finisherDamage: 'finisher damage',
  maxHp: 'maximum health',
  maxAura: 'maximum aura',
  auraRegen: 'aura regen',
  dodgeCooldown: 'dodge cooldown',
  guard: 'guard strength',
  abilityCost: 'power cost',
  comboWindow: 'combo window',
  knockback: 'knockback',
  hitStunResist: 'hit-stun resistance',
};

const BRANCH_BLURB: Record<PowerBranch, string> = {
  combat: 'Fists, launchers, aerials, finishers',
  powers: 'Canonical kit, costs, and new powers',
  defense: 'Health, footwork, guard, second wind',
  ultimate: 'Extra deck slots and the ultimate',
};

function describeEffect(effect: NodeEffect): string {
  switch (effect.kind) {
    case 'ability':
      return 'Grants a power for the deck';
    case 'stat': {
      const pct = effect.stat === 'maxHp' || effect.stat === 'maxAura';
      const value = pct ? `${effect.value > 0 ? '+' : ''}${effect.value}` : `${effect.value > 0 ? '+' : ''}${Math.round(effect.value * 100)}%`;
      return `${value} ${STAT_LABEL[effect.stat]}`;
    }
    case 'combo':
      return `New combo · ${effect.recipe.sequence.map((step) => step.toUpperCase()).join(' › ')}`;
    case 'slot':
      return `Opens power slot ${effect.slot}`;
    case 'passive':
      return 'Passive';
  }
}

/**
 * The Power Tree: four branches side by side, nodes ordered by tier. Left and
 * Right change branch, Up and Down walk the branch, Enter buys the focused
 * node or binds an owned power to a slot. Works as a pause-menu screen and as
 * the in-raid overlay the deck's Power Tree button opens.
 */
export default function PowerTreePanel({
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

  const spec = RYDERZ[ryderId];
  const nodes = manager.treeView(ryderId);
  const ledger = manager.signal();
  const available = manager.signalAvailable();
  const level = manager.level();
  const progress = levelProgress(ledger.earned).progress;
  const openSlots = manager.slotsFor(ryderId);

  const columns = useMemo(
    () =>
      POWER_BRANCHES.map((branch) => ({
        branch,
        nodes: nodes.filter((node) => node.branch === branch).sort((a, b) => a.tier - b.tier || a.cost - b.cost),
      })),
    [nodes],
  );

  const [column, setColumn] = useState(0);
  const [row, setRow] = useState(0);
  const [picking, setPicking] = useState(false);
  const [pickIndex, setPickIndex] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const focusedColumn = columns[column];
  const focused: PowerNodeView | undefined = focusedColumn?.nodes[Math.min(row, Math.max(0, focusedColumn.nodes.length - 1))];
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const unlock = (node: PowerNodeView) => {
    const ok = manager.unlockNode(ryderId, node.id);
    setFlash(ok ? `${node.name} unlocked` : node.check.reason === 'poor' ? 'Not enough Signal Points' : 'Locked');
  };

  const equipTo = (node: PowerNodeView, slot: InputSlot) => {
    if (node.effect.kind !== 'ability') return;
    const ok = manager.equip(ryderId, slot, node.effect.abilityId);
    setFlash(ok ? `${node.name} bound to ${slot}` : 'Could not bind');
    setPicking(false);
  };

  const activate = (node: PowerNodeView | undefined) => {
    if (!node) return;
    if (!node.owned) {
      unlock(node);
      return;
    }
    if (node.effect.kind === 'ability') {
      setPicking(true);
      setPickIndex(Math.max(0, openSlots.indexOf(node.equippedIn ?? 'Q')));
    }
  };

  useMenuKeys((key) => {
    if (picking) {
      if (key === 'back') {
        setPicking(false);
        return true;
      }
      if (key === 'left' || key === 'up') setPickIndex((i) => wrap(i - 1, openSlots.length));
      else if (key === 'right' || key === 'down') setPickIndex((i) => wrap(i + 1, openSlots.length));
      else if (key === 'confirm' && focused) equipTo(focused, openSlots[pickIndex]);
      return true;
    }
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'left' || key === 'right') {
      const next = wrap(column + (key === 'right' ? 1 : -1), columns.length);
      setColumn(next);
      setRow((r) => Math.min(r, Math.max(0, columns[next].nodes.length - 1)));
      return true;
    }
    if (key === 'up' || key === 'down') {
      const length = focusedColumn?.nodes.length ?? 0;
      setRow((r) => wrap(r + (key === 'down' ? 1 : -1), length));
      return true;
    }
    if (key === 'confirm') {
      activate(focused);
      return true;
    }
    return false;
  }, active);

  return (
    <section className={`${menu.panel} ${styles.tree}`} aria-label="Power Tree">
      <header className={`${menu.panelHead} ${styles.head}`}>
        <div>
          <p className={menu.eyebrow}>Power Tree · {spec.name}</p>
          <h2>Signal Points</h2>
          <p>
            Spend Signal Points earned in raids. Unlocking a power adds it to the pool; your Q, E and R stay as they are until you bind it.
          </p>
        </div>
        <div className={styles.wallet} aria-live="polite">
          <strong>{available.toLocaleString('en-US')} SP</strong>
          <span>
            LV {level} · {ledger.earned.toLocaleString('en-US')} earned · {ledger.spent.toLocaleString('en-US')} spent
          </span>
          <i>
            <b style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
          </i>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.branches} role="grid" aria-label="Branches">
          {columns.map((col, ci) => (
            <div key={col.branch} className={`${styles.branch} ${ci === column ? styles.branchActive : ''}`} role="row" data-branch={col.branch}>
              <h3>
                {BRANCH_LABEL[col.branch]}
                <small>{BRANCH_BLURB[col.branch]}</small>
              </h3>
              <ol>
                {col.nodes.map((node, ri) => {
                  const isFocused = ci === column && ri === Math.min(row, col.nodes.length - 1);
                  const state = node.owned ? 'owned' : node.check.ok ? 'open' : node.check.reason === 'poor' ? 'poor' : 'locked';
                  return (
                    <li key={node.id}>
                      <button
                        type="button"
                        role="gridcell"
                        className={`${styles.node} ${isFocused ? styles.nodeFocused : ''}`}
                        data-state={state}
                        aria-selected={isFocused}
                        onMouseEnter={() => {
                          setColumn(ci);
                          setRow(ri);
                        }}
                        onClick={() => {
                          setColumn(ci);
                          setRow(ri);
                          activate(node);
                        }}
                        title={node.description}
                      >
                        <span className={styles.tier}>T{node.tier}</span>
                        <strong>{node.name}</strong>
                        <em>
                          {node.owned ? (
                            <>
                              <Check size={11} /> {node.equippedIn ? `Bound · ${node.equippedIn}` : node.starter ? 'Starter' : 'Owned'}
                            </>
                          ) : state === 'locked' ? (
                            <>
                              <Lock size={11} /> {node.cost.toLocaleString('en-US')} SP
                            </>
                          ) : (
                            `${node.cost.toLocaleString('en-US')} SP`
                          )}
                        </em>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>

        <aside className={styles.detail} aria-live="polite">
          {focused ? (
            <>
              <p className={menu.eyebrow}>
                {BRANCH_LABEL[focused.branch]} · Tier {focused.tier}
              </p>
              <h3>{focused.name}</h3>
              <p className={styles.blurb}>{focused.description}</p>
              <p className={styles.effect}>{describeEffect(focused.effect)}</p>
              {focused.requires.length > 0 && (
                <p className={styles.requires}>
                  Requires{' '}
                  {focused.requires.map((req, i) => {
                    const dep = byId.get(req);
                    return (
                      <span key={req} data-met={dep?.owned ? 'true' : 'false'}>
                        {i > 0 ? ', ' : ''}
                        {dep?.name ?? req}
                      </span>
                    );
                  })}
                </p>
              )}
              {picking && focused.effect.kind === 'ability' ? (
                <div className={styles.picker} role="radiogroup" aria-label="Bind to slot">
                  <span>Bind to</span>
                  {openSlots.map((slot, i) => (
                    <button
                      key={slot}
                      type="button"
                      role="radio"
                      aria-checked={i === pickIndex}
                      className={`${styles.pick} ${i === pickIndex ? styles.pickFocused : ''}`}
                      onMouseEnter={() => setPickIndex(i)}
                      onClick={() => equipTo(focused, slot)}
                    >
                      {slot}
                    </button>
                  ))}
                  <button type="button" className={menu.ghostBtn} onClick={() => setPicking(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.actions}>
                  {focused.owned ? (
                    focused.effect.kind === 'ability' ? (
                      <button type="button" className={menu.ghostBtn} onClick={() => activate(focused)}>
                        {focused.equippedIn ? `Rebind (on ${focused.equippedIn})` : 'Bind to a slot'}
                      </button>
                    ) : (
                      <span className={styles.owned}>Owned</span>
                    )
                  ) : (
                    <button type="button" className={`${menu.ghostBtn} ${styles.buy}`} disabled={!focused.check.ok} onClick={() => unlock(focused)}>
                      {focused.check.ok
                        ? `Unlock · ${focused.cost.toLocaleString('en-US')} SP`
                        : focused.check.reason === 'poor'
                          ? `Need ${(focused.cost - available).toLocaleString('en-US')} more SP`
                          : 'Locked'}
                    </button>
                  )}
                </div>
              )}
              {flash && <p className={styles.flash}>{flash}</p>}
            </>
          ) : null}
          <button type="button" className={`${menu.ghostBtn} ${styles.back}`} onClick={onBack}>
            Back
          </button>
        </aside>
      </div>
    </section>
  );
}
