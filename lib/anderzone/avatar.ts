export const SKIN_TONES = ["sand", "amber", "umber", "clay", "rose"] as const;
export const EYE_STYLES = ["round", "bright", "soft"] as const;
export const HAIR_STYLES = ["none", "crop", "tuft", "long"] as const;
export const CLOTHING = ["jacket", "wrap", "suit"] as const;
export const ACCESSORIES = ["none", "visor", "pin"] as const;

export type AvatarAppearance = {
  skin: (typeof SKIN_TONES)[number];
  eyes: (typeof EYE_STYLES)[number];
  hair: (typeof HAIR_STYLES)[number];
  clothing: (typeof CLOTHING)[number];
  accessory: (typeof ACCESSORIES)[number];
};

const SKIN_HEX: Record<AvatarAppearance["skin"], string> = {
  sand: "#f0c9a0",
  amber: "#d8924a",
  umber: "#6b3e2e",
  clay: "#c4785a",
  rose: "#e7a0b0",
};

const CLOTH_HEX: Record<AvatarAppearance["clothing"], string> = {
  jacket: "#6fd3c2",
  wrap: "#f2d36b",
  suit: "#8b7cf7",
};

export function defaultAvatar(): AvatarAppearance {
  return { skin: "sand", eyes: "round", hair: "tuft", clothing: "jacket", accessory: "none" };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function sanitizeAvatar(input: unknown): AvatarAppearance {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const base = defaultAvatar();
  return {
    skin: pick(raw.skin, SKIN_TONES, base.skin),
    eyes: pick(raw.eyes, EYE_STYLES, base.eyes),
    hair: pick(raw.hair, HAIR_STYLES, base.hair),
    clothing: pick(raw.clothing, CLOTHING, base.clothing),
    accessory: pick(raw.accessory, ACCESSORIES, base.accessory),
  };
}

export function avatarPalette(avatar: AvatarAppearance) {
  return {
    skin: SKIN_HEX[avatar.skin],
    cloth: CLOTH_HEX[avatar.clothing],
    hair: avatar.hair === "none" ? "transparent" : "#1b2430",
  };
}
