import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { cullInstances, untrackInstances } from './instancing';
import { LightPool } from './light-pool';
import { RIVERDALE, type RiverdaleTime } from '../riverdale/config';

/**
 * Frame pipeline for the raid: an HDR scene pass with MSAA, filmic tone
 * mapping, bloom on anything brighter than white, a shadow-casting key light
 * that follows the fighter, and an image-based environment so PBR surfaces
 * (wet asphalt, lab tile, glass) reflect the sky and lights around them.
 *
 * Each arena describes its look as an Atmosphere; the engine applies one when
 * it swaps worlds and leaves the per-frame work to `follow` and `render`.
 */

export type WorldKey = 'block' | 'pad' | 'island' | 'riverdale';

export interface Atmosphere {
  fog: { color: number; density: number };
  /** Flat colour behind the world, or null when the world draws its own sky. */
  background: number | null;
  sun: { color: number; intensity: number; offset: [number, number, number] };
  hemi: { sky: number; ground: number; intensity: number };
  fill: { color: number; intensity: number; position: [number, number, number] };
  exposure: number;
  bloom: { strength: number; radius: number; threshold: number };
  environment: {
    zenith: number;
    horizon: number;
    ground: number;
    intensity: number;
    sun?: { color: number; intensity: number; direction: [number, number, number] };
  };
  camera: { near: number; far: number };
  shadow: { radius: number; far: number; bias: number; normalBias: number };
}

/**
 * Riverdale Park under the structure. Dusk is the default: a low orange sun
 * rakes in under the slab from the open side while the party lights take over.
 */
export const RIVERDALE_ATMOSPHERES: Record<RiverdaleTime, Atmosphere> = {
  day: {
    fog: { color: 0x9aa69a, density: 0.0062 },
    background: null,
    sun: { color: 0xfff0dc, intensity: 1.45, offset: [-36, 64, 44] },
    hemi: { sky: 0xbcd4e8, ground: 0x5a4a34, intensity: 0.75 },
    fill: { color: 0xd8e4ff, intensity: 0.2, position: [30, 14, 40] },
    exposure: 0.95,
    bloom: { strength: 0.22, radius: 0.5, threshold: 1.0 },
    environment: { zenith: 0x4a7cc0, horizon: 0xc8d8dc, ground: 0x5a4a30, intensity: 0.6 },
    camera: { near: 0.08, far: 620 },
    shadow: { radius: 48, far: 200, bias: -0.0004, normalBias: 0.04 },
  },
  dusk: {
    fog: { color: 0x2a2a3a, density: 0.0105 },
    background: null,
    sun: { color: 0xffa868, intensity: 1.1, offset: [-52, 22, 46] },
    hemi: { sky: 0x6a70a0, ground: 0x2c3022, intensity: 1.0 },
    fill: { color: 0xff6ab0, intensity: 0.12, position: [0, 6, -30] },
    exposure: 1.08,
    bloom: { strength: 0.62, radius: 0.55, threshold: 0.8 },
    environment: { zenith: 0x1c2048, horizon: 0xb86a50, ground: 0x1a1410, intensity: 0.5 },
    camera: { near: 0.08, far: 620 },
    shadow: { radius: 48, far: 200, bias: -0.0004, normalBias: 0.04 },
  },
  night: {
    fog: { color: 0x0e0f1a, density: 0.013 },
    background: null,
    sun: { color: 0x9fb4ff, intensity: 0.5, offset: [-30, 60, 30] },
    hemi: { sky: 0x2a3050, ground: 0x16100c, intensity: 0.75 },
    fill: { color: 0xff4fa8, intensity: 0.32, position: [0, 6, -30] },
    exposure: 1.18,
    bloom: { strength: 0.7, radius: 0.55, threshold: 0.75 },
    environment: { zenith: 0x05060f, horizon: 0x2a2238, ground: 0x0a0806, intensity: 0.4 },
    camera: { near: 0.08, far: 620 },
    shadow: { radius: 48, far: 200, bias: -0.0004, normalBias: 0.04 },
  },
};

export const ATMOSPHERES: Record<WorldKey, Atmosphere> = {
  // Rain-soaked downtown at night. The moon is the key; sodium lamps and neon fill from below.
  block: {
    fog: { color: 0x141226, density: 0.0034 },
    background: null,
    sun: { color: 0xc4d2ff, intensity: 1.35, offset: [-26, 48, 18] },
    hemi: { sky: 0x4a4f86, ground: 0x4a2c1e, intensity: 1.45 },
    fill: { color: 0xff5f9e, intensity: 0.45, position: [30, 12, -24] },
    exposure: 1.12,
    bloom: { strength: 0.55, radius: 0.55, threshold: 0.82 },
    environment: { zenith: 0x0a0a1c, horizon: 0x5a3350, ground: 0x1a1218, intensity: 1.15 },
    camera: { near: 0.08, far: 1100 },
    shadow: { radius: 42, far: 170, bias: -0.00035, normalBias: 0.035 },
  },
  // Government laboratory. White ceiling light is the key; cyan trim fills the shadows.
  pad: {
    fog: { color: 0x1b2430, density: 0.0045 },
    background: 0x0a0e14,
    sun: { color: 0xf6f9ff, intensity: 0.85, offset: [12, 34, 8] },
    hemi: { sky: 0xd8e6f2, ground: 0x263040, intensity: 0.5 },
    fill: { color: 0x7fe0ff, intensity: 0.2, position: [-20, 8, 14] },
    exposure: 0.95,
    bloom: { strength: 0.3, radius: 0.5, threshold: 0.95 },
    environment: { zenith: 0xdfe6ec, horizon: 0x6c7986, ground: 0x1c222b, intensity: 0.55 },
    camera: { near: 0.08, far: 420 },
    shadow: { radius: 34, far: 140, bias: -0.0003, normalBias: 0.03 },
  },
  // Tropical noon. A hard sun, a sky-blue hemisphere, and a long view.
  island: {
    fog: { color: 0xc3e4f7, density: 0.00085 },
    background: 0x8ec8ea,
    sun: { color: 0xfff1d6, intensity: 1.55, offset: [-42, 78, 30] },
    hemi: { sky: 0x9fd4ff, ground: 0x9b8a62, intensity: 0.55 },
    fill: { color: 0x86bfff, intensity: 0.18, position: [40, 20, -30] },
    exposure: 0.92,
    bloom: { strength: 0.22, radius: 0.6, threshold: 1.0 },
    environment: {
      zenith: 0x3d7fd6,
      horizon: 0xcfe8f8,
      ground: 0xb79c6a,
      intensity: 0.35,
      sun: { color: 0xfff0d0, intensity: 6, direction: [-0.42, 0.78, 0.3] },
    },
    camera: { near: 0.3, far: 2200 },
    shadow: { radius: 56, far: 260, bias: -0.0004, normalBias: 0.05 },
  },
  riverdale: RIVERDALE_ATMOSPHERES[RIVERDALE.timeOfDay],
};

export interface PipelineLights {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
}

/** Render-resolution steps, as a fraction of the device pixel ratio the engine asked for. */
const RESOLUTION_STEPS = [1, 0.85, 0.72, 0.6];
const MIN_PIXEL_RATIO = 0.6;
/** Smoothed frame time (ms) above which resolution steps down, and below which it may step back up. */
const SLOW_FRAME_MS = 19.5;
const SMOOTH_FRAME_MS = 17.4;

export class RenderPipeline {
  /** Off for scripted captures that render on demand, where frame gaps say nothing about the GPU. */
  adaptive = true;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private lights: PipelineLights;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private pmrem: THREE.PMREMGenerator;
  private environments = new Map<WorldKey, THREE.Texture>();
  private sunOffset = new THREE.Vector3(-26, 48, 18);
  private key: WorldKey = 'block';
  private lightPool: LightPool;
  private view = new THREE.Frustum();
  private viewProjection = new THREE.Matrix4();
  private baseRatio: number;
  private step = 0;
  private frameMs = 16.7;
  private lastFrame = 0;
  private settle = 2000;
  private lastStepDown = -Infinity;
  private lastStepUp = -Infinity;
  /** How long frames must stay smooth before trying a sharper step; doubles each time a step up does not hold. */
  private upHold = 8000;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, lights: PipelineLights) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.lights = lights;
    this.baseRatio = renderer.getPixelRatio();
    this.lightPool = new LightPool(scene, 6);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sun = lights.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.radius = 2.5;
    scene.add(sun.target);

    const samples = renderer.capabilities.isWebGL2 ? 4 : 0;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
  }

  setSize(width: number, height: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }

  /** Dress the scene for an arena. Fog colour is handed back so the engine can tint it under water or indoors. */
  apply(key: WorldKey) {
    const atmo = ATMOSPHERES[key];
    this.key = key;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.color.setHex(atmo.fog.color);
      fog.density = atmo.fog.density;
    }
    if (atmo.background === null) {
      this.scene.background = null;
      this.renderer.setClearColor(atmo.fog.color, 1);
    } else {
      this.scene.background = new THREE.Color(atmo.background);
      this.renderer.setClearColor(atmo.background, 1);
    }

    const { sun, hemi, fill } = this.lights;
    sun.color.setHex(atmo.sun.color);
    sun.intensity = atmo.sun.intensity;
    this.sunOffset.set(...atmo.sun.offset);
    hemi.color.setHex(atmo.hemi.sky);
    hemi.groundColor.setHex(atmo.hemi.ground);
    hemi.intensity = atmo.hemi.intensity;
    fill.color.setHex(atmo.fill.color);
    fill.intensity = atmo.fill.intensity;
    fill.position.set(...atmo.fill.position);

    const cam = sun.shadow.camera;
    cam.left = -atmo.shadow.radius;
    cam.right = atmo.shadow.radius;
    cam.top = atmo.shadow.radius;
    cam.bottom = -atmo.shadow.radius;
    cam.far = atmo.shadow.far;
    cam.updateProjectionMatrix();
    sun.shadow.bias = atmo.shadow.bias;
    sun.shadow.normalBias = atmo.shadow.normalBias;

    this.renderer.toneMappingExposure = atmo.exposure;
    this.bloom.strength = atmo.bloom.strength;
    this.bloom.radius = atmo.bloom.radius;
    this.bloom.threshold = atmo.bloom.threshold;

    this.camera.near = atmo.camera.near;
    this.camera.far = atmo.camera.far;
    this.camera.updateProjectionMatrix();

    this.scene.environment = this.environment(key);
    this.scene.environmentIntensity = atmo.environment.intensity;
    return atmo;
  }

  /** Keep the shadow frustum centred on the fighter so the map stays sharp wherever the fight goes. */
  follow(target: THREE.Vector3) {
    const sun = this.lights.sun;
    sun.position.copy(target).add(this.sunOffset);
    sun.target.position.copy(target);
    sun.target.updateMatrixWorld();
    this.lightPool.update(target);
  }

  /** Hand the point lights of an arena to the pool. The arena's own lights stay hidden as anchors. */
  useLights(root: THREE.Object3D) {
    this.lightPool.use(root);
  }

  forgetLights(root: THREE.Object3D) {
    this.lightPool.forget(root);
  }

  render() {
    this.adapt();
    this.cull();
    this.composer.render();
  }

  private cull() {
    const camera = this.camera;
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.view.setFromProjectionMatrix(this.viewProjection);
    const sun = this.lights.sun;
    sun.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    cullInstances([this.view, sun.shadow.getFrustum()]);
  }

  /** Current render scale against the requested pixel ratio. */
  get resolutionScale() {
    return this.renderer.getPixelRatio() / this.baseRatio;
  }

  /**
   * Hold a steady frame rate by trading resolution: step down when frames run
   * long, and creep back up once they have been smooth for a while.
   */
  private adapt() {
    const now = performance.now();
    const gap = now - this.lastFrame;
    this.lastFrame = now;
    if (!this.adaptive || gap <= 0 || gap > 250) return;
    this.frameMs += (gap - this.frameMs) * 0.05;
    this.settle -= gap;
    if (this.settle > 0) return;
    if (this.frameMs > SLOW_FRAME_MS && this.step < RESOLUTION_STEPS.length - 1) {
      if (now - this.lastStepUp < 4000) this.upHold = Math.min(64000, this.upHold * 2);
      this.setStep(this.step + 1);
      this.lastStepDown = now;
    } else if (this.frameMs < SMOOTH_FRAME_MS && this.step > 0 && now - this.lastStepDown > this.upHold) {
      this.setStep(this.step - 1);
      this.lastStepUp = now;
    }
  }

  private setStep(step: number) {
    this.step = step;
    this.settle = 1500;
    const ratio = Math.max(MIN_PIXEL_RATIO, this.baseRatio * RESOLUTION_STEPS[step]);
    if (ratio === this.renderer.getPixelRatio()) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setPixelRatio(ratio);
    this.setSize(size.x, size.y);
  }

  dispose() {
    untrackInstances();
    this.lightPool.dispose();
    for (const texture of this.environments.values()) texture.dispose();
    this.environments.clear();
    this.pmrem.dispose();
    this.composer.dispose();
  }

  private environment(key: WorldKey) {
    const cached = this.environments.get(key);
    if (cached) return cached;
    const spec = ATMOSPHERES[key].environment;
    const stage = new THREE.Scene();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          zenith: { value: new THREE.Color(spec.zenith) },
          horizon: { value: new THREE.Color(spec.horizon) },
          ground: { value: new THREE.Color(spec.ground) },
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 zenith;
          uniform vec3 horizon;
          uniform vec3 ground;
          varying vec3 vDir;
          void main() {
            float y = normalize(vDir).y;
            vec3 col = y >= 0.0 ? mix(horizon, zenith, smoothstep(0.0, 0.62, y)) : mix(horizon, ground, smoothstep(0.0, 0.35, -y));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    stage.add(dome);
    if (spec.sun) {
      const disc = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.sun.color).multiplyScalar(spec.sun.intensity) }),
      );
      disc.position.set(...spec.sun.direction).normalize().multiplyScalar(8.5);
      stage.add(disc);
    }
    const texture = this.pmrem.fromScene(stage, 0.04).texture;
    stage.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    this.environments.set(key, texture);
    return texture;
  }
}
