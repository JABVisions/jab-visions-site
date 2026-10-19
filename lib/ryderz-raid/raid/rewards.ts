/**
 * Match Raid Points. These numbers are the spendable balance for the current
 * fight. Permanent mastery is a separate save and is not awarded here.
 */
export const RAID_REWARDS = {
  basic: 100,
  elite: 250,
  miniBoss: 1000,
  round: 500,
  secret: 750,
  chest: 300,
  finisher: 150,
} as const;

/** Basic hosts pay 100. Elite tiers pay 250. Bosses and tier 6 pay 1,000. */
export function killReward(tier: number, boss = false) {
  if (boss || tier >= 6) return RAID_REWARDS.miniBoss;
  if (tier >= 4) return RAID_REWARDS.elite;
  return RAID_REWARDS.basic;
}
