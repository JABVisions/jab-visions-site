'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RYDERZ,
  RYDER_ORDER,
  UPGRADE_ORDER,
  UPGRADES,
  upgradeCost,
  type RyderId,
  type UpgradeId,
} from '@/lib/ryderz-raid/config';
import type { HudState, RaidEngine } from '@/lib/ryderz-raid/engine';
import styles from './RaidGame.module.css';

const AURA: Record<RyderId, { aura: string; soft: string }> = {
  rubi: { aura: '#ff5c66', soft: 'rgba(255, 48, 64, 0.32)' },
  leo: { aura: '#ffe85c', soft: 'rgba(255, 230, 0, 0.3)' },
  aaron: { aura: '#c9b8ff', soft: 'rgba(123, 77, 255, 0.35)' },
  zoe: { aura: '#66cfff', soft: 'rgba(40, 180, 255, 0.32)' },
  keven: { aura: '#ff68d7', soft: 'rgba(255, 85, 204, 0.32)' },
};

export default function RaidGame({ layout = 'embed' }: { layout?: 'embed' | 'page' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RaidEngine | null>(null);
  const hudRef = useRef<HudState | null>(null);
  const hpFill = useRef<HTMLDivElement>(null);
  const auraFill = useRef<HTMLDivElement>(null);
  const hpLabel = useRef<HTMLSpanElement>(null);
  const auraLabel = useRef<HTMLSpanElement>(null);
  const pointsRef = useRef<HTMLElement>(null);
  const remainingRef = useRef<HTMLElement>(null);
  const roundRef = useRef<HTMLElement>(null);
  const abilityCd = useRef<HTMLSpanElement>(null);
  const nubRef = useRef<HTMLDivElement>(null);
  const lookLast = useRef<{ x: number; y: number; id: number } | null>(null);

  const [selected, setSelected] = useState<RyderId | null>(null);
  const [phase, setPhase] = useState<HudState['phase'] | 'select'>('select');
  const [paused, setPaused] = useState(false);
  const [burnout, setBurnout] = useState(false);
  const [banner, setBanner] = useState<HudState['banner']>(null);
  const [nearShop, setNearShop] = useState(false);
  const [locked, setLocked] = useState(false);
  const [abilityReady, setAbilityReady] = useState(false);
  const [abilityName, setAbilityName] = useState('Ability');
  const [points, setPoints] = useState(0);
  const [upgrades, setUpgrades] = useState<HudState['upgrades']>({
    capacity: 0,
    signal: 0,
    fists: 0,
    vitality: 0,
    siphon: 0,
  });
  const [intermissionLeft, setIntermissionLeft] = useState(0);
  const [coarse, setCoarse] = useState(false);

  const syncHud = useCallback((next: HudState) => {
    const prev = hudRef.current;
    hudRef.current = next;
    if (hpFill.current) hpFill.current.style.width = `${(next.hp / next.maxHp) * 100}%`;
    if (auraFill.current) auraFill.current.style.width = `${(next.aura / next.maxAura) * 100}%`;
    if (hpLabel.current) hpLabel.current.textContent = `${Math.ceil(next.hp)} / ${next.maxHp}`;
    if (auraLabel.current) {
      auraLabel.current.textContent = next.burnout
        ? 'BURNOUT · FISTS ONLY'
        : `${Math.ceil(next.aura)} / ${next.maxAura}`;
    }
    if (pointsRef.current) pointsRef.current.textContent = String(next.points);
    if (remainingRef.current) remainingRef.current.textContent = String(next.remaining);
    if (roundRef.current) roundRef.current.textContent = String(next.round);
    if (abilityCd.current) {
      abilityCd.current.textContent = next.burnout
        ? 'NO AURA'
        : next.abilityDuration > 0
          ? `ACTIVE ${next.abilityDuration.toFixed(1)}s`
          : next.abilityCooldown > 0
            ? `${next.abilityCooldown.toFixed(1)}s`
            : 'E  READY';
    }
    if (
      !prev ||
      prev.phase !== next.phase ||
      prev.paused !== next.paused ||
      prev.burnout !== next.burnout ||
      prev.nearShop !== next.nearShop ||
      prev.pointerLocked !== next.pointerLocked ||
      prev.abilityReady !== next.abilityReady ||
      prev.banner?.title !== next.banner?.title ||
      prev.abilityName !== next.abilityName
    ) {
      setPhase(next.phase);
      setPaused(next.paused);
      setBurnout(next.burnout);
      setNearShop(next.nearShop);
      setLocked(next.pointerLocked);
      setAbilityReady(next.abilityReady);
      setAbilityName(next.abilityName);
      setBanner(next.banner);
      setUpgrades(next.upgrades);
    }
    if (!prev || Math.abs(prev.points - next.points) > 0.5) setPoints(next.points);
    if (!prev || Math.abs(prev.intermissionLeft - next.intermissionLeft) > 0.2) {
      setIntermissionLeft(next.intermissionLeft);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!selected || !canvasRef.current) return;
    let engine: RaidEngine | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    (async () => {
      const { RaidEngine } = await import('@/lib/ryderz-raid/engine');
      if (cancelled || !canvas) return;
      engine = new RaidEngine(canvas, syncHud);
      engineRef.current = engine;
      engine.start(selected);
    })();
    const onResize = () => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      engine?.dispose();
      engineRef.current = null;
    };
  }, [selected, syncHud]);

  const pick = (id: RyderId) => {
    setSelected(id);
    setPhase('playing');
    setPaused(false);
  };

  const changeRyder = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setSelected(null);
    setPhase('select');
    setPaused(false);
    setBanner(null);
    setNearShop(false);
  };

  const resume = () => {
    engineRef.current?.setPaused(false);
    engineRef.current?.requestPointerLock();
  };

  const replay = () => {
    if (!selected) return;
    engineRef.current?.start(selected);
    engineRef.current?.setPaused(false);
  };

  const buy = (id: UpgradeId) => {
    engineRef.current?.buyUpgrade(id);
  };

  const onStick = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const nx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const ny = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const x = Math.max(-1, Math.min(1, nx));
    const z = Math.max(-1, Math.min(1, ny));
    engineRef.current?.setMoveAxis(x, z);
    if (nubRef.current) {
      nubRef.current.style.transform = `translate(calc(-50% + ${x * 28}px), calc(-50% + ${z * 28}px))`;
    }
  };

  const aura = selected ? AURA[selected] : { aura: '#31ff96', soft: 'rgba(49,255,150,0.3)' };
  const playing = Boolean(selected);

  return (
    <div
      className={`${styles.shell} ${layout === 'page' ? styles.page : styles.embed}`}
      style={{ ['--aura' as string]: aura.aura, ['--aura-soft' as string]: aura.soft }}
    >
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${!playing || paused || phase === 'dead' ? styles.paused : ''}`}
        onClick={() => {
          if (playing && phase === 'playing' && !paused) engineRef.current?.requestPointerLock();
        }}
      />

      {playing && phase !== 'dead' && (
        <div className={styles.overlay} aria-hidden="true">
          <div className={styles.topHud}>
            <div className={styles.meterStack}>
              <div className={`${styles.strip} ${styles.hpStrip}`}>
                <span>
                  Vital
                  <em ref={hpLabel}>0 / 0</em>
                </span>
                <div className={styles.track}>
                  <div ref={hpFill} className={`${styles.fill} ${styles.hp}`} />
                </div>
              </div>
              <div className={`${styles.strip} ${styles.auraStrip}`}>
                <span>
                  Aura
                  <em ref={auraLabel}>0 / 0</em>
                </span>
                <div className={styles.track}>
                  <div
                    ref={auraFill}
                    className={`${styles.fill} ${styles.aura} ${burnout ? styles.burned : ''}`}
                  />
                </div>
              </div>
            </div>
            <div className={styles.chips}>
              <div className={styles.chip}>
                Round <strong ref={roundRef}>0</strong>
              </div>
              <div className={styles.chip}>
                Hosts <strong ref={remainingRef}>0</strong>
              </div>
              <div className={styles.chip}>
                Signal pts <strong ref={pointsRef}>0</strong>
              </div>
            </div>
          </div>

          <div className={styles.crosshair} />

          {banner && (
            <div className={styles.banner}>
              <span>{banner.sub}</span>
              <strong>{banner.title}</strong>
            </div>
          )}

          {burnout && <div className={styles.burnout}>Aura empty · melee only · weaker blows</div>}

          <div className={styles.bottomHud}>
            <p className={styles.hint}>
              WASD move · Mouse aim · Click fire · F / RMB melee · E ability · Esc pause
              {phase === 'intermission' ? ' · Hold the spire to buy strength' : ''}
            </p>
            <div className={`${styles.ability} ${abilityReady ? styles.ready : ''}`}>
              <span ref={abilityCd}>E</span>
              <b>{abilityName}</b>
            </div>
          </div>
        </div>
      )}

      <div className={`${styles.touch} ${styles.hiddenTouch}`}>
        {playing && phase === 'playing' && !paused && (
          <>
            <div
              className={styles.stick}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                onStick(e.clientX, e.clientY, e.currentTarget);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  onStick(e.clientX, e.clientY, e.currentTarget);
                }
              }}
              onPointerUp={(e) => {
                engineRef.current?.setMoveAxis(0, 0);
                if (nubRef.current) nubRef.current.style.transform = 'translate(-50%, -50%)';
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            >
              <div ref={nubRef} className={styles.nub} />
            </div>
            <div
              className={styles.look}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                lookLast.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
              }}
              onPointerMove={(e) => {
                const last = lookLast.current;
                if (!last || last.id !== e.pointerId) return;
                engineRef.current?.setLookDelta(e.clientX - last.x, e.clientY - last.y);
                lookLast.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
              }}
              onPointerUp={() => {
                lookLast.current = null;
              }}
            />
            <div className={styles.touchBtns}>
              <button type="button" onPointerDown={() => engineRef.current?.setFireHeld(true)} onPointerUp={() => engineRef.current?.setFireHeld(false)}>
                FIRE
              </button>
              <button type="button" onClick={() => engineRef.current?.queueMelee()}>
                FIST
              </button>
              <button type="button" onClick={() => engineRef.current?.queueAbility()}>
                PWR
              </button>
            </div>
          </>
        )}
      </div>

      {playing && nearShop && (
        <aside className={styles.shop}>
          <h3>Spire Shop · {Math.ceil(intermissionLeft)}s</h3>
          <ul>
            {UPGRADE_ORDER.map((id) => {
              const spec = UPGRADES[id];
              const level = upgrades[id];
              const cost = upgradeCost(id, level);
              const maxed = level >= spec.maxLevel;
              return (
                <li key={id}>
                  <button type="button" disabled={maxed || points < cost} onClick={() => buy(id)}>
                    {spec.name} {maxed ? 'MAX' : `Lv ${level} · ${cost}`}
                    <em>{spec.description}</em>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}

      {playing && phase === 'playing' && !paused && !locked && !coarse && (
        <div className={styles.lock}>
          <button type="button" onClick={() => engineRef.current?.requestPointerLock()}>
            Click to capture aim
          </button>
          <p>Mouse moves the camera. Click to fire. Esc pauses.</p>
        </div>
      )}

      {playing && paused && phase !== 'dead' && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <p>Raid paused</p>
            <h3>Signal held</h3>
            <p>Hosts freeze until you step back onto the block.</p>
            <div className={styles.actions}>
              <button type="button" onClick={resume}>
                Resume
              </button>
              <button type="button" onClick={changeRyder}>
                Change Ryder
              </button>
              {layout === 'embed' && (
                <Link href="/those-ryderz/raid">Fullscreen</Link>
              )}
            </div>
          </div>
        </div>
      )}

      {playing && phase === 'dead' && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <p>Those Ryderz: Raid</p>
            <h3>Signal lost</h3>
            <p>
              The mind-controlled block overran you. Come back with more aura discipline — powers
              drain, and fists are all that is left when the signal runs dry.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={replay}>
                Drop in again
              </button>
              <button type="button" onClick={changeRyder}>
                Change Ryder
              </button>
            </div>
          </div>
        </div>
      )}

      {!playing && (
        <div className={styles.select}>
          <div className={styles.selectInner}>
            <header>
              <p>Those Ryderz: Raid</p>
              <h2>The block is overrun. Pick a Ryder.</h2>
              <span>
                Mind-controlled civilians pour from the alleys. Spend aura on shots and signature
                powers. When the meter hits empty you burn out — no blades, no blink, just weaker
                melee until the signal crawls back.
              </span>
            </header>
            <div className={styles.roster}>
              {RYDER_ORDER.map((id) => {
                const ryder = RYDERZ[id];
                const colors = AURA[id];
                return (
                  <button
                    key={id}
                    type="button"
                    className={styles.card}
                    style={{ ['--aura' as string]: colors.aura, ['--aura-soft' as string]: colors.soft }}
                    onClick={() => pick(id)}
                  >
                    <div className={styles.portrait}>
                      <Image src={ryder.portrait} alt={ryder.name} fill unoptimized sizes="160px" />
                    </div>
                    <small>
                      {ryder.role} · {ryder.title}
                    </small>
                    <h3>{ryder.name}</h3>
                    <p>
                      {ryder.weapon}. {ryder.ability.name}: {ryder.ability.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
