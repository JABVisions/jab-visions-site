'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  INTERACT_LABEL,
  UPGRADE_ORDER,
  UPGRADES,
  upgradeCost,
  type RyderId,
  type UpgradeId,
} from '@/lib/ryderz-raid/config';
import type { CameraState } from '@/lib/ryderz-raid/camera';
import type { HudState, RaidEngine } from '@/lib/ryderz-raid/engine';
import { GameMode } from '@/lib/ryderz-raid/game-mode';
import { PlayerStore } from '@/lib/ryderz-raid/multiplayer';
import { RyderManager } from '@/lib/ryderz-raid/ryder-manager';
import { SaveManager } from '@/lib/ryderz-raid/saves/saveManager';
import CameraTuningPanel, { loadStoredCameraConfig } from './CameraTuningPanel';
import CircularPlayerHUD, { type CircularHudApi } from './hud/CircularPlayerHUD';
import PlayerPartyHUD, { type PartyHudApi } from './hud/PlayerPartyHUD';
import PvpVersusHUD from './hud/PvpVersusHUD';
import LowHealthVignette, { type LowHealthVignetteApi } from './hud/LowHealthVignette';
import PauseMenu from './menu/PauseMenu';
import RaidLobby, { type RaidSeat } from './modes/RaidLobby';
import PvpFlow, { type PvpLineup } from './modes/PvpFlow';
import SoloCharacterSelect from './modes/SoloCharacterSelect';
import { NEUTRAL_THEME, RYDER_THEME as AURA } from './menu/theme';
import RyderzStartScreen from './start/RyderzStartScreen';
import styles from './RaidGame.module.css';

export default function RaidGame({ layout = 'embed' }: { layout?: 'embed' | 'page' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RaidEngine | null>(null);
  const hudRef = useRef<HudState | null>(null);
  const circularHud = useRef<CircularHudApi>(null);
  const foeHud = useRef<CircularHudApi>(null);
  const vignette = useRef<LowHealthVignetteApi>(null);
  const partyHud = useRef<PartyHudApi | null>(null);
  const pvpRef = useRef<PvpLineup | null>(null);
  const pointsRef = useRef<HTMLElement>(null);
  const remainingRef = useRef<HTMLElement>(null);
  const roundRef = useRef<HTMLElement>(null);
  const moveStatus = useRef<Array<HTMLSpanElement | null>>([null, null, null]);
  const nubRef = useRef<HTMLDivElement>(null);
  const lookLast = useRef<{ x: number; y: number; id: number } | null>(null);

  // `selected` is the Ryder the raid booted with (it owns the engine's lifetime);
  // the Ryder currently in play lives in the RyderManager and can change mid-raid.
  const [selected, setSelected] = useState<RyderId | null>(null);
  const [screen, setScreen] = useState<'start' | 'solo-select' | 'pvp' | 'raid-lobby' | 'game'>('start');
  const [pvpOpponent, setPvpOpponent] = useState<RyderId | null>(null);
  const [pvpLabel, setPvpLabel] = useState('CPU');
  const [pvpTwo, setPvpTwo] = useState(false);
  const manager = useMemo(() => new RyderManager(), []);
  const playerStore = useMemo(() => new PlayerStore(), []);
  const saves = useMemo(() => new SaveManager(), []);
  const subscribe = useCallback((listener: () => void) => manager.subscribe(listener), [manager]);
  const getSnapshot = useCallback(() => manager.getState(), [manager]);
  const managerState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const subscribeSaves = useCallback((listener: () => void) => saves.subscribe(listener), [saves]);
  const getSaves = useCallback(() => saves.getState(), [saves]);
  const saveState = useSyncExternalStore(subscribeSaves, getSaves, getSaves);
  const subscribePlayers = useCallback((listener: () => void) => playerStore.subscribe(listener), [playerStore]);
  const getPlayers = useCallback(() => playerStore.getState(), [playerStore]);
  const partyState = useSyncExternalStore(subscribePlayers, getPlayers, getPlayers);
  const activeRyder = managerState.activeRyder;
  const [hudMoves, setHudMoves] = useState<HudState['moves']>([]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<HudState['phase'] | 'select'>('select');
  const [paused, setPaused] = useState(false);
  const [burnout, setBurnout] = useState(false);
  const [banner, setBanner] = useState<HudState['banner']>(null);
  const [nearShop, setNearShop] = useState(false);
  const [beacon, setBeacon] = useState<HudState['beacon']>(null);
  const [recovering, setRecovering] = useState(false);
  const beaconCooldown = useRef<HTMLSpanElement>(null);
  const beaconTrack = useRef<HTMLElement>(null);
  const [locked, setLocked] = useState(false);
  const [moveReady, setMoveReady] = useState([false, false, false]);
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
  const [camPanel, setCamPanel] = useState(false);
  const [cameraState, setCameraState] = useState<CameraState>('EXPLORATION');
  const [engineReady, setEngineReady] = useState<RaidEngine | null>(null);

  const syncHud = useCallback((next: HudState) => {
    const prev = hudRef.current;
    hudRef.current = next;
    circularHud.current?.setVitals(next.hp, next.maxHp, next.aura, next.maxAura, next.burnout);
    vignette.current?.setHealth(next.hp, next.maxHp);
    if (next.opponent) {
      foeHud.current?.setVitals(next.opponent.hp, next.opponent.maxHp, next.opponent.aura, next.opponent.maxAura, next.opponent.aura <= 1);
    }
    partyHud.current?.setLocalVitals(next.hp, next.maxHp, next.aura, next.maxAura, next.hp > 0);
    playerStore.syncLocalVitals({
      health: next.hp,
      maxHealth: next.maxHp,
      aura: next.aura,
      maxAura: next.maxAura,
      isAlive: next.hp > 0,
    });
    if (pointsRef.current) pointsRef.current.textContent = String(next.points);
    if (next.beacon && beaconCooldown.current) {
      beaconCooldown.current.textContent = `${Math.ceil(next.beacon.cooldownLeft)}s`;
    }
    if (next.beacon && beaconTrack.current) {
      const frac = next.beacon.cooldownDuration > 0 ? 1 - next.beacon.cooldownLeft / next.beacon.cooldownDuration : 1;
      beaconTrack.current.style.width = `${Math.round(frac * 100)}%`;
    }
    if (remainingRef.current) remainingRef.current.textContent = String(next.remaining);
    if (roundRef.current) roundRef.current.textContent = String(next.round);
    next.moves.forEach((move, i) => {
      const el = moveStatus.current[i];
      if (!el) return;
      el.textContent = next.burnout
        ? 'NO AURA'
        : move.duration > 0
          ? 'ON'
          : move.ready
            ? `${move.key}  READY`
            : 'LOW';
    });
    if (
      !prev ||
      prev.phase !== next.phase ||
      prev.paused !== next.paused ||
      prev.burnout !== next.burnout ||
      prev.nearShop !== next.nearShop ||
      prev.recovering !== next.recovering ||
      (prev.beacon?.near ?? false) !== (next.beacon?.near ?? false) ||
      (prev.beacon?.ready ?? false) !== (next.beacon?.ready ?? false) ||
      (prev.beacon?.recharging ?? false) !== (next.beacon?.recharging ?? false) ||
      prev.pointerLocked !== next.pointerLocked ||
      prev.banner?.title !== next.banner?.title ||
      prev.moves.length !== next.moves.length ||
      prev.moves.some((m, i) => m.ready !== next.moves[i]?.ready || m.id !== next.moves[i]?.id)
    ) {
      setPhase(next.phase);
      setHudMoves(next.moves);
      setPaused(next.paused);
      setBurnout(next.burnout);
      setNearShop(next.nearShop);
      setBeacon(next.beacon);
      setRecovering(next.recovering);
      setLocked(next.pointerLocked);
      setMoveReady(next.moves.map((m) => m.ready));
      setBanner(next.banner);
      setUpgrades(next.upgrades);
    }
    if (!prev || prev.cameraState !== next.cameraState) setCameraState(next.cameraState);
    if (!prev || Math.abs(prev.points - next.points) > 0.5) setPoints(next.points);
    if (!prev || prev.round !== next.round) setRound(next.round);
    if (!prev || Math.abs(prev.intermissionLeft - next.intermissionLeft) > 0.2) {
      setIntermissionLeft(next.intermissionLeft);
    }
  }, [playerStore]);

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
      manager.attach(engine);
      engine.setPvpSetup(
        pvpRef.current
          ? { opponentId: pvpRef.current.opponent, localTwoPlayer: pvpRef.current.type === 'localTwoPlayer' }
          : null,
      );
      const stored = loadStoredCameraConfig();
      if (stored) engine.setCameraConfig(stored);
      setEngineReady(engine);
      await engine.start(selected, manager.loadoutSpecs(selected));
      if (cancelled) {
        engine.dispose();
        if (engineRef.current === engine) engineRef.current = null;
      }
    })();
    const onResize = () => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      if (engine) manager.detach(engine);
      engine?.dispose();
      engineRef.current = null;
      setEngineReady(null);
    };
  }, [selected, syncHud, manager]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTuneMode(camPanel);
    if (camPanel && document.pointerLockElement) document.exitPointerLock();
    if (!camPanel) engine.setCameraPreviewState(null);
  }, [camPanel, engineReady]);

  const boot = (id: RyderId) => {
    manager.setActiveRyder(id);
    saves.saveGame(manager);
    setSelected(id);
    setScreen('game');
    setPhase('playing');
    setPaused(false);
  };

  const playSolo = (id: RyderId) => {
    pvpRef.current = null;
    setPvpOpponent(null);
    setPvpTwo(false);
    manager.setGameMode(GameMode.SOLO);
    playerStore.configure({ mode: GameMode.SOLO, localRyder: id });
    boot(id);
  };

  const playPvp = (lineup: PvpLineup) => {
    pvpRef.current = lineup;
    setPvpOpponent(lineup.opponent);
    setPvpLabel(lineup.type === 'localTwoPlayer' ? 'P2' : 'CPU');
    setPvpTwo(lineup.type === 'localTwoPlayer');
    manager.setGameMode(GameMode.PVP);
    playerStore.configure({ mode: GameMode.PVP, localRyder: lineup.player });
    boot(lineup.player);
  };

  const playRaid = (seats: RaidSeat[]) => {
    const host = seats.find((seat) => seat.isLocal) ?? seats[0];
    const ryder = host?.character?.ryderId;
    if (!ryder) return;
    pvpRef.current = null;
    setPvpOpponent(null);
    setPvpTwo(false);
    manager.setGameMode(GameMode.RAID);
    playerStore.configure({
      mode: GameMode.RAID,
      localRyder: ryder,
      seats: seats.map((seat) => ({
        index: seat.index,
        displayName: seat.displayName,
        ryderId: seat.character?.ryderId ?? null,
        isLocal: seat.isLocal,
      })),
    });
    boot(ryder);
  };

  useEffect(() => {
    if (screen !== 'game') return;
    const isScrollKey = (e: KeyboardEvent) =>
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'Space' ||
      e.code === 'PageUp' ||
      e.code === 'PageDown' ||
      e.code === 'Home' ||
      e.code === 'End';
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Backquote') {
        e.preventDefault();
        setCamPanel((open) => !open);
        return;
      }
      if (isScrollKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [screen]);

  const changeRyder = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setCamPanel(false);
    setSelected(null);
    const mode = manager.getState().gameMode;
    setScreen(mode === GameMode.PVP ? 'pvp' : mode === GameMode.RAID ? 'raid-lobby' : 'solo-select');
    setPhase('select');
    setPaused(false);
    setBanner(null);
    setNearShop(false);
    setBeacon(null);
    setRecovering(false);
  };

  const exitToStart = () => {
    changeRyder();
    setScreen('start');
  };

  const resume = () => {
    engineRef.current?.setPaused(false);
    engineRef.current?.requestPointerLock();
  };

  const replay = () => {
    if (!selected) return;
    void engineRef.current?.start(activeRyder, manager.loadoutSpecs(activeRyder));
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

  const aura = selected ? AURA[activeRyder] : NEUTRAL_THEME;
  const playing = screen === 'game' && Boolean(selected);

  return (
    <div
      className={`${styles.shell} ${layout === 'page' ? styles.page : styles.embed}`}
      style={{ ['--aura' as string]: aura.aura, ['--aura-soft' as string]: aura.soft }}
    >
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${!playing || paused || phase === 'dead' || phase === 'victory' ? styles.paused : ''}`}
        onClick={() => {
          if (playing && phase === 'playing' && !paused) engineRef.current?.requestPointerLock();
        }}
      />

      {playing && phase !== 'dead' && phase !== 'victory' && (
        <div className={styles.overlay} aria-hidden="true">
          <LowHealthVignette ref={vignette} />
          <div className={styles.topHud}>
            {partyState.mode === GameMode.RAID ? (
              <PlayerPartyHUD slots={partyState.slots} mode={partyState.mode} apiRef={partyHud} />
            ) : null}
            <div className={styles.chips}>
              {partyState.mode !== GameMode.PVP ? (
                <>
                  <div className={styles.chip}>
                    Round <strong ref={roundRef}>0</strong>
                  </div>
                  <div className={styles.chip}>
                    Hosts <strong ref={remainingRef}>0</strong>
                  </div>
                  <div className={styles.chip}>
                    Signal pts <strong ref={pointsRef}>0</strong>
                  </div>
                </>
              ) : null}
              <div className={styles.chip}>
                Mode <strong>{partyState.mode}</strong>
              </div>
              <button
                type="button"
                className={`${styles.chip} ${styles.chipBtn} ${camPanel ? styles.chipOn : ''}`}
                onClick={() => setCamPanel((open) => !open)}
                title="Camera tuning (dev) · `"
              >
                Cam <strong>{cameraState}</strong>
              </button>
            </div>
          </div>

          {partyState.mode === GameMode.PVP && pvpOpponent ? (
            <PvpVersusHUD
              playerId={activeRyder}
              opponentId={pvpOpponent}
              opponentLabel={pvpLabel}
              playerRef={circularHud}
              opponentRef={foeHud}
              burnout={burnout}
            />
          ) : (
            <div className={styles.vitalDock}>
              <CircularPlayerHUD ref={circularHud} ryderId={activeRyder} burnout={burnout} />
            </div>
          )}

          <div className={styles.crosshair} />

          {banner && (
            <div className={styles.banner}>
              <span>{banner.sub}</span>
              <strong>{banner.title}</strong>
            </div>
          )}

          {burnout && !recovering && <div className={styles.burnout}>Aura empty · melee only · weaker blows</div>}

          {recovering && <div className={styles.recovering} />}

          {beacon?.near && !recovering && (
            <div className={`${styles.beacon} ${beacon.ready ? '' : styles.beaconCooling}`}>
              <strong>Ryder Beacon</strong>
              <span>Restore Health</span>
              <span>Restore Power</span>
              {beacon.ready ? (
                <em>{INTERACT_LABEL} · Activate</em>
              ) : (
                <>
                  <em>
                    Recharging · <span ref={beaconCooldown}>{Math.ceil(beacon.cooldownLeft)}s</span>
                  </em>
                  <div className={styles.beaconTrack}>
                    <i ref={beaconTrack} />
                  </div>
                </>
              )}
            </div>
          )}

          <div className={styles.bottomHud}>
            <p className={styles.hint}>
              Arrows move · WASD camera · Shift sprint · Mouse aim · Click fire · F / RMB melee · Q E R moves · {INTERACT_LABEL} use · Esc pause
              {phase === 'intermission' ? ' · Hold the spire to buy strength' : ''}
              {pvpTwo ? ' · P2 IJKL move · U punch' : ''}
            </p>
            <div className={styles.moveRow}>
              {hudMoves.map((move, i) => (
                <div
                  key={`${move.key}-${move.id}`}
                  className={`${styles.ability} ${moveReady[i] ? styles.ready : ''}`}
                >
                  <span
                    ref={(node) => {
                      moveStatus.current[i] = node;
                    }}
                  >
                    {move.key}
                  </span>
                  <b>{move.name}</b>
                </div>
              ))}
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
              <button type="button" onClick={() => engineRef.current?.queueAbility(0)}>
                Q
              </button>
              <button type="button" onClick={() => engineRef.current?.queueAbility(1)}>
                E
              </button>
              <button type="button" onClick={() => engineRef.current?.queueAbility(2)}>
                R
              </button>
              {beacon?.near && beacon.ready && (
                <button type="button" onClick={() => engineRef.current?.queueInteract()}>
                  USE
                </button>
              )}
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

      {playing && camPanel && phase !== 'dead' && (
        <CameraTuningPanel
          engine={engineReady}
          liveState={cameraState}
          onClose={() => setCamPanel(false)}
        />
      )}

      {playing && phase === 'playing' && !paused && !locked && !coarse && !camPanel && (
        <div className={styles.lock}>
          <button type="button" onClick={() => engineRef.current?.requestPointerLock()}>
            Click to capture aim
          </button>
          <p>Mouse or WASD moves the camera. Arrows move. Click to fire. Esc pauses.</p>
        </div>
      )}

      {playing && paused && phase !== 'dead' && phase !== 'victory' && !camPanel && (
        <PauseMenu
          manager={manager}
          engine={engineReady}
          activeRyder={activeRyder}
          gameMode={managerState.gameMode}
          arenaId={managerState.arenaId}
          round={round}
          points={points}
          layout={layout}
          onResume={resume}
          onExit={exitToStart}
          onOpenCameraTuning={() => setCamPanel(true)}
        />
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

      {playing && phase === 'victory' && (
        <div className={styles.modal}>
          <div className={styles.modalCard}>
            <p>Those Ryderz · PvP</p>
            <h3>You win</h3>
            <p>The other Ryder is down. Rematch keeps the same lineup.</p>
            <div className={styles.actions}>
              <button type="button" onClick={replay}>
                Rematch
              </button>
              <button type="button" onClick={changeRyder}>
                Change Ryderz
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === 'start' && (
        <RyderzStartScreen
          slots={saveState.slots}
          activeSlot={saveState.activeSlot}
          lastMode={managerState.gameMode}
          onSelectSlot={(index) => saves.selectSlot(index)}
          onContinue={() => {
            if (!saves.loadGame(saveState.activeSlot, manager)) return;
            const loaded = manager.getState();
            setScreen(loaded.gameMode === GameMode.PVP ? 'pvp' : loaded.gameMode === GameMode.RAID ? 'raid-lobby' : 'solo-select');
          }}
          onNewGame={() => {
            const empty = saveState.slots.find((slot) => slot.empty);
            const index = empty?.slotIndex ?? saveState.activeSlot;
            saves.deleteSave(index);
            saves.selectSlot(index);
            manager.resetSession();
            playerStore.configure({ mode: GameMode.SOLO, localRyder: null });
          }}
          onPickMode={(mode) => {
            manager.setGameMode(mode);
            setScreen(mode === GameMode.PVP ? 'pvp' : mode === GameMode.RAID ? 'raid-lobby' : 'solo-select');
          }}
        />
      )}

      {screen === 'solo-select' && (
        <SoloCharacterSelect initialId={activeRyder} onBack={() => setScreen('start')} onPlay={playSolo} />
      )}

      {screen === 'pvp' && <PvpFlow onBack={() => setScreen('start')} onFight={playPvp} />}

      {screen === 'raid-lobby' && <RaidLobby onBack={() => setScreen('start')} onStart={playRaid} />}
    </div>
  );
}
