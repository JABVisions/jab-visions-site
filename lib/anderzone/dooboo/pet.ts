import { speciesById } from "./species";

export type PetBehavior = "follow" | "idle" | "play" | "sleep";

export type PetCare = {
  fullness: number;
  energy: number;
  bond: number;
};

export type Dooboo = {
  id: string;
  speciesId: string;
  name: string;
  x: number;
  y: number;
  behavior: PetBehavior;
  care: PetCare;
  playUntil: number;
};

const FULLNESS_FLOOR = 25;
const ENERGY_FLOOR = 15;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function createCare(): PetCare {
  return { fullness: 80, energy: 80, bond: 1 };
}

/** Care can drift down to a floor. Bond does not fall, and the pet never dies. */
export function decayCare(care: PetCare, seconds: number): PetCare {
  return {
    fullness: Math.max(FULLNESS_FLOOR, care.fullness - seconds * 0.4),
    energy: Math.max(ENERGY_FLOOR, care.energy - seconds * 0.25),
    bond: care.bond,
  };
}

export function feedPet(care: PetCare): PetCare {
  return { fullness: clamp(care.fullness + 30, 0, 100), energy: care.energy, bond: care.bond + 1 };
}

export function greetPet(care: PetCare): PetCare {
  return { ...care, bond: care.bond + 1 };
}

export function adoptFirstDooboo(existing: Dooboo[], speciesId: string, name: string, at: { x: number; y: number }) {
  if (existing.length > 0) return { ok: false as const, reason: "The free adoption is only for your first Dooboo." };
  if (!speciesById(speciesId)) return { ok: false as const, reason: "Unknown Dooboo appearance." };
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 16);
  if (!/^[A-Za-z0-9 ]{1,16}$/.test(clean)) return { ok: false as const, reason: "Use a short name." };
  const pet: Dooboo = {
    id: "dooboo-1",
    speciesId,
    name: clean,
    x: at.x,
    y: at.y + 20,
    behavior: "follow",
    care: createCare(),
    playUntil: 0,
  };
  return { ok: true as const, cost: 0, pet };
}

export function commandPet(pet: Dooboo, command: "play" | "sleep" | "follow" | "greet", now: number): Dooboo {
  if (command === "play") {
    return { ...pet, behavior: "play", playUntil: now + 2500, care: { ...pet.care, energy: Math.max(ENERGY_FLOOR, pet.care.energy - 4), bond: pet.care.bond + 2 } };
  }
  if (command === "sleep") return { ...pet, behavior: "sleep" };
  if (command === "greet") return { ...pet, behavior: pet.behavior === "sleep" ? "idle" : pet.behavior, care: greetPet(pet.care) };
  return { ...pet, behavior: "follow", playUntil: 0 };
}

function approach(from: number, to: number, maxStep: number) {
  const delta = to - from;
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}

export function stepPet(
  pet: Dooboo,
  owner: { x: number; y: number },
  dt: number,
  now: number,
  bed: { x: number; y: number } | null
): Dooboo {
  const care = decayCare(pet.care, dt);
  let behavior = pet.behavior;
  if (behavior === "play" && now >= pet.playUntil) behavior = "follow";
  if (care.energy <= ENERGY_FLOOR + 0.01 && behavior !== "play") behavior = "sleep";

  const speed = 90 * dt;
  let x = pet.x;
  let y = pet.y;
  if (behavior === "follow") {
    const dx = owner.x - pet.x;
    const dy = owner.y + 22 - pet.y;
    if (Math.hypot(dx, dy) > 28) {
      x = approach(pet.x, owner.x, speed);
      y = approach(pet.y, owner.y + 22, speed);
    } else behavior = "idle";
  } else if (behavior === "play") {
    x = owner.x + Math.cos(now / 280) * 18;
    y = owner.y + 16 + Math.sin(now / 280) * 8;
  } else if (behavior === "sleep" && bed) {
    x = approach(pet.x, bed.x, speed);
    y = approach(pet.y, bed.y, speed);
  }
  return { ...pet, x, y, behavior, care };
}
