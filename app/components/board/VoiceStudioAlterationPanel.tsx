"use client";

import {
  ALTERATION_CONTROLS,
  STUDIO_ALTERATION_PRESETS,
  VOICE_PRESETS,
  type VoicePresetKey,
} from "@/lib/board/voicePresetAudio";
import type { AlterationParams, StudioPresetKey } from "@/lib/board/audioSession";
import styles from "./voiceStudioSession.module.css";

const LABEL: Record<VoicePresetKey, string> = Object.fromEntries(
  VOICE_PRESETS.map((preset) => [preset.key, preset.label])
) as Record<VoicePresetKey, string>;

export default function VoiceStudioAlterationPanel({
  open,
  preset,
  alteration,
  onClose,
  onPreset,
  onAlteration,
  onPreview,
  previewing = false,
}: {
  open: boolean;
  preset: StudioPresetKey;
  alteration?: AlterationParams;
  onClose: () => void;
  onPreset: (preset: VoicePresetKey) => void;
  onAlteration: (patch: Partial<AlterationParams>) => void;
  onPreview: () => void;
  previewing?: boolean;
}) {
  if (!open) return null;
  const active = preset === "none" ? "clean" : preset;
  const controls = ALTERATION_CONTROLS[active] ?? ["intensity"];
  const values = {
    intensity: alteration?.intensity ?? 0.75,
    pitch: alteration?.pitch ?? 0.5,
    reverb: alteration?.reverb ?? 0.5,
    echo: alteration?.echo ?? 0.5,
    distortion: alteration?.distortion ?? 0.5,
    correction: alteration?.correction ?? 0.5,
  };

  return (
    <div className={styles.drawer} role="dialog" aria-label="Vocal alteration">
      <div className={styles.drawerHead}>
        <span>Voice</span>
        <button type="button" className={styles.drawerClose} onClick={onClose}>
          Close
        </button>
      </div>
      <div className={styles.presetGrid}>
        {STUDIO_ALTERATION_PRESETS.map((key) => (
          <button
            key={key}
            type="button"
            className={`${styles.presetChip} ${active === key ? styles.presetChipOn : ""}`}
            onClick={() => onPreset(key)}
          >
            {LABEL[key]}
          </button>
        ))}
      </div>
      <div className={styles.controlStack}>
        {controls.map((key) => (
          <label key={key} className={styles.controlRow}>
            <span>{key}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={values[key]}
              onChange={(event) =>
                onAlteration({ [key]: Number(event.currentTarget.value) } as Partial<AlterationParams>)
              }
            />
          </label>
        ))}
      </div>
      <div className={styles.drawerActions}>
        <button type="button" onClick={onPreview} disabled={previewing}>
          {previewing ? "Previewing…" : "Preview preset"}
        </button>
        <button
          type="button"
          onClick={() => {
            onPreset("clean");
            onAlteration({ intensity: 0.35 });
          }}
        >
          Clear effect
        </button>
      </div>
      <p className={styles.drawerNote}>
        Effects stay non-destructive — the original take is kept until you mix to Drop.
      </p>
    </div>
  );
}
