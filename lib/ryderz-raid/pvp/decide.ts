import type { StrikeKind } from '../fighter/actions';
import type { CombatRates } from '../fighter/memory';
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
  | 'punch'
  | 'kick'
  | 'melee'
  | 'grab'
  | 'throw'
  | 'dodge'
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
  /** The other fighter just missed a heavy attack. */
  foeWhiff?: boolean;
  /** The other fighter is in hitstun. */
  foeStun?: boolean;
  /** A combo already earned a Power Link. */
  powerLink?: boolean;
  /** Next strike in a chain the CPU already started. */
  nextStrike?: StrikeKind | null;
  memory?: CombatRates;
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

  const retreatHabit = read.memory?.retreat ?? 0;
  let chase =
    read.dist > preferred + 1.3
      ? 0.48 + profile.aggression * 0.45 + (read.foeRetreating ? 0.2 : 0)
      : 0.08;
  if (retreatHabit > 0.45) chase += 0.22;
  options.push({ intent: 'chase', slot: null, score: chase });

  const retreat = hurting ? 0.35 + profile.evasiveness * 0.6 * (1 - read.selfHp) : 0.04;
  options.push({ intent: 'retreat', slot: null, score: retreat + (read.foeAttacking && hurting ? 0.15 : 0) });

  let evade = read.foeAttacking ? 0.22 + profile.evasiveness * 0.72 : 0.06;
  const punchSpam = read.memory?.punch ?? 0;
  const abilitySpam = read.memory?.ability ?? 0;
  if (punchSpam > 0.55) evade += 0.42 + profile.evasiveness * 0.2;
  if (read.foeAttacking && abilitySpam > 0.4) evade += 0.28 + profile.punish * 0.15;
  options.push({ intent: 'evade', slot: null, score: evade });
  options.push({ intent: 'dodge', slot: null, score: evade * 0.92 });

  const rangeError = Math.abs(read.dist - preferred);
  options.push({
    intent: 'reposition',
    slot: null,
    score: 0.2 + Math.min(0.45, rangeError * 0.06) + (read.foeClosing ? profile.evasiveness * 0.15 : 0),
  });

  const punchRange = read.dist < 2.35;
  const kickRange = read.dist < 2.85;
  const meleeRange = read.dist < 2.55;
  const grabRange = read.dist < 1.45;
  let punch = punchRange ? 0.38 + profile.aggression * 0.32 : 0.04;
  let kick = kickRange ? 0.3 + profile.aggression * 0.18 : 0.03;
  let melee = meleeRange ? 0.26 + profile.comboPreference * 0.34 : 0.03;
  if (finisher && kickRange) kick += 0.22 + profile.comboPreference * 0.2;
  if (finisher && punchRange) punch += 0.12;
  if (read.foeWhiff && read.dist < 3.3) punch += 0.48 + profile.punish * 0.4;
  if (read.foeStun && punchRange) punch += 0.16;
  if (hurting && !finisher) {
    punch *= 0.72;
    kick *= 0.62;
    melee *= 0.55;
  }
  if (read.nextStrike === 'punch' && punchRange) punch += 0.85;
  if (read.nextStrike === 'kick' && kickRange) kick += 0.85;
  if (read.nextStrike === 'melee' && meleeRange) melee += 0.85;
  options.push({ intent: 'punch', slot: null, score: punch });
  options.push({ intent: 'kick', slot: null, score: kick });
  options.push({ intent: 'melee', slot: null, score: melee });
  options.push({ intent: 'grab', slot: null, score: grabRange ? 0.22 + profile.punish * 0.2 : 0.02 });
  options.push({ intent: 'attack', slot: null, score: 0.04 });

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
    if (read.dist < 2.5 && slot.band !== 'defensive' && slot.band !== 'movement') score *= 0.62;
    if (read.powerLink && fit > 0.35) score += 0.55 + profile.abilityFrequency * 0.15;
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
