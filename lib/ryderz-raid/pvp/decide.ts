import type { AbilityBand } from './abilityBands';
import { bandFit } from './abilityBands';
import type { AiProfile, AiTuning } from './aiProfile';
import { preferredMeters } from './aiProfile';

export type PvpIntent =
  | 'chase'
  | 'reposition'
  | 'evade'
  | 'retreat'
  | 'attack'
  | 'ability';

export interface AbilityRead {
  band: AbilityBand;
  affordable: boolean;
  /** Rhythm gate after the last cast. Aura is separate. */
  cooling: boolean;
  ultimate: boolean;
  /** Sustained power already switched on. */
  active: boolean;
}

export interface CombatRead {
  dist: number;
  selfHp: number;
  foeHp: number;
  /** 0–1 of the aura pool. */
  aura: number;
  burnout: boolean;
  foeAttacking: boolean;
  foeRetreating: boolean;
  foeClosing: boolean;
  /** Extra pull toward a fitting power. Used when the CPU has not cast yet. */
  powerHunger?: number;
  slots: AbilityRead[];
}

export interface PvpChoice {
  intent: PvpIntent;
  /** Set when intent is `ability`. */
  slot: number | null;
  score: number;
}

interface Scored {
  intent: PvpIntent;
  slot: number | null;
  score: number;
}

/**
 * Utility pick. The highest score wins, unless a mistake roll takes a lesser
 * option that is still legal. Low aura pushes powers down so basics and
 * footwork take the turn.
 */
export function choosePvpAction(read: CombatRead, profile: AiProfile, tuning: AiTuning, rng: () => number = Math.random): PvpChoice {
  const preferred = preferredMeters(profile.preferredRange);
  const auraGate = read.burnout || read.aura < 0.18;
  const finisher = read.foeHp < 0.28;
  const hurting = read.selfHp < 0.32;
  const options: Scored[] = [];

  const chase =
    read.dist > preferred + 1.3
      ? 0.48 + profile.aggression * 0.45 + (read.foeRetreating ? 0.2 : 0)
      : 0.08;
  options.push({ intent: 'chase', slot: null, score: chase });

  const retreat = hurting ? 0.35 + profile.evasiveness * 0.6 * (1 - read.selfHp) : 0.04;
  options.push({ intent: 'retreat', slot: null, score: retreat + (read.foeAttacking && hurting ? 0.15 : 0) });

  const evade = read.foeAttacking ? 0.22 + profile.evasiveness * 0.72 : 0.06;
  options.push({ intent: 'evade', slot: null, score: evade });

  const rangeError = Math.abs(read.dist - preferred);
  options.push({
    intent: 'reposition',
    slot: null,
    score: 0.2 + Math.min(0.45, rangeError * 0.06) + (read.foeClosing ? profile.evasiveness * 0.15 : 0),
  });

  let attack = 0.05;
  if (read.dist < 3.2) attack = 0.4 + profile.aggression * 0.5;
  else if (read.dist < 5) attack = 0.16 + profile.aggression * 0.15;
  if (finisher && read.dist < 4.5) attack += 0.2 + profile.comboPreference * 0.25;
  options.push({ intent: 'attack', slot: null, score: attack });

  read.slots.forEach((slot, index) => {
    if (slot.active) {
      options.push({ intent: 'ability', slot: index, score: auraGate ? 0.7 : 0.12 });
      return;
    }
    if (!slot.affordable || slot.cooling || read.burnout) return;
    const fit = bandFit(slot.band, read.dist);
    let score = fit * (0.55 + profile.abilityFrequency * 0.55);
    if (fit > 0.5) score += read.powerHunger ?? 0;
    if (slot.band === 'defensive' && (read.foeAttacking || hurting)) score += 0.28 + profile.evasiveness * 0.35;
    if (slot.band === 'movement' && (read.dist > preferred || read.foeAttacking)) score += 0.22 + profile.evasiveness * 0.15;
    if (slot.ultimate && finisher) score += 0.3 + profile.aggression * 0.28;
    if (slot.band === 'close' && read.dist > 8) score = 0.03;
    if (auraGate) score *= 0.2;
    if (read.aura < 0.4 && !slot.ultimate) score *= 0.85;
    options.push({ intent: 'ability', slot: index, score });
  });

  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  const legal = options.filter((option) => option.score > 0.12);
  if (legal.length > 1 && rng() < tuning.mistake) {
    const pick = legal[1 + Math.floor(rng() * Math.min(2, legal.length - 1))];
    return { intent: pick.intent, slot: pick.slot, score: pick.score };
  }
  return { intent: best.intent, slot: best.slot, score: best.score };
}
