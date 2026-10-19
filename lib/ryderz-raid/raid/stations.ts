/**
 * Reusable battlefield points. Arenas keep their own geometry. These stations
 * sit on the ground plane and any new arena can drop the same list in.
 */
export type StationKind = 'weapon' | 'chest' | 'secret';

export interface FieldStation {
  kind: StationKind;
  x: number;
  z: number;
  label: string;
  /** Chests and secrets pay once per round. Weapon racks stay open. */
  claimed: boolean;
  weapon?: 'bottle' | 'brick' | 'crate';
}

const LAYOUT: Array<Omit<FieldStation, 'claimed'>> = [
  { kind: 'weapon', x: 8.2, z: 5.4, label: 'Wall rack', weapon: 'brick' },
  { kind: 'weapon', x: -9.6, z: 3.2, label: 'Armory hook', weapon: 'bottle' },
  { kind: 'chest', x: 12.4, z: -7.5, label: 'Supply chest' },
  { kind: 'chest', x: -13.2, z: -5.8, label: 'Cache' },
  { kind: 'secret', x: -5.5, z: 13.6, label: 'Hidden door' },
  { kind: 'secret', x: 16.8, z: 1.4, label: 'Side passage' },
];

export function fieldStations(): FieldStation[] {
  return LAYOUT.map((row) => ({ ...row, claimed: false }));
}

/** Closest unclaimed chest or secret, or any weapon rack, inside `range`. */
export function nearestStation(stations: FieldStation[], x: number, z: number, range = 1.8): FieldStation | null {
  let best: FieldStation | null = null;
  let bestD = range * range;
  for (const station of stations) {
    if (station.claimed && station.kind !== 'weapon') continue;
    const d = (station.x - x) ** 2 + (station.z - z) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = station;
    }
  }
  return best;
}
