'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RYDERZ, fighterKind, type RyderId } from '@/lib/ryderz-raid/config';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import type { RaidCharacter } from '@/lib/ryderz-raid/roster';
import {
  PREMIERE_CATEGORIES,
  PREMIERE_CATEGORY_LABEL,
  canConfirmFighter,
  charactersInCategory,
  premiereCategory,
  premiereRoster,
  type PremiereCategory,
} from '@/lib/ryderz-raid/roster/premiere';
import { useMenuKeys, wrap } from '../menu/useMenuKeys';
import CharacterLineupStage, { type ModelStatus } from './CharacterLineupStage';
import styles from './premiere.module.css';

const MODE_GAME: Record<'solo' | 'pvp' | 'raid', GameMode> = {
  solo: GameMode.SOLO,
  pvp: GameMode.PVP,
  raid: GameMode.RAID,
};

const COPY: Record<'solo' | 'pvp' | 'raid', string> = {
  solo: 'One fighter. The block is already waiting.',
  pvp: 'Pick each side. The lineup is only a preview — the match rules stay the same.',
  raid: 'Cooperative raid. Confirm your fighter, then set the squad. There is no opposing team.',
};

export default function PremiereCharacterSelect({
  mode,
  initialId,
  onBack,
  onConfirm,
  confirmLabel = 'Confirm Fighter',
  confirmDisabled = false,
  pin,
  onHighlight,
  toolbar,
}: {
  mode: 'solo' | 'pvp' | 'raid';
  initialId?: string | null;
  onBack: () => void;
  onConfirm: (character: RaidCharacter) => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  pin?: { token: number; id: string | null };
  onHighlight?: (character: RaidCharacter) => void;
  toolbar?: React.ReactNode;
}) {
  const roster = useMemo(() => premiereRoster(), []);
  const gameMode = MODE_GAME[mode];
  const initial = roster.find((character) => character.id === initialId || character.ryderId === initialId) ?? null;
  const [category, setCategory] = useState<PremiereCategory>(initial ? premiereCategory(initial) : 'ryderz');
  const [focus, setFocus] = useState(() => {
    const list = charactersInCategory(roster, initial ? premiereCategory(initial) : 'ryderz');
    const index = list.findIndex((character) => character.id === initial?.id);
    return Math.max(0, index);
  });
  const [models, setModels] = useState<Record<string, ModelStatus>>({});
  const [columns, setColumns] = useState(4);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(columns);
  const highlightRef = useRef(onHighlight);
  const confirmRef = useRef<() => void>(() => {});
  const backRef = useRef(onBack);
  const categoryMoveRef = useRef<(step: number) => void>(() => {});
  columnsRef.current = columns;
  highlightRef.current = onHighlight;
  backRef.current = onBack;

  const list = charactersInCategory(roster, category);
  const lineup = useMemo(() => list.filter((character) => character.ryderId), [list]);
  const focused = list[focus] ?? null;
  const ready = Boolean(focused && canConfirmFighter(focused, gameMode) && !confirmDisabled);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const measure = () => setColumns(Math.max(2, Math.floor(node.clientWidth / 112)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [category]);

  useEffect(() => {
    tiles.current[focus]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focus, category]);

  useEffect(() => {
    if (!pin?.id) return;
    const character = roster.find((entry) => entry.id === pin.id);
    if (!character) return;
    const next = premiereCategory(character);
    const nextList = charactersInCategory(roster, next);
    const index = nextList.findIndex((entry) => entry.id === character.id);
    setCategory(next);
    if (index >= 0) setFocus(index);
  }, [pin?.token, pin?.id, roster]);

  useEffect(() => {
    if (focused && canConfirmFighter(focused, gameMode)) highlightRef.current?.(focused);
  }, [focused, gameMode]);

  const confirm = () => {
    if (focused && canConfirmFighter(focused, gameMode) && !confirmDisabled) onConfirm(focused);
  };
  confirmRef.current = confirm;

  const moveCategory = (step: number) => {
    const index = PREMIERE_CATEGORIES.indexOf(category);
    const next = PREMIERE_CATEGORIES[wrap(index + step, PREMIERE_CATEGORIES.length)];
    setCategory(next);
    setFocus(0);
  };
  categoryMoveRef.current = moveCategory;

  useMenuKeys((key) => {
    if (!list.length) {
      if (key === 'back') onBack();
      return key === 'back';
    }
    if (key === 'left') setFocus((index) => wrap(index - 1, list.length));
    else if (key === 'right') setFocus((index) => wrap(index + 1, list.length));
    else if (key === 'up') setFocus((index) => wrap(index - columnsRef.current, list.length));
    else if (key === 'down') setFocus((index) => wrap(index + columnsRef.current, list.length));
    else if (key === 'confirm') confirm();
    else if (key === 'back') onBack();
    else return false;
    return true;
  }, true);

  useEffect(() => {
    const previous = new Array(16).fill(false);
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const pads = navigator.getGamepads?.();
      const pad = pads ? Array.from(pads).find((item) => item && item.connected) : null;
      if (!pad) return;
      const pressed = pad.buttons.map((button) => button.pressed);
      const edge = (index: number) => pressed[index] && !previous[index];
      if (edge(14)) setFocus((index) => wrap(index - 1, list.length));
      if (edge(15)) setFocus((index) => wrap(index + 1, list.length));
      if (edge(12)) setFocus((index) => wrap(index - columnsRef.current, list.length));
      if (edge(13)) setFocus((index) => wrap(index + columnsRef.current, list.length));
      if (edge(4)) categoryMoveRef.current(-1);
      if (edge(5)) categoryMoveRef.current(1);
      if (edge(0)) confirmRef.current();
      if (edge(1)) backRef.current();
      pressed.forEach((value, index) => {
        previous[index] = value;
      });
    };
    raf = requestAnimationFrame(tick);
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'BracketLeft') categoryMoveRef.current(-1);
      if (event.code === 'BracketRight') categoryMoveRef.current(1);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [list.length]);

  const spec = focused?.ryderId ? RYDERZ[focused.ryderId as RyderId] : null;

  return (
    <div className={styles.screen} data-category={category}>
      <div className={styles.stageWrap}>
        <CharacterLineupStage key={category} characters={lineup} selectedId={focused?.id ?? null} category={category} onStatus={setModels} />
        {toolbar ? <div className={styles.stageBar}>{toolbar}</div> : null}
      </div>
      <section className={styles.hud}>
        <div className={styles.top}>
        <div className={styles.tabs} role="tablist" aria-label="Fighter categories">
          {PREMIERE_CATEGORIES.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={id === category} onClick={() => { setCategory(id); setFocus(0); }}>
              {PREMIERE_CATEGORY_LABEL[id]}
            </button>
          ))}
        </div>
        <div className={styles.intro}>
          <div>
            <p>{mode === 'raid' ? 'Those Ryderz · Raid' : mode === 'pvp' ? 'Those Ryderz · PvP' : 'Those Ryderz · Solo'}</p>
            <h2>{PREMIERE_CATEGORY_LABEL[category]}</h2>
          </div>
          <span>{COPY[mode]}</span>
        </div>
        </div>
        <div className={styles.body}>
          <div ref={gridRef} className={styles.grid} role="listbox" aria-label="Fighters">
            {list.map((character, index) => {
              const locked = !canConfirmFighter(character, gameMode);
              const selected = index === focus;
              const model = models[character.id];
              return (
                <button
                  key={character.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={locked}
                  ref={(node) => {
                    tiles.current[index] = node;
                  }}
                  className={`${styles.tile} ${locked ? styles.locked : ''}`}
                  style={{ ['--aura' as string]: character.primaryColor }}
                  onClick={() => {
                    setFocus(index);
                    if (!locked) highlightRef.current?.(character);
                  }}
                  onDoubleClick={() => {
                    setFocus(index);
                    if (!locked) onConfirm(character);
                  }}
                >
                  {character.portrait ? (
                    <img src={character.portrait} alt="" />
                  ) : (
                    <span className={styles.fallback}>{character.name.slice(0, 1)}</span>
                  )}
                  {locked ? <em className={styles.flag}>Locked</em> : model === 'missing' ? <em className={styles.flag}>No model</em> : null}
                  <span className={styles.tileName}>{character.name}</span>
                </button>
              );
            })}
          </div>
          <aside className={styles.details} style={{ ['--aura' as string]: focused?.primaryColor ?? '#fff' }}>
            {focused ? (
              <>
                <small>{focused.universe}</small>
                <h3>{focused.name}</h3>
                <p>{spec ? `${fighterKind(spec)} · ${spec.title}` : 'Not playable yet'}</p>
                {spec ? (
                  <ul>
                    {spec.moves.map((move) => (
                      <li key={move.id}>
                        <span>{move.key}</span>
                        <strong>{move.name}</strong>
                      </li>
                    ))}
                    <li>
                      <span>Vital · Aura</span>
                      <strong>
                        {spec.maxHp} · {spec.maxAura}
                      </strong>
                    </li>
                  </ul>
                ) : (
                  <p>Powers are not in the raid yet. This fighter stays locked.</p>
                )}
                {models[focused.id] === 'missing' ? <p>The model file did not load. The rest of the lineup is still up.</p> : null}
              </>
            ) : (
              <p>No fighters in this category.</p>
            )}
          </aside>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.back} onClick={onBack}>
            Back
          </button>
          <button type="button" className={styles.confirm} disabled={!ready} onClick={confirm}>
            {focused ? `${confirmLabel}` : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
