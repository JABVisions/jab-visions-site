import * as THREE from 'three';

const MAX_PARTICLES = 2400;

export class ParticleSystem {
  readonly points: THREE.Points;
  private positions = new Float32Array(MAX_PARTICLES * 3);
  private colors = new Float32Array(MAX_PARTICLES * 3);
  private sizes = new Float32Array(MAX_PARTICLES);
  private velocities = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private baseSize = new Float32Array(MAX_PARTICLES);
  private gravity = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private geometry: THREE.BufferGeometry;
  private color = new THREE.Color();

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.positions.fill(9999);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { scale: { value: 400 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (scale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float d = length(p);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.08, d);
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  setViewportHeight(height: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = height * 0.5;
  }

  emit(
    position: THREE.Vector3,
    color: THREE.ColorRepresentation,
    count: number,
    options: {
      speed?: number;
      spread?: number;
      life?: number;
      size?: number;
      gravity?: number;
      direction?: THREE.Vector3;
      up?: number;
    } = {},
  ) {
    const speed = options.speed ?? 6;
    const spread = options.spread ?? 1;
    const life = options.life ?? 0.6;
    const size = options.size ?? 0.35;
    const gravity = options.gravity ?? 0;
    const up = options.up ?? 0;
    this.color.set(color);

    for (let n = 0; n < count; n += 1) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const i3 = i * 3;
      this.positions[i3] = position.x + (Math.random() - 0.5) * spread * 0.4;
      this.positions[i3 + 1] = position.y + (Math.random() - 0.5) * spread * 0.4;
      this.positions[i3 + 2] = position.z + (Math.random() - 0.5) * spread * 0.4;

      let vx = (Math.random() - 0.5) * 2;
      let vy = (Math.random() - 0.5) * 2 + up;
      let vz = (Math.random() - 0.5) * 2;
      if (options.direction) {
        vx = vx * spread * 0.5 + options.direction.x;
        vy = vy * spread * 0.5 + options.direction.y;
        vz = vz * spread * 0.5 + options.direction.z;
      }
      const len = Math.hypot(vx, vy, vz) || 1;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.velocities[i3] = (vx / len) * s;
      this.velocities[i3 + 1] = (vy / len) * s;
      this.velocities[i3 + 2] = (vz / len) * s;

      const tint = 0.75 + Math.random() * 0.5;
      this.colors[i3] = this.color.r * tint;
      this.colors[i3 + 1] = this.color.g * tint;
      this.colors[i3 + 2] = this.color.b * tint;

      this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
      this.life[i] = this.maxLife[i];
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.sizes[i] = this.baseSize[i];
      this.gravity[i] = gravity;
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -9999;
        this.sizes[i] = 0;
        continue;
      }
      this.velocities[i3 + 1] -= this.gravity[i] * dt;
      this.velocities[i3] *= 1 - dt * 2.4;
      this.velocities[i3 + 2] *= 1 - dt * 2.4;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      if (this.positions[i3 + 1] < 0.03) {
        this.positions[i3 + 1] = 0.03;
        this.velocities[i3 + 1] *= -0.3;
      }
      const t = this.life[i] / this.maxLife[i];
      this.sizes[i] = this.baseSize[i] * (0.3 + t * 0.7);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
