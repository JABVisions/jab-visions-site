'use client';

import { useEffect, useState } from 'react';
import {
  CAMERA_DEFAULTS,
  CAMERA_STATE_ORDER,
  type CameraConfig,
  type CameraState,
} from '@/lib/ryderz-raid/camera';
import type { RaidEngine } from '@/lib/ryderz-raid/engine';
import styles from './RaidGame.module.css';

/**
 * TEMPORARY developer tool for dialling in the third-person camera.
 * Toggle with the backquote key (`) or the CAM chip during a raid.
 * Values persist in localStorage so a refresh keeps the last tuning.
 */

export const CAMERA_STORAGE_KEY = 'ryderz-raid:camera-config';

interface SliderDef {
  key: keyof CameraConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const SLIDERS: SliderDef[] = [
  { key: 'fov', label: 'FOV (horizontal)', min: 55, max: 110, step: 1, unit: '°' },
  { key: 'distance', label: 'Distance', min: 1.5, max: 9, step: 0.05, unit: 'm' },
  { key: 'height', label: 'Camera height', min: -0.6, max: 2, step: 0.02, unit: 'm' },
  { key: 'targetHeight', label: 'Target height', min: 0.4, max: 2.2, step: 0.02, unit: 'm' },
  { key: 'shoulderX', label: 'Shoulder offset X', min: -1.2, max: 1.2, step: 0.02, unit: 'm' },
  { key: 'shoulderY', label: 'Shoulder offset Y', min: -0.8, max: 0.8, step: 0.02, unit: 'm' },
  { key: 'positionSmoothing', label: 'Camera smoothing', min: 0, max: 0.4, step: 0.005, unit: 's' },
  { key: 'rotationSmoothing', label: 'Rotation smoothing', min: 0, max: 0.25, step: 0.005, unit: 's' },
  { key: 'stateBlend', label: 'State blend', min: 0, max: 0.8, step: 0.01, unit: 's' },
  { key: 'sprintPullback', label: 'Sprint pullback', min: 0, max: 2.5, step: 0.05, unit: 'm' },
  { key: 'lookSensitivity', label: 'Look sensitivity', min: 0.3, max: 2.5, step: 0.05, unit: '×' },
  { key: 'collisionRadius', label: 'Collision radius', min: 0.1, max: 0.8, step: 0.02, unit: 'm' },
];

export function loadStoredCameraConfig(): Partial<CameraConfig> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CameraConfig>;
    const clean: Partial<CameraConfig> = {};
    (Object.keys(CAMERA_DEFAULTS) as Array<keyof CameraConfig>).forEach((key) => {
      const v = parsed[key];
      if (typeof v === 'number' && Number.isFinite(v)) clean[key] = v;
    });
    return clean;
  } catch {
    return null;
  }
}

function format(value: number, step: number) {
  const decimals = step >= 1 ? 0 : step >= 0.05 ? 2 : 3;
  return value.toFixed(decimals);
}

export default function CameraTuningPanel({
  engine,
  liveState,
  onClose,
}: {
  engine: RaidEngine | null;
  liveState: CameraState;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<CameraConfig>(() => ({
    ...CAMERA_DEFAULTS,
    ...(engine?.getCameraConfig() ?? {}),
  }));
  const [preview, setPreview] = useState<CameraState | ''>('');
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState({ collision: 0, vfov: 0, distance: 0 });

  useEffect(() => {
    if (engine) setConfig(engine.getCameraConfig());
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => {
      const snap = engine.getCameraSnapshot();
      setLive({
        collision: snap.collisionDistance,
        vfov: snap.verticalFov,
        distance: snap.framing.distance,
      });
    }, 120);
    return () => window.clearInterval(id);
  }, [engine]);

  const apply = (patch: Partial<CameraConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      engine?.setCameraConfig(patch);
      try {
        window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const reset = () => {
    engine?.setCameraConfig({ ...CAMERA_DEFAULTS });
    setConfig({ ...CAMERA_DEFAULTS });
    try {
      window.localStorage.removeItem(CAMERA_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const copy = async () => {
    const json = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      console.info('[raid camera config]\n' + json);
    }
  };

  const changePreview = (value: string) => {
    const state = (value || '') as CameraState | '';
    setPreview(state);
    engine?.setCameraPreviewState(state === '' ? null : state);
  };

  return (
    <aside
      className={styles.camPanel}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
    >
      <header className={styles.camHeader}>
        <div>
          <small>Dev · camera tuning</small>
          <strong>
            State <em>{preview ? `${preview} (preview)` : liveState}</em>
          </strong>
          <small className={styles.camLive} data-testid="cam-live">
            dist {live.distance.toFixed(2)} · cam {live.collision.toFixed(2)}m · vfov{' '}
            {live.vfov.toFixed(0)}°
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close camera panel">
          ×
        </button>
      </header>

      <label className={styles.camSelect}>
        <span>Preview state</span>
        <select value={preview} onChange={(e) => changePreview(e.target.value)}>
          <option value="">Auto (gameplay)</option>
          {CAMERA_STATE_ORDER.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.camSliders}>
        {SLIDERS.map((def) => (
          <label key={def.key} className={styles.camRow}>
            <span>
              {def.label}
              <em>
                {format(config[def.key], def.step)}
                {def.unit ?? ''}
              </em>
            </span>
            <input
              type="range"
              min={def.min}
              max={def.max}
              step={def.step}
              value={config[def.key]}
              onChange={(e) => apply({ [def.key]: Number(e.target.value) } as Partial<CameraConfig>)}
              onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
            />
          </label>
        ))}
      </div>

      <div className={styles.camActions}>
        <button type="button" onClick={() => engine?.requestPointerLock()}>
          Capture aim
        </button>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
      <p className={styles.camHint}>
        ` toggles this panel · Esc releases the mouse without pausing · WASD moves the character · Mouse orbits
        the camera, which follows · Shift sprints · hold LMB for AIM
      </p>
    </aside>
  );
}
