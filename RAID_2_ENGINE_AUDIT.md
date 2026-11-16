# RYDERZ: RAID 2.0 — engine audit and Milestone A

Scope: an audit of the Raid engine as it stood on `main` (bde35de), and the
record of Milestone A (Engine Stabilization). Nothing here replaces a system;
every change sits behind a flag and can be switched off.

All timings below are CPU time for the simulation only, measured in the running
game on a development VM that has no GPU. Rendered frame rate could not be
measured there. See "What was not verified".

## 1. Audit

### Rendering
- `lib/ryderz-raid/render/pipeline.ts`. One `WebGLRenderer` (three 0.170, no
  React Three Fiber), pixel ratio capped at 1.5, ACES tone mapping, one
  PCF-soft 2048 shadow map that follows the fighter.
- `EffectComposer`: 4× MSAA half-float target → scene pass → `UnrealBloomPass`
  → output pass. Sky environment through PMREM.
- Adaptive resolution steps down when frames run long. Instanced props are
  trimmed to the view and shadow frusta every frame (`render/instancing.ts`).
  A pool of six point lights is shared by effects (`render/light-pool.ts`).
- The Block: 1,104 meshes, 259 materials, 31 lights, 320–346 draw calls and
  2.2–3.2 million triangles per frame across all passes.
- No graphics quality presets. No SSAO, no outline or rim pass.

### Animation and model loading
- `characters.ts` loads models with a plain `GLTFLoader` (no Draco, Meshopt or
  KTX2) and caches a template per URL; fighters are clones.
- There is no runtime `AnimationMixer` and no animation state machine.
  `skeletal.ts` (`ProceduralSkeleton`, `poseSkeleton`) writes bone rotations
  directly each frame from a motion description (speed, strike phase, guard,
  airborne, and so on). Clips found in a model are sampled once into strike
  poses (`extractStrikes`).
- Models without a usable skeleton are rigged at load (`rigid-skin.ts`,
  `mesh-repair.ts`, `civilians/fashion-rig.ts`). Movie skins go through
  `skins/apply.ts`.
- Consequence for Milestone B: blending, root motion, foot planting and
  per-character locomotion sets do not exist yet and have to be added beside
  the procedural poser, not in place of it.

### Camera and movement
- `camera.ts` `CameraRig`: third-person orbit with shoulder offset, lock-on
  framing, kick, shake, and collision by raycast against the arena's occluder
  list.
- Player movement is in `engine.ts` (`stepPhysical`): acceleration toward the
  input direction, dodge, sprint, jump with scripted vertical arc, swim, and
  per-kit flight or air moves. Variable time step, `dt = min(0.05, delta)`.
- Input: keyboard and mouse, touch sticks and gamepad, all read in `engine.ts`.

### Combat and damage
- `fighter/` — `striker.ts` (player strikes), `combo.ts`, `actions.ts`,
  `planner.ts`, `memory.ts` (what the crowd has learned about the player),
  `hostStriker.ts`.
- `combat.ts` — hit scheduling, damage, knockback, hit-stop.
- Each Ryder's powers live in `ryderz/<name>.ts` behind a shared kit interface
  (`ryderz/kit.ts`). Projectiles, throwables, power effects and particles are
  separate modules.
- Hits are resolved by range and arc tests against fighter positions, not by
  hitbox volumes on bones.

### Enemy AI
- `rounds/director.ts` plans each round. The survival rule is already in the
  code: `CIVILIANS_PER_ROUND = 8`, so round N has 8 × N civilians (round 1 is
  8, round 10 is 80). The number alive at once starts at 6, rises about one
  every two rounds, and is capped by the crowd budget (32 by default, hard
  ceiling 48). The rest wait in reserve.
- `civilians/engagement.ts` hands out attack tokens so only a few hosts swing
  at once. `crowd/grid.ts` handles separation. `nav-grid.ts` and `nav.ts`
  route hosts around buildings.
- `pvp/pvpCpu.ts` drives the CPU opponent in versus modes.

### Physics and collision
- No physics library. The world is a list of 2D obstacles (circles and
  oriented boxes, 326 on The Block) plus a height field for footing
  (`footing.ts`). Bodies are circles pushed out of obstacles after they move.
- Obstacle resolution walks the whole list for every body; there is no
  broadphase.

### Performance risks, in order
1. Triangle count and light count on The Block (above). This is the first
   thing to measure on real hardware.
2. Camera collision cast against every occluder every frame. Fixed in this
   milestone.
3. Crowd path fields flooded the whole district each time a target cell
   changed. Fixed in this milestone.
4. Obstacle resolution without a broadphase (`pointBlocked` is now the largest
   single crowd cost at 0.22 ms per frame with 16 hosts).
5. Variable time step: behaviour changes with frame time. Addressed for the
   camera and for fast moves; the simulation itself still steps by frame.
6. Per-frame allocations in `stepPhysical` and `emitHud`.

### Must be preserved
Ten Ryders and their kits, all model files and runtime rigs, the Movie Skin
Pack and wardrobe, every arena in `arenas.ts` and map select, every game mode
in `game-mode.ts`, multiplayer, saves (`saves/saveManager.ts`), Signal Points and the power tree
(`progression/`), signal orbs, auto-lock, the circular HUD, radar and map,
touch and gamepad controls, audio. None of these were changed in behaviour by
Milestone A.

## 2. Milestone A — what changed

### Flags and rollback
`lib/ryderz-raid/flags.ts`. Read once when a match starts.

| Flag | Default | Controls |
| --- | --- | --- |
| `cameraBvh` | on | Camera and crosshair collision through a bounding-volume tree |
| `cameraFollow` | on | Camera follow that trails by the same distance at any frame time |
| `jumpAssist` | on | Jump buffer (0.12 s) and coyote time (0.1 s) |
| `sweptMove` | on | Fast moves are stepped so they cannot cross thin walls |
| `profiler` | off | Frame profiler overlay |

- One match: add `?raidflags=legacy` to the URL to turn every system flag off,
  or name them: `?raidflags=-cameraBvh,profiler`.
- Persistently: `localStorage['ryderz.raid.flags']` holds a JSON object of
  overrides.
- The nav and HUD changes have no flag. They produce the same routes and the
  same pixels; the checks prove the routes.

### Profiler
`?raidflags=profiler` shows frame interval, CPU per section (`sim`,
`sim.player`, `sim.hosts`, `sim.camera`, `sim.fx`, `world`, `render`, `hud`),
draw calls, triangles and live counts. In development,
`__raidDebug.profileReport()` returns the same numbers.

### Results

Camera collision, The Block, 2,400 frames along a route:

| | average | 95th percentile | worst |
| --- | --- | --- | --- |
| Camera, before | 1.50 ms | 10.8 ms | 28.5 ms |
| Camera, after | 0.10 ms | 0.2 ms | 6.9 ms (a tree being built) |
| Crosshair ray, before | 0.82 ms | 2.3 ms | 5.8 ms |
| Crosshair ray, after | 0.08 ms | 0.2 ms | 1.1 ms |

Both paths return the same hits: 4,800 rays at 8 spots, none nearer, none
missed. The old path also ignored instanced props that were outside the view
and the shadow frustum, so the camera could pass through a wall behind the
player; the tree reads every copy.

Camera follow on an open path:

| | before | after |
| --- | --- | --- |
| Jitter while strafing, frames alternating 10 / 23 ms | 7.06 mm rms | 0.00 |
| Jitter, random 8–33 ms frames | 7.57 mm rms | 0.00 |
| Trail distance at 60 fps | 0.2397 m | 0.2397 m |
| Trail distance at 30 fps | 0.2995 m | 0.2397 m |

Fast moves at 50 ms frames, 8 approaches to thin obstacles on The Block:

| | before | after |
| --- | --- | --- |
| Dodge | 4 of 8 crossed | 0 of 8 |
| 9 m/s knockback (the largest the player takes) | 0 of 8 | 0 of 8 |
| 22 m/s launch | 8 of 8 crossed | 0 of 8 |

Jump: a press up to 6 frames before landing, or during a dodge, now jumps on
the first frame it can; before, it was dropped. A press up to 5 frames after
running off a ledge jumps; before, it did nothing. One press is one jump, and
mashing in the air adds none. Zoe's air jump behaves the same with the flag on
and off.

Crowd, round 20 with 16 hosts on The Block: 4.68 ms → 1.89 ms per frame after
the nav change (path flooding was 3.07 ms of it). 720 routes compared against
the old flood: identical, with 3.8 million cells expanded instead of 34.2
million. The HUD change removes a further 0.23 ms of path measuring per frame
and halves map repaints.

Other arenas, round 6 with 8 hosts: Island 1.45 ms, Riverdale 1.27 ms per
frame.

### Checks
42 of 43 Raid checks pass. `ryderz/nyx.check.ts` fails to start with
"Top-level await is currently not supported with the cjs output format"; it
fails the same way on `main`. Typecheck and production build pass. New checks:
`flags`, `profiler`, `render/occlusion`, `sweep`; extended: `camera`,
`nav-grid`.

`three-mesh-bvh` 0.9.18 is the one new dependency: 15.6 kB gzipped, inside the
engine chunk that already loads only when a match starts.

## 3. What was not verified
- Rendered frame rate and how the camera feels on real hardware. The VM draws
  through software GL at 2–3 seconds per frame. The game was started and
  played there with the flags on and with `legacy`, without errors, but
  smoothness has to be judged on a device with the profiler overlay.
- Touch and gamepad were not exercised; their input path was not changed.
- Multiplayer was not exercised. Remote players do not use the changed moves.

## 4. Known limits after Milestone A
- The simulation still steps once per frame. A fixed step is a larger change
  to every kit and belongs with the combat work.
- Kit dashes and teleports move the body themselves and are not swept.
- Host moves other than the main drive path are resolved once, not swept.
- No obstacle broadphase yet.
- With `cameraFollow` on, the first frame of a fast mouse flick is eased
  slightly more than before. Steady lag at 60 fps is identical.
- No graphics presets or motion and shake settings yet.

## 5. Next
Milestone B, the three-character slice (Keven, Leo, Aaron): an animation layer
with blending, root-motion-aware locomotion and foot planting beside the
procedural poser, behind its own flag, for those three first.
