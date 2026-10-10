'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { animateGltfFighter, buildRyder, preloadRyderGltf, type Fighter } from '@/lib/ryderz-raid/characters';
import { animateHumanoid, disposeObject, poseAim, poseMelee } from '@/lib/ryderz-raid/toon';
import styles from './PauseMenu.module.css';

/**
 * Full-body preview of a Ryder on its own transparent WebGL canvas. The figure
 * shares the GLB templates already loaded for the raid, idles with a slow turn
 * and throws a strike whenever `poseKey` changes.
 */
export default function RyderShowcase({
  ryderId,
  poseKey,
  className,
}: {
  ryderId: RyderId;
  /** Bump to make the figure shift pose (e.g. when the menu focus moves). */
  poseKey: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingPose = useRef(0);
  const lastPose = useRef(poseKey);

  useEffect(() => {
    if (poseKey !== lastPose.current) {
      lastPose.current = poseKey;
      pendingPose.current += 1;
    }
  }, [poseKey]);

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
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
    camera.position.set(0.7, 1.25, 4.9);
    camera.lookAt(0, 1.0, 0);

    const accent = new THREE.Color(spec.color);
    scene.add(new THREE.HemisphereLight(0xfff1e6, 0x1a1430, 1.4));
    const key = new THREE.DirectionalLight(0xffe9d6, 2.1);
    key.position.set(-2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 2.6);
    rim.position.set(2.5, 2.2, -3);
    scene.add(rim);
    const under = new THREE.PointLight(accent, 1.6, 4, 2);
    under.position.set(0, 0.25, 0.6);
    scene.add(under);

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
    let meleeT = 0;
    let meleeStarted = false;
    let consumed = pendingPose.current;
    // The rig turns Keven's chest to raid-forward (+Z). This camera sits on
    // +Z, so that leaves the menu looking at his back. Spin him toward the lens.
    const menuYaw = ryderId === 'keven' ? Math.PI : 0;

    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      const time = clock.elapsedTime;
      if (fighter) {
        if (pendingPose.current !== consumed) {
          consumed = pendingPose.current;
          meleeT = 1;
          meleeStarted = true;
        }
        if (meleeT > 0) meleeT = Math.max(0, meleeT - dt * 2.6);
        anim += dt * 6;
        const group = fighter.humanoid.group;
        group.rotation.y = menuYaw - 0.42 + Math.sin(time * 0.45) * 0.14;
        if (fighter.meshSource === 'gltf') {
          animateGltfFighter(fighter, dt, anim, 0, false, meleeT, meleeStarted, { camera });
        } else {
          animateHumanoid(fighter.humanoid, anim, 0, time);
          if (meleeT > 0) poseMelee(fighter.humanoid, 1 - meleeT);
          else poseAim(fighter.humanoid, 0);
        }
        meleeStarted = false;
      }
      renderer.render(scene, camera);
    };

    (async () => {
      if (spec.glb) {
        await preloadRyderGltf(spec).catch(() => undefined);
      }
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
      renderer.dispose();
    };
  }, [ryderId]);

  return <canvas ref={canvasRef} className={`${styles.showcaseCanvas} ${className ?? ''}`} aria-hidden="true" />;
}
