'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RYDERZ } from '@/lib/ryderz-raid/config';
import { animateGltfFighter, buildRyder, type Fighter } from '@/lib/ryderz-raid/characters';
import { resolveAppearance, type SkinStatus } from '@/lib/ryderz-raid/skins/appearance';
import type { SkinDef } from '@/lib/ryderz-raid/skins/catalog';
import { animateHumanoid, disposeObject } from '@/lib/ryderz-raid/toon';
import styles from './SkinVault.module.css';

type Lighting = 'studio' | 'night';

/**
 * Turntable for one skin. Drag to rotate, scroll or pinch to zoom. Nothing
 * here fights: the figure idles in place under studio or night lighting with
 * an optional aura ring in the skin's colour.
 */
export default function SkinPreview({ skin }: { skin: SkinDef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<SkinStatus | 'loading'>('loading');
  const [lighting, setLighting] = useState<Lighting>('studio');
  const [aura, setAura] = useState(true);
  const lightingRef = useRef(lighting);
  const auraRef = useRef(aura);
  lightingRef.current = lighting;
  auraRef.current = aura;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let fighter: Fighter | null = null;
    setStatus('loading');

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 40);
    camera.position.set(0.6, 1.3, 4.6);
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0.95, 0);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.6;
    controls.maxDistance = 7;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI / 2 + 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.1;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });
    controls.update();

    const accent = new THREE.Color(skin.accent);
    const hemi = new THREE.HemisphereLight(0xfff1e6, 0x1a1430, 1.5);
    const key = new THREE.DirectionalLight(0xffe9d6, 2.2);
    key.position.set(-2.5, 4, 3);
    const rim = new THREE.DirectionalLight(accent, 2.4);
    rim.position.set(2.5, 2.2, -3);
    const under = new THREE.PointLight(accent, 1.4, 4, 2);
    under.position.set(0, 0.25, 0.7);
    scene.add(hemi, key, rim, under);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.66, 48),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.66, 2.3, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    column.position.y = 1.15;
    scene.add(ring, column);

    const resize = () => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const clock = new THREE.Clock();
    let anim = 0;
    let faceYaw = 0;
    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      const night = lightingRef.current === 'night';
      hemi.intensity = night ? 0.45 : 1.5;
      key.intensity = night ? 0.6 : 2.2;
      rim.intensity = night ? 3.6 : 2.4;
      under.intensity = night ? 2.4 : 1.4;
      ring.visible = auraRef.current;
      column.visible = auraRef.current;
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.42 + Math.sin(time * 2.6) * 0.12;
      if (fighter) {
        anim += dt * 4;
        fighter.humanoid.group.rotation.y = faceYaw;
        if (fighter.meshSource === 'gltf') animateGltfFighter(fighter, dt, anim, 0, false, 0, false, { camera });
        else animateHumanoid(fighter.humanoid, anim, 0, time);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    clock.start();
    raf = requestAnimationFrame(loop);

    void (async () => {
      const look = await resolveAppearance(skin.ryderId, skin.id, { preview: true });
      if (disposed) return;
      setStatus(look.status);
      if (look.fallback) return;
      faceYaw = skin.ryderId === 'keven' && look.spec.glb === RYDERZ.keven.glb ? Math.PI : 0;
      fighter = buildRyder(look.spec);
      scene.add(fighter.humanoid.group);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      if (fighter) {
        scene.remove(fighter.humanoid.group);
        disposeObject(fighter.humanoid.group);
      }
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      column.geometry.dispose();
      (column.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [skin]);

  return (
    <div className={styles.preview} style={{ ['--skin' as string]: skin.accent }}>
      <canvas ref={canvasRef} className={styles.previewCanvas} aria-label={`${skin.name} 3D preview. Drag to rotate, scroll to zoom.`} role="img" />
      {status === 'loading' && <p className={styles.previewNote}>Loading model…</p>}
      {(status === 'missing' || status === 'error') && (
        <div className={styles.previewPlaceholder}>
          <span className={styles.filmMark} aria-hidden="true" />
          <strong>{status === 'missing' ? 'Model not supplied yet' : 'Model failed to load'}</strong>
          <small>{skin.model?.glb}</small>
        </div>
      )}
      {status === 'static' && <p className={styles.previewFlag}>Static scan · needs rigging before it can play</p>}
      <div className={styles.previewTools}>
        <button type="button" aria-pressed={lighting === 'night'} onClick={() => setLighting((l) => (l === 'studio' ? 'night' : 'studio'))}>
          {lighting === 'studio' ? 'Studio light' : 'Night light'}
        </button>
        <button type="button" aria-pressed={aura} onClick={() => setAura((a) => !a)}>
          Aura {aura ? 'on' : 'off'}
        </button>
      </div>
    </div>
  );
}
