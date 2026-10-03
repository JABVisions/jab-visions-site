'use client';

import { useState } from 'react';
import { CAMERA_DEFAULTS, type CameraConfig } from '@/lib/ryderz-raid/camera';
import type { RaidEngine } from '@/lib/ryderz-raid/engine';
import { CAMERA_STORAGE_KEY, loadStoredCameraConfig } from '../CameraTuningPanel';
import { useMenuKeys } from './useMenuKeys';
import styles from './PauseMenu.module.css';

interface Setting {
  key: keyof CameraConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

const SETTINGS: Setting[] = [
  { key: 'lookSensitivity', label: 'Look sensitivity', min: 0.3, max: 2.5, step: 0.05, format: (v) => `${v.toFixed(2)}×` },
  { key: 'fov', label: 'Field of view', min: 55, max: 110, step: 1, format: (v) => `${v.toFixed(0)}°` },
  { key: 'distance', label: 'Camera distance', min: 1.5, max: 9, step: 0.05, format: (v) => `${v.toFixed(2)} m` },
];

function persist(patch: Partial<CameraConfig>) {
  if (typeof window === 'undefined') return;
  try {
    const stored = loadStoredCameraConfig() ?? {};
    window.localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ ...stored, ...patch }));
  } catch {
    // Ignore storage failures; the live engine still has the value.
  }
}

/** Player-facing settings. Shares the camera config (and its storage) with the dev tuning panel. */
export default function SettingsMenu({
  engine,
  active,
  onBack,
  onOpenCameraTuning,
}: {
  engine: RaidEngine | null;
  active: boolean;
  onBack: () => void;
  onOpenCameraTuning?: () => void;
}) {
  const [config, setConfig] = useState<CameraConfig>(() => engine?.getCameraConfig() ?? { ...CAMERA_DEFAULTS });

  useMenuKeys((key) => {
    if (key === 'back') {
      onBack();
      return true;
    }
    return false;
  }, active);

  const update = (key: keyof CameraConfig, value: number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    engine?.setCameraConfig({ [key]: value });
    persist({ [key]: value });
  };

  const reset = () => {
    const patch: Partial<CameraConfig> = {};
    SETTINGS.forEach((s) => {
      patch[s.key] = CAMERA_DEFAULTS[s.key];
    });
    setConfig((prev) => ({ ...prev, ...patch }));
    engine?.setCameraConfig(patch);
    persist(patch);
  };

  return (
    <section className={styles.panel} aria-label="Settings">
      <header className={styles.panelHead}>
        <p className={styles.eyebrow}>Settings</p>
        <h2>Controls & camera</h2>
        <p>Changes apply live and persist on this device.</p>
      </header>
      <div className={styles.scroll}>
        {SETTINGS.map((setting) => (
          <div key={setting.key} className={styles.setting}>
            <label htmlFor={`setting-${setting.key}`}>{setting.label}</label>
            <output htmlFor={`setting-${setting.key}`}>{setting.format(config[setting.key])}</output>
            <input
              id={`setting-${setting.key}`}
              type="range"
              min={setting.min}
              max={setting.max}
              step={setting.step}
              value={config[setting.key]}
              onChange={(e) => update(setting.key, Number(e.target.value))}
            />
          </div>
        ))}
        <div className={styles.setting} style={{ borderBottom: 0 }}>
          <button type="button" className={styles.ghostBtn} onClick={reset}>
            Reset camera
          </button>
          {onOpenCameraTuning && process.env.NODE_ENV !== 'production' && (
            <button type="button" className={styles.ghostBtn} onClick={onOpenCameraTuning}>
              Camera tuning (dev)
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
