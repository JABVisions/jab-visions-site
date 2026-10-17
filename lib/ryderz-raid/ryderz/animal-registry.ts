/**
 * Future animal GLBs for Animal Allegiance. Nothing is registered yet, so the
 * rite plays its circle and returns without spawning a mesh.
 */

export type AnimalBehavior = 'chase' | 'leap' | 'orbit';

export interface AnimalDef {
  id: string;
  /** Path under public/. Omit until the asset exists. */
  glb?: string;
  damage: number;
  speed: number;
  health: number;
  behavior: AnimalBehavior;
  /** Seconds the summon stays. */
  life: number;
}

export class AnimalSummonRegistry {
  private animals = new Map<string, AnimalDef>();

  register(def: AnimalDef) {
    this.animals.set(def.id, def);
  }

  unregister(id: string) {
    this.animals.delete(id);
  }

  /** Animals that can actually be spawned. Entries without a GLB stay in the book. */
  ready(): AnimalDef[] {
    return [...this.animals.values()].filter((animal) => Boolean(animal.glb));
  }

  /** Random ready animal, or null when the book has no models. */
  pick(rng = Math.random()): AnimalDef | null {
    const list = this.ready();
    if (!list.length) return null;
    const index = Math.min(list.length - 1, Math.floor(rng * list.length));
    return list[index] ?? null;
  }

  clear() {
    this.animals.clear();
  }
}

export const animalSummonRegistry = new AnimalSummonRegistry();
