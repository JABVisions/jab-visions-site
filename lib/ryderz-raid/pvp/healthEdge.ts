export type HealthEdge = 'none' | 'faint' | 'strong' | 'critical';

/** Local player only. Above 30% the screen stays clear. At 0 the death screen takes over. */
export function healthEdge(health: number, maxHealth: number): { stage: HealthEdge; edge: number; beat: string } {
  const pct = maxHealth > 0 ? health / maxHealth : 1;
  if (pct > 0.3 || health <= 0) return { stage: 'none', edge: 0, beat: '1.6s' };
  if (pct > 0.2) return { stage: 'faint', edge: 0.55, beat: '1.7s' };
  if (pct > 0.1) return { stage: 'strong', edge: 0.82, beat: '1.05s' };
  return { stage: 'critical', edge: 1, beat: '0.68s' };
}
