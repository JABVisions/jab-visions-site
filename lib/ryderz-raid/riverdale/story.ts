import { STORY_TRIGGERS, type StoryTriggerId, type StoryTriggerRegion } from './config';

/**
 * Region triggers for a future Story Mode chapter. The set starts dormant:
 * `update` does nothing until `activate` is called, and each region fires its
 * listeners once per activation the first time the player stands inside it.
 */
export class StoryTriggerSet {
  readonly regions: readonly StoryTriggerRegion[];
  private active = false;
  private fired = new Set<StoryTriggerId>();
  private listeners = new Set<(id: StoryTriggerId) => void>();

  constructor(regions: readonly StoryTriggerRegion[] = STORY_TRIGGERS) {
    this.regions = regions;
  }

  get isActive() {
    return this.active;
  }

  activate() {
    this.active = true;
    this.fired.clear();
  }

  deactivate() {
    this.active = false;
  }

  onEnter(listener: (id: StoryTriggerId) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  contains(region: StoryTriggerRegion, x: number, z: number) {
    if (region.r !== undefined) return (x - region.x) ** 2 + (z - region.z) ** 2 <= region.r * region.r;
    return Math.abs(x - region.x) <= (region.halfX ?? 0) && Math.abs(z - region.z) <= (region.halfZ ?? 0);
  }

  update(x: number, z: number) {
    if (!this.active) return;
    for (const region of this.regions) {
      if (this.fired.has(region.id) || !this.contains(region, x, z)) continue;
      this.fired.add(region.id);
      this.listeners.forEach((fn) => fn(region.id));
    }
  }

  dispose() {
    this.listeners.clear();
    this.active = false;
  }
}
