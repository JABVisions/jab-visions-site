import * as THREE from 'three';

/**
 * Third-person camera for Ryderz: Raid.
 *
 * All framing numbers live here. The engine only tells the rig where the
 * player is, where the player is looking, and which CameraState applies;
 * the rig handles state blending, lag, collision and shake.
 *
 * Units are meters (1 unit = 1 m; a Ryder is ~1.9 m tall).
 */

export type CameraState = 'EXPLORATION' | 'COMBAT' | 'AIM' | 'SPRINT' | 'ABILITY' | 'LOCK_ON';

export const CAMERA_STATE_ORDER: CameraState[] = [
  'EXPLORATION',
  'COMBAT',
  'AIM',
  'SPRINT',
  'ABILITY',
  'LOCK_ON',
];

export interface CameraConfig {
  /** Horizontal field of view in degrees (converted to vertical per aspect). */
  fov: number;
  /** Distance from the pivot to the camera along the orbit direction. */
  distance: number;
  /** Extra vertical lift of the camera above the pivot. */
  height: number;
  /** Pivot height above the player's feet (chest / upper torso). */
  targetHeight: number;
  /** Lateral shoulder offset of pivot + camera. Positive = right shoulder. */
  shoulderX: number;
  /** Vertical shoulder offset of pivot + camera. */
  shoulderY: number;
  /** Time constant (s) for the pivot following the player. */
  positionSmoothing: number;
  /** Time constant (s) for yaw/pitch following mouse input. */
  rotationSmoothing: number;
  /** Time constant (s) for blending between camera states. */
  stateBlend: number;
  /** Additional distance added while sprinting. */
  sprintPullback: number;
  /** Mouse look multiplier. */
  lookSensitivity: number;
  /** Radius used by the pseudo-spherecast when resolving collisions. */
  collisionRadius: number;
  /** Closest the camera may be pulled toward the pivot by collision. */
  minDistance: number;
  /** Pitch limits in radians. Positive pitch = camera above, looking down. */
  pitchMin: number;
  pitchMax: number;
}

export const CAMERA_DEFAULTS: CameraConfig = {
  fov: 78,
  distance: 4.2,
  height: 0.42,
  targetHeight: 1.3,
  shoulderX: 0.42,
  shoulderY: 0,
  positionSmoothing: 0.085,
  rotationSmoothing: 0.03,
  stateBlend: 0.22,
  sprintPullback: 0.7,
  lookSensitivity: 1,
  collisionRadius: 0.32,
  minDistance: 0.85,
  pitchMin: -0.42,
  pitchMax: 0.78,
};

/** Values the state presets are allowed to nudge. Offsets are additive on top of the base config. */
export type CameraFraming = Pick<
  CameraConfig,
  'fov' | 'distance' | 'height' | 'targetHeight' | 'shoulderX' | 'shoulderY'
>;

export const CAMERA_STATE_OFFSETS: Record<CameraState, Partial<CameraFraming>> = {
  EXPLORATION: {},
  COMBAT: { distance: -0.35, shoulderX: 0.18, fov: -2 },
  AIM: { distance: -1.35, shoulderX: 0.42, shoulderY: 0.08, height: -0.12, fov: -10 },
  // SPRINT distance is driven by config.sprintPullback (tunable from the panel).
  SPRINT: { fov: 6, shoulderX: -0.12, height: 0.08 },
  ABILITY: { distance: 0.45, fov: 4, height: 0.1 },
  LOCK_ON: { distance: -0.4, shoulderX: 0.28, fov: -3 },
};

export interface CameraSnapshot {
  state: CameraState;
  framing: CameraFraming;
  collisionDistance: number;
  verticalFov: number;
}

const _pivot = new THREE.Vector3();
const _back = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _desired = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _look = new THREE.Vector3();
const _ray = new THREE.Raycaster();

function damp(current: number, target: number, timeConstant: number, dt: number) {
  if (timeConstant <= 0) return target;
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-dt / timeConstant));
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  config: CameraConfig = { ...CAMERA_DEFAULTS };
  /** When set, overrides the state the engine asks for (debug preview). */
  forcedState: CameraState | null = null;

  private occluders: THREE.Object3D[];
  private state: CameraState = 'EXPLORATION';
  private framing: CameraFraming = {
    fov: CAMERA_DEFAULTS.fov,
    distance: CAMERA_DEFAULTS.distance,
    height: CAMERA_DEFAULTS.height,
    targetHeight: CAMERA_DEFAULTS.targetHeight,
    shoulderX: CAMERA_DEFAULTS.shoulderX,
    shoulderY: CAMERA_DEFAULTS.shoulderY,
  };
  private smoothPivot = new THREE.Vector3();
  private smoothYaw = 0;
  private smoothPitch = 0;
  private collisionDist = CAMERA_DEFAULTS.distance;
  private trauma = 0;
  private kick = 0;
  private kickVel = 0;
  private time = 0;
  private initialized = false;
  private lastVerticalFov = -1;
  private lastAspect = -1;

  constructor(camera: THREE.PerspectiveCamera, occluders: THREE.Object3D[]) {
    this.camera = camera;
    this.occluders = occluders;
  }

  setConfig(patch: Partial<CameraConfig>) {
    Object.assign(this.config, patch);
  }

  getState(): CameraState {
    return this.forcedState ?? this.state;
  }

  snapshot(): CameraSnapshot {
    return {
      state: this.getState(),
      framing: { ...this.framing },
      collisionDistance: this.collisionDist,
      verticalFov: this.camera.fov,
    };
  }

  /** Short, decaying shake. Amount 0..1; stacks and clamps. */
  addShake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Impulse that pushes the camera back (positive) or in (negative) and springs home. */
  addKick(meters: number) {
    this.kickVel += meters * 18;
  }

  /** Place the camera immediately (no smoothing). Use on spawn / respawn. */
  snap(playerPos: THREE.Vector3, yaw: number, pitch: number) {
    this.smoothYaw = yaw;
    this.smoothPitch = pitch;
    this.smoothPivot.copy(playerPos);
    this.collisionDist = this.config.distance;
    this.trauma = 0;
    this.kick = 0;
    this.kickVel = 0;
    this.initialized = true;
    this.update(1 / 60, playerPos, yaw, pitch, 'EXPLORATION', true);
  }

  /**
   * World-space ray through the crosshair (screen centre). Used so projectiles
   * converge on what the player sees instead of on the camera-independent yaw/pitch.
   */
  aimRay(out: THREE.Ray) {
    this.camera.getWorldDirection(_dir);
    out.origin.copy(this.camera.position);
    out.direction.copy(_dir);
    return out;
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    yaw: number,
    pitch: number,
    requestedState: CameraState,
    instant = false,
  ) {
    const cfg = this.config;
    this.time += dt;
    this.state = requestedState;
    const state = this.getState();

    if (!this.initialized) {
      this.initialized = true;
      this.smoothPivot.copy(playerPos);
      this.smoothYaw = yaw;
      this.smoothPitch = pitch;
      this.collisionDist = cfg.distance;
    }

    // --- Blend framing towards the active state preset ----------------------
    const offsets = CAMERA_STATE_OFFSETS[state];
    const target: CameraFraming = {
      fov: cfg.fov + (offsets.fov ?? 0),
      distance:
        cfg.distance + (offsets.distance ?? 0) + (state === 'SPRINT' ? cfg.sprintPullback : 0),
      height: cfg.height + (offsets.height ?? 0),
      targetHeight: cfg.targetHeight + (offsets.targetHeight ?? 0),
      shoulderX: cfg.shoulderX + (offsets.shoulderX ?? 0),
      shoulderY: cfg.shoulderY + (offsets.shoulderY ?? 0),
    };
    const blend = instant ? 0 : cfg.stateBlend;
    (Object.keys(target) as Array<keyof CameraFraming>).forEach((key) => {
      this.framing[key] = damp(this.framing[key], target[key], blend, dt);
    });
    const f = this.framing;

    // --- Smooth follow + look -----------------------------------------------
    const posTc = instant ? 0 : cfg.positionSmoothing;
    const rotTc = instant ? 0 : cfg.rotationSmoothing;
    this.smoothPivot.x = damp(this.smoothPivot.x, playerPos.x, posTc, dt);
    this.smoothPivot.y = damp(this.smoothPivot.y, playerPos.y, posTc * 0.6, dt);
    this.smoothPivot.z = damp(this.smoothPivot.z, playerPos.z, posTc, dt);
    this.smoothYaw += damp(0, wrapAngle(yaw - this.smoothYaw), rotTc, dt);
    this.smoothPitch = damp(this.smoothPitch, pitch, rotTc, dt);

    // --- Kick spring (ability / landing / hit response) ---------------------
    const stiffness = 90;
    const damping = 14;
    this.kickVel += (-this.kick * stiffness - this.kickVel * damping) * dt;
    this.kick += this.kickVel * dt;
    if (Math.abs(this.kick) < 0.0005 && Math.abs(this.kickVel) < 0.001) {
      this.kick = 0;
      this.kickVel = 0;
    }

    // --- Build the pivot (chest + shoulder offset) --------------------------
    const sy = Math.sin(this.smoothYaw);
    const cy = Math.cos(this.smoothYaw);
    const sp = Math.sin(this.smoothPitch);
    const cp = Math.cos(this.smoothPitch);
    _right.set(cy, 0, -sy);
    _back.set(-sy * cp, sp, -cy * cp);

    _origin.copy(this.smoothPivot).addScaledVector(_up, f.targetHeight);
    _pivot.copy(_origin).addScaledVector(_right, f.shoulderX).addScaledVector(_up, f.shoulderY);

    // --- Collision: pseudo-spherecast from the chest to the desired position --
    const wantDist = Math.max(cfg.minDistance, f.distance + this.kick);
    _desired.copy(_pivot).addScaledVector(_back, wantDist).addScaledVector(_up, f.height);
    _dir.copy(_desired).sub(_origin);
    const fullLen = _dir.length();
    _dir.multiplyScalar(1 / Math.max(fullLen, 1e-5));

    let allowed = fullLen;
    const pad = cfg.collisionRadius;
    _ray.near = 0;
    _ray.far = fullLen + pad;
    // Centre ray plus four rays offset by the collision radius (camera-space right/up).
    const camRight = _camRight.copy(_dir).cross(_up);
    if (camRight.lengthSq() < 1e-6) camRight.copy(_right);
    camRight.normalize();
    const camUp = _camUp.copy(camRight).cross(_dir).normalize();
    const offsets2 = [
      [0, 0],
      [pad, 0],
      [-pad, 0],
      [0, pad],
      [0, -pad],
    ];
    for (const [ox, oy] of offsets2) {
      _ray.ray.origin.copy(_origin).addScaledVector(camRight, ox).addScaledVector(camUp, oy);
      _ray.ray.direction.copy(_dir);
      const hits = _ray.intersectObjects(this.occluders, false);
      if (hits.length) allowed = Math.min(allowed, Math.max(0, hits[0].distance - pad));
    }
    // Keep the camera off the floor.
    const floorY = 0.45;
    if (_desired.y < floorY && _dir.y < -1e-4) {
      allowed = Math.min(allowed, (floorY - _origin.y) / _dir.y);
    }
    const minAllowed = Math.min(fullLen, cfg.minDistance);
    allowed = Math.max(minAllowed, allowed);

    // Snap in fast when blocked, ease back out when clear.
    const tc = instant ? 0 : allowed < this.collisionDist ? 0.02 : 0.28;
    this.collisionDist = damp(this.collisionDist, allowed, tc, dt);
    this.collisionDist = Math.min(this.collisionDist, fullLen);

    this.camera.position.copy(_origin).addScaledVector(_dir, this.collisionDist);

    // --- Shake (restrained) -------------------------------------------------
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.9);
      const t = this.trauma * this.trauma;
      const n1 = Math.sin(this.time * 41.3) * 0.5 + Math.sin(this.time * 23.7) * 0.5;
      const n2 = Math.sin(this.time * 37.1 + 1.7) * 0.5 + Math.sin(this.time * 19.3 + 0.4) * 0.5;
      this.camera.position.addScaledVector(camRight, n1 * t * 0.09).addScaledVector(camUp, n2 * t * 0.07);
    }

    // --- Look at the pivot, nudged a little forward so the Ryder sits low-centre
    _look.copy(_pivot).addScaledVector(_back, -1.5);
    this.camera.lookAt(_look);
    if (this.trauma > 0) {
      const t = this.trauma * this.trauma;
      this.camera.rotateZ(Math.sin(this.time * 29) * t * 0.012);
    }

    // --- FOV (horizontal -> vertical) ---------------------------------------
    this.applyFov(f.fov);
  }

  private applyFov(horizontalDeg: number) {
    const aspect = this.camera.aspect || 1;
    const h = THREE.MathUtils.degToRad(horizontalDeg);
    const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
    const vertical = THREE.MathUtils.clamp(v, 38, 105);
    if (Math.abs(vertical - this.lastVerticalFov) > 0.01 || aspect !== this.lastAspect) {
      this.camera.fov = vertical;
      this.camera.updateProjectionMatrix();
      this.lastVerticalFov = vertical;
      this.lastAspect = aspect;
    }
  }
}
