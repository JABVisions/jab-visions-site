'use client';

import { ArrowUpFromLine, Check, Footprints, Heart, HeartPulse, LayoutGrid, Link2, Lock, Magnet, Shield, Sparkles, Swords, Wind, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { DERIVED_POWERS, derivedAtRank, isDerivedAbility, rankScaling } from '@/lib/ryderz-raid/progression/derived-powers';
import { POWER_TYPES, POWER_TYPE_COLOR, POWER_TYPE_LABEL } from '@/lib/ryderz-raid/progression/power-types';
import { BRANCH_BLURB, BRANCH_LABEL, POWER_BRANCHES, rankCapAt, type NodeEffect, type StatKey } from '@/lib/ryderz-raid/progression/power-tree';
import { layoutBranch, type PlacedNode } from '@/lib/ryderz-raid/progression/tree-layout';
import { levelProgress } from '@/lib/ryderz-raid/progression/signal-points';
import { ABILITIES, INPUT_SLOTS, type InputSlot, type PowerNodeView, type RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import PowerIcon from '../icons/PowerIcon';
import { useMenuKeys, wrap } from './useMenuKeys';
import menu from './PauseMenu.module.css';
import styles from './PowerTreePanel.module.css';

const STAT_LABEL: Record<StatKey, string> = {
  meleeDamage: 'Melee damage',
  heavyDamage: 'Heavy damage',
  launchPower: 'Launch height',
  aerialDamage: 'Aerial damage',
  finisherDamage: 'Finisher damage',
  maxHp: 'Max health',
  maxAura: 'Max aura',
  auraRegen: 'Aura regen',
  dodgeCooldown: 'Dodge recovery',
  guard: 'Guard',
  abilityCost: 'Power cost',
  comboWindow: 'Combo window',
  knockback: 'Knockback',
  hitStunResist: 'Hit-stun resist',
  pickupRadius: 'Orb magnet',
};

const STAT_ICON: Record<StatKey, ReactNode> = {
  meleeDamage: <Swords size={18} />,
  heavyDamage: <Swords size={18} />,
  launchPower: <ArrowUpFromLine size={18} />,
  aerialDamage: <Wind size={18} />,
  finisherDamage: <Swords size={18} />,
  maxHp: <Heart size={18} />,
  maxAura: <Zap size={18} />,
  auraRegen: <Zap size={18} />,
  dodgeCooldown: <Footprints size={18} />,
  guard: <Shield size={18} />,
  abilityCost: <Sparkles size={18} />,
  comboWindow: <Link2 size={18} />,
  knockback: <Swords size={18} />,
  hitStunResist: <Shield size={18} />,
  pickupRadius: <Magnet size={18} />,
};

/** Row height of the tree diagram, px. Nodes sit on row centres. */
const ROW_H = 98;
/** Card width, px; keep in step with `.node` in the stylesheet. */
const NODE_W = 88;

/** How long the pointer rests on a card before the detail panel switches to it. */
const HOVER_INTENT_MS = 180;

const SKILL_COLOR = 'rgba(229, 246, 234, 0.75)';

function nodeColor(node: PowerNodeView) {
  return node.type ? POWER_TYPE_COLOR[node.type] : SKILL_COLOR;
}

function nodeGlyph(node: PowerNodeView): ReactNode {
  const effect = node.effect;
  switch (effect.kind) {
    case 'ability':
      return <PowerIcon id={effect.abilityId} size={24} />;
    case 'stat':
      return STAT_ICON[effect.stat];
    case 'combo':
      return <Link2 size={18} />;
    case 'slot':
      return <LayoutGrid size={18} />;
    case 'passive':
      return <HeartPulse size={18} />;
  }
}

function signed(value: number, pct: boolean, unit = '') {
  const v = pct ? Math.round(value * 100) : Math.round(value);
  return `${v > 0 ? '+' : ''}${v}${pct ? '%' : unit}`;
}

/** Stats that read as flat amounts instead of percentages, with their unit. */
const FLAT_STATS: Partial<Record<StatKey, string>> = { maxHp: '', maxAura: '', pickupRadius: ' m' };

function describeEffect(effect: NodeEffect): string {
  switch (effect.kind) {
    case 'ability':
      return 'A power for the deck. Rank it up to hit harder for less aura.';
    case 'stat':
      return `${signed(effect.value, !(effect.stat in FLAT_STATS), FLAT_STATS[effect.stat])} ${STAT_LABEL[effect.stat].toLowerCase()} per rank`;
    case 'combo':
      return `New combo · ${effect.recipe.sequence.map((step) => step.toUpperCase()).join(' › ')}`;
    case 'slot':
      return `Opens power slot ${effect.slot}`;
    case 'passive':
      return 'Passive · always on';
  }
}

interface StatLine {
  label: string;
  now: string;
  next: string | null;
}

/** What a node does at its current rank and the rank after it. */
function rankLines(node: PowerNodeView): StatLine[] {
  const rank = Math.max(1, node.rank);
  const next = node.rank > 0 && node.rank < node.maxRank ? node.rank + 1 : null;
  const effect = node.effect;
  if (effect.kind === 'stat') {
    const pct = !(effect.stat in FLAT_STATS);
    const unit = FLAT_STATS[effect.stat];
    return [{ label: STAT_LABEL[effect.stat], now: signed(effect.value * rank, pct, unit), next: next ? signed(effect.value * next, pct, unit) : null }];
  }
  if (effect.kind !== 'ability') return [];
  const id = effect.abilityId;
  if (isDerivedAbility(id)) {
    const spec = DERIVED_POWERS[id];
    const a = derivedAtRank(spec, rank);
    const b = next ? derivedAtRank(spec, next) : null;
    const lines: StatLine[] = [
      { label: 'Damage', now: `×${a.damageMul.toFixed(2)}`, next: b ? `×${b.damageMul.toFixed(2)}` : null },
      { label: 'Aura cost', now: `${a.auraCost}`, next: b ? `${b.auraCost}` : null },
    ];
    if (spec.radius > 0) lines.push({ label: 'Reach', now: `${a.radius.toFixed(1)} m`, next: b ? `${b.radius.toFixed(1)} m` : null });
    if (spec.duration > 0) lines.push({ label: spec.kind === 'snare' ? 'Hold' : 'Duration', now: `${a.duration.toFixed(1)} s`, next: b ? `${b.duration.toFixed(1)} s` : null });
    if (spec.count > 0) lines.push({ label: 'Bolts', now: `${a.count}`, next: b ? `${b.count}` : null });
    return lines;
  }
  const spec = ABILITIES[id];
  const a = rankScaling(rank);
  const b = next ? rankScaling(next) : null;
  const lines: StatLine[] = [{ label: 'Damage', now: `×${a.damage.toFixed(2)}`, next: b ? `×${b.damage.toFixed(2)}` : null }];
  if (spec.auraCost > 0) lines.push({ label: 'Aura cost', now: `${Math.round(spec.auraCost * a.cost)}`, next: b ? `${Math.round(spec.auraCost * b.cost)}` : null });
  if (spec.drain > 0) lines.push({ label: 'Drain', now: `${spec.drain}/s`, next: null });
  return lines;
}

type Zone = 'tree' | 'actions';
type Action = 'buy' | 'bind';

/** Rows of the action zone for a node: rank-up while ranks remain, then slot binding for owned powers. */
function actionRowsFor(node: PowerNodeView): Action[] {
  const out: Action[] = [];
  if (!node.owned || node.upgrade.reason !== 'max') out.push('buy');
  if (node.owned && node.effect.kind === 'ability') out.push('bind');
  return out;
}

/**
 * The Power Tree, X-Men Legends style. Four pages — Powers, Combat, Defense,
 * Signal — each drawn as a tree with connectors between prerequisites. Every
 * node has a rank; the Powers page colours each power by its type. D-pad
 * walks the tree (Left / Right at a row's edge turns the page, Q / E or the
 * bumpers turn it directly), Enter buys rank 1 or the next rank, and an owned
 * power's Enter opens its rank-up and slot-binding actions. 1–6 bind the
 * focused power straight to that slot.
 */
export default function PowerTreePanel({ manager, ryderId, active, onBack }: { manager: RyderManager; ryderId: RyderId; active: boolean; onBack: () => void }) {
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

  const pages = useMemo(
    () =>
      POWER_BRANCHES.map((branch) => ({
        branch,
        layout: layoutBranch(nodes.filter((node) => node.branch === branch)),
      })),
    [nodes],
  );
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const [page, setPage] = useState(0);
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [zone, setZone] = useState<Zone>('tree');
  const [actionRow, setActionRow] = useState(0);
  const [slotIndex, setSlotIndex] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const current = pages[page];
  const rows = current.layout.rows;
  const safeRow = Math.min(row, Math.max(0, rows.length - 1));
  const safeCol = Math.min(col, Math.max(0, (rows[safeRow]?.length ?? 1) - 1));
  const focused: PowerNodeView | undefined = rows[safeRow]?.[safeCol]?.node;

  const focusNode = (pageIndex: number, r: number, c: number) => {
    setPage(pageIndex);
    setRow(r);
    setCol(c);
    setZone('tree');
  };

  // Hover previews a card only once the pointer rests on it, so gliding across
  // the tree to the bind buttons does not swap the panel to every card passed.
  const hoverTimer = useRef<number | null>(null);
  const cancelHover = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  useEffect(() => cancelHover, []);
  const hoverNode = (r: number, c: number) => {
    cancelHover();
    if (zone === 'actions') return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      focusNode(page, r, c);
    }, HOVER_INTENT_MS);
  };

  const say = (message: string) => setFlash(message);

  const reasonText = (node: PowerNodeView) => {
    if (!node.owned) {
      switch (node.check.reason) {
        case 'locked':
          return `Requires ${node.check.missing.map((id) => byId.get(id)?.name ?? id).join(' and ')}`;
        case 'level':
          return `Reach LV ${node.minLevel} first`;
        case 'poor':
          return `Need ${(node.cost - available).toLocaleString('en-US')} more SP`;
        default:
          return 'Locked';
      }
    }
    switch (node.upgrade.reason) {
      case 'max':
        return `${node.name} is at max rank`;
      case 'level':
        return `Rank ${node.upgrade.nextRank} opens at LV ${node.upgrade.levelNeeded}`;
      case 'poor':
        return `Need ${(node.upgrade.cost - available).toLocaleString('en-US')} more SP`;
      default:
        return 'Locked';
    }
  };

  const buy = (node: PowerNodeView) => {
    if (!node.owned) {
      const ok = manager.unlockNode(ryderId, node.id);
      say(ok ? `${node.name} learned` : reasonText(node));
      return ok;
    }
    const ok = manager.upgradeNode(ryderId, node.id);
    say(ok ? `${node.name} · rank ${node.upgrade.nextRank}` : reasonText(node));
    return ok;
  };

  const bind = useCallback(
    (node: PowerNodeView, slot: InputSlot) => {
      if (node.effect.kind !== 'ability' || !node.owned) return;
      const ability = node.effect.abilityId;
      if (!manager.equip(ryderId, slot, ability)) {
        const from = node.equippedIn;
        setFlash(from ? `Slot ${from} needs another power before ${node.name} can move` : `Slot ${slot} is not open`);
        return;
      }
      const landed = INPUT_SLOTS.find((key) => manager.loadout(ryderId)[key] === ability) ?? slot;
      setFlash(landed === slot ? `${node.name} bound to ${slot}` : `${node.name} bound to ${landed} · ${landed} fills before ${slot}`);
    },
    [manager, ryderId],
  );

  const actionRows = focused ? actionRowsFor(focused) : [];
  const safeAction = Math.min(actionRow, Math.max(0, actionRows.length - 1));

  const activate = (node: PowerNodeView | undefined) => {
    if (!node) return;
    if (!node.owned || node.effect.kind !== 'ability') {
      buy(node);
      return;
    }
    const actions = actionRowsFor(node);
    setZone('actions');
    setActionRow(actions.includes('buy') && node.upgrade.ok ? 0 : actions.indexOf('bind'));
    setSlotIndex(Math.max(0, openSlots.indexOf(node.equippedIn ?? openSlots[0])));
  };

  const turnPage = (delta: number) => {
    const next = wrap(page + delta, pages.length);
    const nextRows = pages[next].layout.rows;
    const r = Math.min(safeRow, Math.max(0, nextRows.length - 1));
    const c = delta > 0 ? 0 : Math.max(0, (nextRows[r]?.length ?? 1) - 1);
    focusNode(next, r, c);
  };

  useMenuKeys((key) => {
    if (zone === 'actions' && focused) {
      if (key === 'back') {
        setZone('tree');
        return true;
      }
      if (key === 'up' || key === 'down') {
        setActionRow((i) => wrap(i + (key === 'down' ? 1 : -1), actionRows.length));
        return true;
      }
      if (key === 'left' || key === 'right') {
        if (actionRows[safeAction] === 'bind') setSlotIndex((i) => wrap(i + (key === 'right' ? 1 : -1), openSlots.length));
        return true;
      }
      if (key === 'confirm') {
        if (actionRows[safeAction] === 'bind') bind(focused, openSlots[slotIndex]);
        else buy(focused);
        return true;
      }
      if (key === 'prev' || key === 'next') {
        setZone('tree');
        turnPage(key === 'next' ? 1 : -1);
        return true;
      }
      return true;
    }
    if (key === 'back') {
      onBack();
      return true;
    }
    if (key === 'prev' || key === 'next') {
      turnPage(key === 'next' ? 1 : -1);
      return true;
    }
    if (key === 'left' || key === 'right') {
      const length = rows[safeRow]?.length ?? 0;
      const next = safeCol + (key === 'right' ? 1 : -1);
      if (next < 0 || next >= length) turnPage(key === 'right' ? 1 : -1);
      else setCol(next);
      return true;
    }
    if (key === 'up' || key === 'down') {
      const r = wrap(safeRow + (key === 'down' ? 1 : -1), rows.length);
      // Keep the column under the cursor: pick the node whose x is nearest.
      const x = rows[safeRow]?.[safeCol]?.x ?? 0.5;
      let best = 0;
      rows[r]?.forEach((p, i) => {
        if (Math.abs(p.x - x) < Math.abs((rows[r][best]?.x ?? 0) - x)) best = i;
      });
      setRow(r);
      setCol(best);
      return true;
    }
    if (key === 'confirm') {
      activate(focused);
      return true;
    }
    return false;
  }, active);

  // 1–6 bind the focused owned power to that slot without leaving the tree.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const match = /^Digit([1-6])$/.exec(event.code);
      if (!match || !focused || !focused.owned || focused.effect.kind !== 'ability') return;
      const slot = match[1] as InputSlot;
      event.preventDefault();
      event.stopPropagation();
      if (!openSlots.includes(slot)) {
        setFlash(`Slot ${slot} is not open yet`);
        return;
      }
      bind(focused, slot);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [active, focused, openSlots, bind]);

  // Keep the focused card in view when the stage scrolls (narrow centre column, wide row).
  useEffect(() => {
    if (!focused) return;
    document.querySelector<HTMLElement>(`[data-node-id="${focused.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focused]);

  const rankCap = rankCapAt(level);
  const lines = focused ? rankLines(focused) : [];

  const buyLabel = (node: PowerNodeView) => {
    if (!node.owned) {
      if (node.check.ok) return `Learn · ${node.cost.toLocaleString('en-US')} SP`;
      if (node.check.reason === 'level') return `Reach LV ${node.minLevel}`;
      if (node.check.reason === 'poor') return `Learn · ${node.cost.toLocaleString('en-US')} SP`;
      return 'Locked';
    }
    if (node.upgrade.reason === 'max') return 'Max rank';
    if (node.upgrade.reason === 'level') return `Rank ${node.upgrade.nextRank} at LV ${node.upgrade.levelNeeded}`;
    return `Rank ${node.upgrade.nextRank} · ${node.upgrade.cost.toLocaleString('en-US')} SP`;
  };

  const canBuy = (node: PowerNodeView) => (node.owned ? node.upgrade.ok : node.check.ok);

  return (
    <section className={`${menu.panel} ${styles.tree}`} aria-label="Power Tree">
      <header className={`${menu.panelHead} ${styles.head}`}>
        <div>
          <p className={menu.eyebrow}>Power Tree · {spec.name}</p>
          <h2>{BRANCH_LABEL[current.branch]}</h2>
          <p>{BRANCH_BLURB[current.branch]}</p>
        </div>
        <div className={styles.wallet} aria-live="polite">
          <strong>{available.toLocaleString('en-US')} SP</strong>
          <span>
            LV {level} · rank cap {rankCap} · {ledger.earned.toLocaleString('en-US')} earned
          </span>
          <i>
            <b style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
          </i>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          <nav className={styles.tabs} aria-label="Tree pages">
            <span className={styles.tabKey} aria-hidden="true">
              Q
            </span>
            {pages.map((entry, i) => {
              const owned = entry.layout.rows.flat().filter((p) => p.node.owned).length;
              const total = entry.layout.rows.flat().length;
              return (
                <button
                  key={entry.branch}
                  type="button"
                  className={`${styles.tab} ${i === page ? styles.tabActive : ''}`}
                  aria-current={i === page ? 'page' : undefined}
                  onClick={() => focusNode(i, 0, 0)}
                >
                  {BRANCH_LABEL[entry.branch]}
                  <small>
                    {owned}/{total}
                  </small>
                </button>
              );
            })}
            <span className={styles.tabKey} aria-hidden="true">
              E
            </span>
          </nav>
          {current.branch === 'powers' && (
            <ul className={styles.legend} aria-label="Power types">
              {POWER_TYPES.map((type) => (
                <li key={type} style={{ '--type': POWER_TYPE_COLOR[type] } as CSSProperties}>
                  {POWER_TYPE_LABEL[type]}
                </li>
              ))}
            </ul>
          )}
          <TreeDiagram
            rows={rows}
            edges={current.layout.edges}
            byId={current.layout.byId}
            focusedId={focused?.id ?? null}
            dimmed={zone === 'actions'}
            onHover={hoverNode}
            onHoverEnd={cancelHover}
            onActivate={(node, r, c) => {
              cancelHover();
              focusNode(page, r, c);
              activate(node);
            }}
          />
        </div>

        <aside className={`${styles.detail} ${zone === 'actions' ? styles.detailActive : ''}`} aria-live="polite" onMouseEnter={cancelHover}>
          {focused ? (
            <>
              <div className={styles.info}>
                <p className={styles.kind} style={{ '--type': nodeColor(focused) } as CSSProperties}>
                  <i />
                  {focused.type ? POWER_TYPE_LABEL[focused.type] : BRANCH_LABEL[focused.branch]} · Tier {focused.tier}
                </p>
                <h3>
                  {focused.effect.kind === 'ability' ? <PowerIcon id={focused.effect.abilityId} size={26} /> : null}
                  {focused.name}
                </h3>
                <div className={styles.rankRow}>
                  <Pips rank={focused.rank} max={focused.maxRank} color={nodeColor(focused)} large />
                  <span>{focused.rank > 0 ? `Rank ${focused.rank} / ${focused.maxRank}` : focused.maxRank > 1 ? `Not learned · ${focused.maxRank} ranks` : 'Not learned'}</span>
                </div>
                <p className={styles.blurb}>{focused.description}</p>
                <p className={styles.effect}>{describeEffect(focused.effect)}</p>
                {focused.requires.length > 0 && (
                  <p className={styles.requires}>
                    Requires{' '}
                    {focused.requires.map((req, i) => {
                      const dep = byId.get(req);
                      return (
                        <span key={req} data-met={dep?.owned ? 'true' : 'false'}>
                          {i > 0 ? ' + ' : ''}
                          {dep?.name ?? req}
                        </span>
                      );
                    })}
                  </p>
                )}
                {!focused.owned && focused.minLevel > 0 && (
                  <p className={styles.requires}>
                    <span data-met={level >= focused.minLevel ? 'true' : 'false'}>Level {focused.minLevel}</span>
                  </p>
                )}
              </div>
              <div className={styles.acts}>
                {lines.length > 0 && (
                  <table className={styles.stats}>
                    <thead>
                      <tr>
                        <th scope="col">{focused.rank > 0 ? `Rank ${focused.rank}` : 'Rank 1'}</th>
                        <th scope="col">{focused.rank > 0 && focused.rank < focused.maxRank ? 'Now' : ''}</th>
                        <th scope="col">{focused.rank > 0 && focused.rank < focused.maxRank ? `Rank ${focused.rank + 1}` : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.label}>
                          <th scope="row">{line.label}</th>
                          <td>{line.now}</td>
                          <td data-next={line.next ? 'true' : undefined}>{line.next ? `› ${line.next}` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className={styles.actions}>
                  {actionRows.includes('buy') && (
                    <button
                      type="button"
                      className={`${menu.ghostBtn} ${styles.buy} ${zone === 'actions' && actionRows[safeAction] === 'buy' ? styles.actionFocused : ''}`}
                      data-ready={canBuy(focused) ? 'true' : undefined}
                      disabled={!canBuy(focused)}
                      onClick={() => buy(focused)}
                    >
                      {buyLabel(focused)}
                    </button>
                  )}
                  {focused.owned && focused.upgrade.reason === 'max' && <span className={styles.owned}>Max rank</span>}
                  {actionRows.includes('bind') && (
                    <div className={`${styles.binder} ${zone === 'actions' && actionRows[safeAction] === 'bind' ? styles.binderFocused : ''}`} role="radiogroup" aria-label="Bind to slot">
                      <span>{focused.equippedIn ? `On ${focused.equippedIn}` : 'Bind'}</span>
                      {INPUT_SLOTS.map((slot) => {
                        const open = openSlots.includes(slot);
                        const i = openSlots.indexOf(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            role="radio"
                            aria-checked={focused.equippedIn === slot}
                            disabled={!open}
                            className={`${styles.slot} ${zone === 'actions' && actionRows[safeAction] === 'bind' && i === slotIndex ? styles.slotFocused : ''}`}
                            data-bound={focused.equippedIn === slot ? 'true' : undefined}
                            onMouseEnter={() => open && setSlotIndex(i)}
                            onClick={() => bind(focused, slot)}
                            title={open ? `Bind to ${slot}` : `Slot ${slot} is locked`}
                          >
                            {open ? slot : <Lock size={10} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {flash && <p className={styles.flash}>{flash}</p>}
              </div>
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

function Pips({ rank, max, color, large = false }: { rank: number; max: number; color: string; large?: boolean }) {
  return (
    <i className={`${styles.pips} ${large ? styles.pipsLarge : ''}`} style={{ '--type': color } as CSSProperties} aria-label={`Rank ${rank} of ${max}`}>
      {Array.from({ length: max }, (_, k) => (
        <b key={k} data-on={k < rank ? 'true' : undefined} />
      ))}
    </i>
  );
}

function TreeDiagram({
  rows,
  edges,
  byId,
  focusedId,
  dimmed,
  onHover,
  onHoverEnd,
  onActivate,
}: {
  rows: PlacedNode<PowerNodeView>[][];
  edges: { from: string; to: string }[];
  byId: Map<string, PlacedNode<PowerNodeView>>;
  focusedId: string | null;
  dimmed: boolean;
  onHover: (row: number, col: number) => void;
  onHoverEnd: () => void;
  onActivate: (node: PowerNodeView, row: number, col: number) => void;
}) {
  const height = rows.length * ROW_H;
  // Evenly spaced centres sit 1/(n+1) apart, so the row has to be (n+1) cards wide or neighbours overlap. The stage scrolls past that.
  const widest = Math.max(1, ...rows.map((placed) => placed.length));
  const minWidth = (widest + 1) * (NODE_W + 10);
  return (
    <div className={`${styles.diagram} ${dimmed ? styles.diagramDimmed : ''}`} style={{ height, minWidth }} role="grid" aria-label="Tree">
      <svg className={styles.wires} viewBox={`0 0 100 ${rows.length * 100}`} preserveAspectRatio="none" aria-hidden="true">
        {edges.map((edge) => {
          const a = byId.get(edge.from);
          const b = byId.get(edge.to);
          if (!a || !b) return null;
          const ax = a.x * 100;
          const ay = a.row * 100 + 50;
          const bx = b.x * 100;
          const by = b.row * 100 + 50;
          const mid = ay + (by - ay) * 0.55;
          const lit = a.node.owned && b.node.owned ? 'on' : a.node.owned ? 'open' : 'off';
          return <path key={`${edge.from}-${edge.to}`} d={`M${ax} ${ay} V${mid} H${bx} V${by}`} data-lit={lit} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      {rows.map((placed, r) =>
        placed.map((p, c) => {
          const node = p.node;
          const state = node.owned ? (node.upgrade.ok ? 'rankable' : 'owned') : node.check.ok ? 'open' : node.check.reason === 'poor' ? 'poor' : node.check.reason === 'level' ? 'level' : 'locked';
          const tag = node.owned
            ? node.equippedIn
              ? `Slot ${node.equippedIn}`
              : node.rank >= node.maxRank
                ? 'MAX'
                : node.starter && node.rank === 1
                  ? 'Starter'
                  : `Rank ${node.rank}`
            : state === 'level'
              ? `LV ${node.minLevel}`
              : `${node.cost.toLocaleString('en-US')} SP`;
          const isFocused = node.id === focusedId;
          return (
            <button
              key={node.id}
              type="button"
              role="gridcell"
              className={`${styles.node} ${isFocused ? styles.nodeFocused : ''}`}
              data-state={state}
              data-node-id={node.id}
              aria-selected={isFocused}
              style={{ left: `${p.x * 100}%`, top: (r + 0.5) * ROW_H, '--type': nodeColor(node) } as CSSProperties}
              onMouseEnter={() => onHover(r, c)}
              onMouseMove={() => onHover(r, c)}
              onMouseLeave={onHoverEnd}
              onClick={() => onActivate(node, r, c)}
              title={node.description}
            >
              <span className={styles.badge}>
                {nodeGlyph(node)}
                {!node.owned && !node.check.ok && (
                  <i className={styles.lock}>
                    <Lock size={10} />
                  </i>
                )}
                {node.owned && node.equippedIn && (
                  <i className={styles.bound}>
                    <Check size={9} />
                  </i>
                )}
              </span>
              <strong>{node.name}</strong>
              <Pips rank={node.rank} max={node.maxRank} color={nodeColor(node)} />
              <em>{tag}</em>
            </button>
          );
        }),
      )}
    </div>
  );
}
