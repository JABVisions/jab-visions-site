'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { animateGltfFighter, buildRyder, preloadRyderGltf, type Fighter } from '@/lib/ryderz-raid/characters';
import { animateHumanoid, disposeObject } from '@/lib/ryderz-raid/toon';
import styles from './StatBoard.module.css';

/**
 * The round MVP, built from that Ryder's GLB. They hold a victory stance
 * inside their own aura.
 */
export default function MvpStage({ ryderId }: { ryderId: RyderId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const spec = RYDERZ[ryderId];
    let disposed = false;
    let raf = 0;
    let fighter: Fighter | null = null;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
    camera.position.set(0.35, 1.35, 4.6);
    camera.lookAt(0, 1.05, 0);

    const accent = new THREE.Color(spec.visual.auraColor);
    scene.add(new THREE.HemisphereLight(0xfff4ea, 0x140818, 1.15));
    const key = new THREE.DirectionalLight(0xfff1e4, 1.8);
    key.position.set(-2.2, 4.2, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 3.2);
    rim.position.set(1.8, 2.4, -2.6);
    scene.add(rim);
    const aura = new THREE.PointLight(accent, 6, 6, 2);
    aura.position.set(0, 1.05, 0.4);
    scene.add(aura);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.72, 40),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

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
    const menuYaw = ryderId === 'keven' ? Math.PI : 0;

    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      aura.intensity = 4.4 + Math.sin(time * 3.2) * 1.6;
      ring.scale.setScalar(1 + Math.sin(time * 2.4) * 0.06);
      if (fighter) {
        anim += dt * 5;
        const group = fighter.humanoid.group;
        group.rotation.y = menuYaw + Math.sin(time * 0.35) * 0.18;
        const pose = { kind: 'finish' as const, t: 0.72, weight: 1 };
        if (fighter.meshSource === 'gltf') {
          animateGltfFighter(fighter, dt, anim, 0, false, 0, false, { pose, camera });
        } else {
          animateHumanoid(fighter.humanoid, anim, 0, time);
        }
      }
      renderer.render(scene, camera);
    };

    void (async () => {
      if (spec.glb) await preloadRyderGltf(spec).catch(() => undefined);
      if (disposed) return;
      fighter = buildRyder(spec);
      scene.add(fighter.humanoid.group);
      clock.start();
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      if (fighter) {
        scene.remove(fighter.humanoid.group);
        disposeObject(fighter.humanoid.group);
      }
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [ryderId]);

  return <canvas ref={canvasRef} className={styles.stage} aria-hidden="true" />;
}
