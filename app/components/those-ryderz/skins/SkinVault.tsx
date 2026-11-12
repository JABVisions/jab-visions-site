'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import type { RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { onSkinStatus, peekSkinStatus, skinStatus, type SkinStatus } from '@/lib/ryderz-raid/skins/appearance';
import {
  RARITY_LABEL,
  SKIN_CATEGORIES,
  SKINS,
  collectionById,
  skinsIn,
  type SkinCategory,
  type SkinDef,
} from '@/lib/ryderz-raid/skins/catalog';
import { SKIN_ECONOMY } from '@/lib/ryderz-raid/skins/config';
import { collectionProgress, ownsSkin } from '@/lib/ryderz-raid/skins/wardrobe';
import { useMenuKeys, wrap } from '../menu/useMenuKeys';
import SkinPreview from './SkinPreview';
import styles from './SkinVault.module.css';

type Filter = 'all' | SkinCategory;

const STATUS_NOTE: Record<SkinStatus, string> = {
  default: '',
  ready: '',
  static: 'Needs rigging',
  missing: 'Model pending',
  error: 'Model error',
};

function useManagerState(manager: RyderManager) {
  return useSyncExternalStore(
    (listener) => manager.subscribe(listener),
    () => manager.getState(),
    () => manager.getState(),
  );
}

function useSkinStatuses() {
  const [, bump] = useState(0);
  useEffect(() => onSkinStatus(() => bump((n) => n + 1)), []);
  useEffect(() => {
    SKINS.forEach((skin) => void skinStatus(skin));
  }, []);
}

function Thumb({ skin }: { skin: SkinDef }) {
  const [failed, setFailed] = useState(false);
  if (!skin.thumbnail || failed) {
    return (
      <span className={styles.thumbEmpty} aria-hidden="true">
        <span className={styles.filmMark} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.thumbImg} src={skin.thumbnail} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function FilmBadge({ label }: { label: string }) {
  return (
    <span className={styles.filmBadge}>
      <i aria-hidden="true" />
      {label}
      <i aria-hidden="true" />
    </span>
  );
}

/**
 * The Database's cosmetics screens. Skins is a grid of every look with a
 * turntable and the unlock / equip actions for the focused one. Archives
 * lists collections and how much of each the player owns.
 */
export default function SkinVault({
  manager,
  mode,
  active,
  onBack,
}: {
  manager: RyderManager;
  mode: 'skins' | 'archives';
  active: boolean;
  onBack: () => void;
}) {
  const state = useManagerState(manager);
  useSkinStatuses();
  const wardrobe = state.skins;
  const available = manager.signalAvailable();
  const categories = useMemo(() => SKIN_CATEGORIES.filter((category) => SKINS.some((skin) => skin.category === category.id)), []);
  const [filter, setFilter] = useState<Filter>('movie');
  const list = useMemo(
    () => SKINS.filter((skin) => filter === 'all' || skin.category === filter).sort((a, b) => a.order - b.order),
    [filter],
  );
  const [focus, setFocus] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [flash, setFlash] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const skin = list[Math.min(focus, list.length - 1)] ?? null;

  useEffect(() => setConfirming(null), [skin?.id]);
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(''), 2600);
    return () => window.clearTimeout(timer);
  }, [flash]);
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>(`[data-index="${focus}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focus]);

  const columns = () => {
    const node = grid.current;
    if (!node) return 1;
    return Math.max(1, getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length);
  };

  const owned = skin ? ownsSkin(wardrobe, skin) : false;
  const equipped = skin ? (wardrobe.equipped[skin.ryderId] ?? `${skin.ryderId}_default`) === skin.id : false;
  const check = skin ? manager.canUnlockSkin(skin.id) : null;
  const status = skin ? peekSkinStatus(skin) : null;

  const unlock = () => {
    if (!skin || !check) return;
    if (!check.ok) {
      if (check.reason === 'short') setFlash(`Need ${check.short?.toLocaleString('en-US')} more SP`);
      return;
    }
    if (confirming !== skin.id) {
      setConfirming(skin.id);
      return;
    }
    setConfirming(null);
    if (manager.unlockSkin(skin.id)) setFlash(`${skin.name} unlocked`);
  };

  const equip = () => {
    if (!skin || !owned || equipped) return;
    if (manager.equipSkin(skin.id)) setFlash(`${skin.name} equipped`);
  };

  const primary = () => {
    if (!skin) return;
    if (!owned) unlock();
    else equip();
  };

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setFocus(0);
  };

  useMenuKeys((key) => {
    if (key === 'back') {
      if (confirming) setConfirming(null);
      else onBack();
      return true;
    }
    if (mode !== 'skins') return false;
    const cols = columns();
    if (key === 'left') setFocus((i) => wrap(i - 1, list.length));
    else if (key === 'right') setFocus((i) => wrap(i + 1, list.length));
    else if (key === 'up') setFocus((i) => (i - cols >= 0 ? i - cols : i));
    else if (key === 'down') setFocus((i) => (i + cols < list.length ? i + cols : i));
    else if (key === 'confirm') primary();
    else return false;
    return true;
  }, active);

  if (mode === 'archives') {
    const progress = collectionProgress(wardrobe);
    return (
      <div className={styles.archives}>
        {progress.map(({ collection, owned: have, total }) => (
          <article key={collection.id} className={styles.collection} data-film={collection.badge === 'film'}>
            <header>
              {collection.badge === 'film' && <FilmBadge label="Movie" />}
              <h3>{collection.title}</h3>
              <small>{collection.subtitle}</small>
            </header>
            <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={have} aria-label={`${have} of ${total} owned`}>
              <b style={{ transform: `scaleX(${total ? have / total : 0})` }} />
            </div>
            <p className={styles.progressLabel}>
              {have} of {total} owned
            </p>
            <ul className={styles.collectionSkins}>
              {skinsIn(collection.id).map((entry) => {
                const at = wardrobe.owned[entry.id]?.at;
                return (
                  <li key={entry.id} style={{ ['--skin' as string]: entry.accent }} data-owned={ownsSkin(wardrobe, entry)}>
                    <Thumb skin={entry} />
                    <span>
                      <strong>{entry.name}</strong>
                      <small>{at ? `Unlocked ${new Date(at).toLocaleDateString('en-US')}` : 'Locked'}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
        <section className={styles.categoryList} aria-label="Categories">
          <h4>Categories</h4>
          <ul>
            {SKIN_CATEGORIES.filter((category) => category.id !== 'default').map((category) => {
              const count = SKINS.filter((entry) => entry.category === category.id).length;
              return (
                <li key={category.id} data-empty={count === 0}>
                  <strong>{category.label}</strong>
                  <small>{count ? `${count} skin${count === 1 ? '' : 's'}` : 'No releases yet'}</small>
                </li>
              );
            })}
          </ul>
        </section>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  const collection = collectionById(skin?.collection);

  return (
    <div className={styles.vault}>
      <div className={styles.browse}>
        <nav className={styles.filters} aria-label="Skin categories">
          {(['all', ...categories.map((category) => category.id)] as Filter[]).map((id) => (
            <button key={id} type="button" aria-pressed={filter === id} className={styles.filter} onClick={() => changeFilter(id)}>
              {id === 'all' ? 'All' : SKIN_CATEGORIES.find((category) => category.id === id)?.label}
            </button>
          ))}
        </nav>
        <div ref={grid} className={styles.grid} role="listbox" aria-label="Skins">
          {list.map((entry, i) => {
            const have = ownsSkin(wardrobe, entry);
            const worn = (wardrobe.equipped[entry.ryderId] ?? `${entry.ryderId}_default`) === entry.id;
            const note = STATUS_NOTE[peekSkinStatus(entry) ?? 'default'];
            const pack = collectionById(entry.collection);
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={i === focus}
                data-index={i}
                className={styles.tile}
                data-state={worn ? 'equipped' : have ? 'unlocked' : 'locked'}
                style={{ ['--skin' as string]: entry.accent }}
                onClick={() => setFocus(i)}
                onDoubleClick={() => {
                  setFocus(i);
                  if (have && !worn) manager.equipSkin(entry.id);
                }}
              >
                <span className={styles.tileArt}>
                  <Thumb skin={entry} />
                  {pack?.badge === 'film' && <FilmBadge label="Movie" />}
                  {note && <em className={styles.tileFlag}>{note}</em>}
                </span>
                <span className={styles.tileText}>
                  <strong>{entry.name}</strong>
                  <small>{pack ? pack.title.replace(/^THOSE RYDERZ: /, '') : RARITY_LABEL[entry.rarity]}</small>
                </span>
                <span className={styles.tileState}>
                  {worn ? 'Equipped' : have ? 'Unlocked' : entry.unlock.kind === 'signal' ? `${entry.unlock.cost.toLocaleString('en-US')} SP` : 'Locked'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {skin && (
        <article className={styles.detail} style={{ ['--skin' as string]: skin.accent }} aria-live="polite">
          <SkinPreview skin={skin} />
          <header className={styles.detailHead}>
            {collection?.badge === 'film' && <FilmBadge label={collection.title} />}
            <h3>{skin.name}</h3>
            <p className={styles.detailMeta}>
              {RYDERZ[skin.ryderId].name} · {RARITY_LABEL[skin.rarity]} · {SKIN_CATEGORIES.find((category) => category.id === skin.category)?.label}
            </p>
          </header>
          <p className={styles.detailText}>{skin.description}</p>
          {status === 'static' && (
            <p className={styles.warn}>This scan has no skeleton yet. Until a rigged file replaces it, the Ryder plays in their default model while this skin is equipped.</p>
          )}
          {status === 'missing' && <p className={styles.warn}>The model file has not been added yet. It can be unlocked and equipped now and will appear once the file is in place.</p>}
          <dl className={styles.requirements}>
            <div>
              <dt>Unlock</dt>
              <dd>{skin.unlock.kind === 'default' ? 'Included' : skin.unlock.kind === 'signal' ? `${skin.unlock.cost.toLocaleString('en-US')} Signal Points` : skin.unlock.label}</dd>
            </div>
            <div>
              <dt>Your balance</dt>
              <dd>{available.toLocaleString('en-US')} SP</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            {!owned && skin.unlock.kind === 'signal' && (
              <button type="button" className={styles.primary} data-confirm={confirming === skin.id} disabled={!check?.ok} onClick={unlock}>
                {confirming === skin.id ? `Confirm · spend ${skin.unlock.cost.toLocaleString('en-US')} SP` : check?.ok ? `Unlock · ${skin.unlock.cost.toLocaleString('en-US')} SP` : `Need ${check && !check.ok && check.short ? check.short.toLocaleString('en-US') : skin.unlock.cost.toLocaleString('en-US')} more SP`}
              </button>
            )}
            {owned && (
              <button type="button" className={styles.primary} disabled={equipped} onClick={equip}>
                {equipped ? 'Equipped' : 'Equip'}
              </button>
            )}
            {!owned && SKIN_ECONOMY.testUnlock && skin.unlock.kind !== 'default' && (
              <button type="button" className={styles.secondary} onClick={() => manager.grantSkin(skin.id) && setFlash(`${skin.name} unlocked (test)`)}>
                Test unlock
              </button>
            )}
            <button type="button" className={styles.secondary} onClick={onBack}>
              Back
            </button>
          </div>
          {flash && (
            <p className={styles.flash} role="status">
              {flash}
            </p>
          )}
        </article>
      )}
    </div>
  );
}

