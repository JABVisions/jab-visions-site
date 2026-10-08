/** Color grade and motion looks for Drop Studio V5. Values are non-destructive. */

export type DropStudioV5Grade = {
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  blur: number;
  vignette: number;
};

export type DropStudioV5Motion = "glow" | "vhs" | "flash" | "shake" | "blur";

export const V5_MOTIONS: DropStudioV5Motion[] = ["glow", "vhs", "flash", "shake", "blur"];

export const V5_GRADE_PRESETS = [
  "cinematic",
  "vintage",
  "mono",
  "warm",
  "cool",
  "neon",
  "dream",
  "contrast",
] as const;

export type DropStudioV5GradePreset = (typeof V5_GRADE_PRESETS)[number];

const IDENTITY: DropStudioV5Grade = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  blur: 0,
  vignette: 0,
};

const PRESETS: Record<DropStudioV5GradePreset, DropStudioV5Grade> = {
  cinematic: { brightness: -0.08, contrast: 0.28, saturation: -0.12, temperature: -0.08, blur: 0, vignette: 0.45 },
  vintage: { brightness: 0.06, contrast: -0.08, saturation: -0.35, temperature: 0.55, blur: 0, vignette: 0.28 },
  mono: { brightness: 0.02, contrast: 0.18, saturation: -1, temperature: 0, blur: 0, vignette: 0.2 },
  warm: { brightness: 0.06, contrast: 0.04, saturation: 0.12, temperature: 0.7, blur: 0, vignette: 0 },
  cool: { brightness: 0.02, contrast: 0.08, saturation: 0.04, temperature: -0.7, blur: 0, vignette: 0 },
  neon: { brightness: 0.08, contrast: 0.22, saturation: 0.85, temperature: -0.15, blur: 0, vignette: 0.15 },
  dream: { brightness: 0.12, contrast: -0.18, saturation: -0.08, temperature: 0.2, blur: 0.22, vignette: 0.18 },
  contrast: { brightness: 0, contrast: 0.72, saturation: 0.08, temperature: 0, blur: 0, vignette: 0.12 },
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function identityGrade(): DropStudioV5Grade {
  return { ...IDENTITY };
}

export function normalizeGrade(input: unknown): DropStudioV5Grade | undefined {
  if (!input || typeof input !== "object") return undefined;
  const source = input as Record<string, unknown>;
  const grade: DropStudioV5Grade = {
    brightness: clamp(Number(source.brightness) || 0, -1, 1),
    contrast: clamp(Number(source.contrast) || 0, -1, 1),
    saturation: clamp(Number(source.saturation) || 0, -1, 1),
    temperature: clamp(Number(source.temperature) || 0, -1, 1),
    blur: clamp(Number(source.blur) || 0, 0, 1),
    vignette: clamp(Number(source.vignette) || 0, 0, 1),
  };
  return gradeActive(grade) ? grade : undefined;
}

export function gradeActive(grade?: DropStudioV5Grade | null) {
  if (!grade) return false;
  return (
    grade.brightness !== 0 ||
    grade.contrast !== 0 ||
    grade.saturation !== 0 ||
    grade.temperature !== 0 ||
    grade.blur !== 0 ||
    grade.vignette !== 0
  );
}

export function presetGrade(name: string, intensity = 1): DropStudioV5Grade | undefined {
  if (!V5_GRADE_PRESETS.includes(name as DropStudioV5GradePreset)) return undefined;
  const base = PRESETS[name as DropStudioV5GradePreset];
  const amount = clamp(intensity, 0, 1);
  const scaled: DropStudioV5Grade = {
    brightness: base.brightness * amount,
    contrast: base.contrast * amount,
    saturation: base.saturation * amount,
    temperature: base.temperature * amount,
    blur: base.blur * amount,
    vignette: base.vignette * amount,
  };
  return gradeActive(scaled) ? scaled : undefined;
}

/** CSS and canvas share this filter list. Vignette is drawn separately. */
export function gradeToFilter(grade?: DropStudioV5Grade | null) {
  if (!gradeActive(grade) || !grade) return "none";
  const brightness = (1 + grade.brightness * 0.55).toFixed(3);
  const contrast = (1 + grade.contrast * 0.65).toFixed(3);
  const saturation = Math.max(0, 1 + grade.saturation).toFixed(3);
  const sepia = Math.max(0, grade.temperature).toFixed(3);
  const hue = (grade.temperature * -16).toFixed(2);
  const blur = (grade.blur * 8).toFixed(2);
  return `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) sepia(${sepia}) hue-rotate(${hue}deg) blur(${blur}px)`;
}

export function joinFilters(...parts: Array<string | null | undefined>) {
  const active = parts.map((part) => (part || "").trim()).filter((part) => part && part !== "none");
  return active.length ? active.join(" ") : "none";
}

export function motionAt(motion: string | null | undefined, localMs: number, durationMs: number) {
  const local = Math.max(0, localMs);
  const duration = Math.max(0, durationMs);
  if (motion === "glow") return { filter: "brightness(1.16) saturate(1.22)", shake: 0, flash: 0, vhs: false };
  if (motion === "vhs") return { filter: "contrast(1.12) saturate(0.82)", shake: 1.5, flash: 0, vhs: true };
  if (motion === "shake") {
    const swing = Math.sin(local / 40) * 7;
    return { filter: "none", shake: swing, flash: 0, vhs: false };
  }
  if (motion === "flash") {
    const edge = local < 140 || duration - local < 140;
    return { filter: "none", shake: 0, flash: edge ? 0.62 : 0.08, vhs: false };
  }
  if (motion === "blur") {
    const edge = local < 220 || duration - local < 220;
    return { filter: edge ? "blur(7px)" : "none", shake: 0, flash: 0, vhs: false };
  }
  return { filter: "none", shake: 0, flash: 0, vhs: false };
}

export function isGradePreset(value: string): value is DropStudioV5GradePreset {
  return V5_GRADE_PRESETS.includes(value as DropStudioV5GradePreset);
}
