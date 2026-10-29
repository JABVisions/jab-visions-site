import { steerVelocity } from './world';

/** Remembers a wall slide so a fighter does not oscillate or grind in place. */
export interface NavHint {
  stuck: number;
  lock: number;
  side: 1 | -1;
  x: number;
  z: number;
  seen: boolean;
}

export function freshNav(): NavHint {
  return { stuck: 0, lock: 0, side: 1, x: 0, z: 0, seen: false };
}

/**
 * Steer toward a goal. If the last step made no progress, commit to sliding
 * along the blockage for a moment instead of walking into it again.
 */
export function commitSteer(
  hint: NavHint,
  x: number,
  z: number,
  vx: number,
  vz: number,
  radius: number,
  blocked: (px: number, pz: number, radius: number) => boolean,
  goalX: number,
  goalZ: number,
  dt: number,
) {
  const speed = Math.hypot(vx, vz);
  let dx = vx;
  let dz = vz;
  if (hint.lock > 0 && speed > 0.05) {
    hint.lock = Math.max(0, hint.lock - dt);
    const nx = vx / speed;
    const nz = vz / speed;
    const tx = -nz * hint.side;
    const tz = nx * hint.side;
    const gx = goalX - x;
    const gz = goalZ - z;
    const gl = Math.hypot(gx, gz) || 1;
    const blendX = tx * 0.78 + (gx / gl) * 0.4;
    const blendZ = tz * 0.78 + (gz / gl) * 0.4;
    const len = Math.hypot(blendX, blendZ) || 1;
    dx = (blendX / len) * speed;
    dz = (blendZ / len) * speed;
  }
  const steered = steerVelocity(x, z, dx, dz, radius, blocked, goalX, goalZ);
  const moved = hint.seen ? Math.hypot(x - hint.x, z - hint.z) : speed * Math.max(dt, 0.016);
  const goalDist = Math.hypot(goalX - x, goalZ - z);
  if (hint.seen && speed > 0.4 && goalDist > 1.6 && moved < Math.max(0.015, speed * dt * 0.2)) {
    hint.stuck += dt;
  } else {
    hint.stuck = Math.max(0, hint.stuck - dt * 0.5);
  }
  if (hint.stuck > 0.42) {
    hint.side = hint.side === 1 ? -1 : 1;
    hint.lock = 0.9;
    hint.stuck = 0;
  }
  hint.x = x;
  hint.z = z;
  hint.seen = true;
  return steered;
}

export interface TrackPoint {
  x: number;
  z: number;
  vx: number;
  vz: number;
  hpRatio: number;
  /** Below 1 pulls this body ahead of a nearer teammate. The player uses that. */
  weight: number;
}

/** Who a hostile should walk at. The player outweighs a teammate who is only a little closer. */
export function pressTarget(fromX: number, fromZ: number, choices: TrackPoint[], preferWeak: boolean) {
  let best = choices[0];
  let bestScore = Infinity;
  for (const choice of choices) {
    const dist = Math.hypot(choice.x - fromX, choice.z - fromZ);
    const weak = preferWeak ? 0.45 + choice.hpRatio : 1;
    const score = dist * choice.weight * weak;
    if (score < bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  let lx = best.vx * 0.34;
  let lz = best.vz * 0.34;
  const lead = Math.hypot(lx, lz);
  // At contact, track the actual body. Predicting beyond a nearby player
  // can make a host turn away or run past them as they change direction.
  const leadLimit = Math.min(2.4, Math.max(0, Math.hypot(best.x - fromX, best.z - fromZ) - 2.5) * 0.35);
  if (lead > leadLimit) {
    lx *= leadLimit / lead;
    lz *= leadLimit / lead;
  }
  return { x: best.x + lx, z: best.z + lz, vx: best.vx, vz: best.vz };
}

/**
 * Raid teammates fight hosts that are on them or on the player. A far pack
 * does not drag them off the squad; they form up beside the player instead.
 * `committed` keeps a chase from flicking off the moment they cross the leash.
 */
export function allyFocusIndex(
  self: { x: number; z: number },
  player: { x: number; z: number },
  foes: { x: number; z: number; hp: number }[],
  committed: boolean,
) {
  const STRAY = committed ? 54 : 36;
  const CONTACT = 12;
  const PLAYER_FIGHT = 22;
  const playerDist = Math.hypot(self.x - player.x, self.z - player.z);
  let best = -1;
  let bestScore = Infinity;
  foes.forEach((foe, index) => {
    if (foe.hp <= 0) return;
    const dSelf = Math.hypot(self.x - foe.x, self.z - foe.z);
    const dPlayer = Math.hypot(player.x - foe.x, player.z - foe.z);
    const contact = dSelf <= CONTACT;
    const threat = dPlayer <= PLAYER_FIGHT;
    const reach = playerDist + Math.max(0, dSelf - CONTACT);
    if (!committed && !contact && !threat && reach > STRAY) return;
    if (committed && !contact && !threat && playerDist > STRAY) return;
    if (!threat && dSelf > (committed ? 50 : 30) && playerDist > 14) return;
    let score = dSelf + dPlayer * 0.4;
    if (threat) score -= 12;
    if (contact) score -= 6;
    if (score < bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Where a teammate stands when they are regrouping, so the squad does not stack. */
export function formUp(playerX: number, playerZ: number, seat: number) {
  const ang = seat * 1.7;
  return { x: playerX + Math.cos(ang) * 2.8, z: playerZ + Math.sin(ang) * 2.8 };
}
