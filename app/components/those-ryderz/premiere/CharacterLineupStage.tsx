'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RYDERZ, type RyderId } from '@/lib/ryderz-raid/config';
import { animateGltfFighter, buildRyder, preloadRyderGltf, type Fighter } from '@/lib/ryderz-raid/characters';
import type { RaidCharacter } from '@/lib/ryderz-raid/roster';
import { lineupFormation, lineupFrame, lineupGap, type PremiereCategory } from '@/lib/ryderz-raid/roster/premiere';
import { animateHumanoid, disposeObject } from '@/lib/ryderz-raid/toon';
import styles from './premiere.module.css';

export type ModelStatus = 'loading' | 'ready' | 'missing';

const CATEGORY_LIGHT: Record<PremiereCategory, { hemi: number; rim: number; spark: number }> = {
  ryderz: { hemi: 0xffe7c2, rim: 0xff4d8d, spark: 0xffd36a },
  boomerz: { hemi: 0xd7ecff, rim: 0x800020, spark: 0x66cfff },
  'jab-visions': { hemi: 0xd9c8ff, rim: 0x6dffe8, spark: 0xb388ff },
};

interface Actor {
  id: string;
  fighter: Fighter;
  ring: THREE.Mesh;
  slotX: number;
  slotZ: number;
  present: number;
  phase: number;
}

function readQuality() {
  const cores = typeof navigator === 'undefined' ? 8 : navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const low = cores <= 4 || memory <= 4;
  return {
    pixelRatio: Math.min(window.devicePixelRatio || 1, low ? 1.15 : 1.6),
    shadowMap: low ? 512 : 1024,
    particles: low ? 16 : 36,
    antialias: true,
  };
}

function primeDim(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((material) => {
      if (!material || material.userData.retain) return;
      material.transparent = true;
      material.opacity = 1;
    });
  });
}

function setDim(root: THREE.Object3D, opacity: number) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((material) => {
      if (!material || material.userData.retain) return;
      material.opacity = opacity;
    });
  });
}

/**
 * One WebGL context for the whole category. GLBs come from the raid's shared
 * loader cache. A failed model becomes a marked stand-in instead of taking
 * the rest of the lineup down.
 */
export default function CharacterLineupStage({
  characters,
  selectedId,
  category,
  onStatus,
}: {
  characters: RaidCharacter[];
  selectedId: string | null;
  category: PremiereCategory;
  onStatus?: (status: Record<string, ModelStatus>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef(selectedId);
  const categoryRef = useRef(category);
  const statusRef = useRef(onStatus);
  const [notice, setNotice] = useState('Gathering the lineup…');
  selectedRef.current = selectedId;
  categoryRef.current = category;
  statusRef.current = onStatus;
  const lineupKey = characters.map((character) => character.id).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    const lineup = characters.filter((character) => character.ryderId);
    const actors: Actor[] = [];
    const status: Record<string, ModelStatus> = {};
    lineup.forEach((character) => {
      status[character.id] = 'loading';
    });
    statusRef.current?.({ ...status });
    setNotice(lineup.length ? 'Gathering the lineup…' : '');

    let renderer: THREE.WebGLRenderer;
    try {
      const quality = readQuality();
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality.antialias,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(quality.pixelRatio);
      renderer.setClearColor(0x07060c, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x07060c, 9, 24);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 48);
      const camPos = new THREE.Vector3(0, 1.7, 6);
      const look = new THREE.Vector3(0, 1.02, 0);
      const camGoal = new THREE.Vector3();
      const lookGoal = new THREE.Vector3();

      const hemi = new THREE.HemisphereLight(0xffe7c2, 0x120814, 0.92);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xfff4e8, 1.4);
      key.position.set(-3.2, 6.5, 4.4);
      key.castShadow = true;
      key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      key.shadow.camera.near = 0.4;
      key.shadow.camera.far = 26;
      key.shadow.bias = -0.00035;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xff4d8d, 0.72);
      rim.position.set(3.2, 2.6, -1.5);
      scene.add(rim);
      const auraLight = new THREE.PointLight(0xffffff, 0, 4.8, 2);
      scene.add(auraLight);

      const floorGeo = new THREE.CircleGeometry(9, 56);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x2c3344, metalness: 0.28, roughness: 0.42 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const sparkCount = quality.particles;
      const sparkPositions = new Float32Array(sparkCount * 3);
      for (let i = 0; i < sparkCount; i += 1) {
        sparkPositions[i * 3] = (Math.random() - 0.5) * 9;
        sparkPositions[i * 3 + 1] = Math.random() * 2.5;
        sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 4.5;
      }
      const sparkGeo = new THREE.BufferGeometry();
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
      const sparkMat = new THREE.PointsMaterial({
        color: 0xffd36a,
        size: 0.038,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const sparks = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparks);

      const paintCategory = () => {
        const tone = CATEGORY_LIGHT[categoryRef.current];
        hemi.color.setHex(tone.hemi);
        rim.color.setHex(tone.rim);
        sparkMat.color.setHex(tone.spark);
      };

      const resize = () => {
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      renderer.clear();
      renderer.render(scene, camera);
      const observer = new ResizeObserver(resize);
      observer.observe(canvas.parentElement ?? canvas);
      window.addEventListener('resize', resize);
      const clock = new THREE.Clock();

      const place = () => {
        const widths = actors.map((actor) => {
          actor.fighter.humanoid.group.updateWorldMatrix(true, true);
          const box = new THREE.Box3().setFromObject(actor.fighter.humanoid.group);
          const size = box.getSize(new THREE.Vector3());
          if (size.y > 0.35) actor.fighter.humanoid.group.scale.multiplyScalar(1.75 / size.y);
          const fitted = new THREE.Box3().setFromObject(actor.fighter.humanoid.group);
          return Math.max(0.55, fitted.getSize(new THREE.Vector3()).x);
        });
        const slots = lineupFormation(actors.length, lineupGap(widths));
        actors.forEach((actor, index) => {
          actor.slotX = slots[index]?.x ?? 0;
          actor.slotZ = slots[index]?.z ?? 0;
          actor.fighter.humanoid.group.position.x = actor.slotX;
          actor.fighter.humanoid.group.position.z = actor.slotZ;
        });
        const span = slots.reduce((max, slot) => Math.max(max, Math.abs(slot.x)), 1);
        floor.scale.setScalar(Math.max(1, (span + 2.2) / 9));
        const half = span + 2.4;
        key.shadow.camera.left = -half;
        key.shadow.camera.right = half;
        key.shadow.camera.top = half;
        key.shadow.camera.bottom = -half;
        key.shadow.camera.updateProjectionMatrix();
      };

      const loop = () => {
        if (disposed) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, clock.getDelta());
        const time = clock.elapsedTime;
        paintCategory();
        const preview = actors.map((actor) => ({
          index: 0,
          x: actor.slotX,
          z: actor.slotZ + (actor.id === selectedRef.current ? 0.95 : 0),
          row: 0,
        }));
        const frame = lineupFrame(preview, camera.aspect || 1);
        camGoal.set(frame.x, frame.y, frame.z);
        lookGoal.set(frame.lookX, frame.lookY, frame.lookZ);
        const blend = 1 - Math.pow(0.0015, dt);
        camPos.lerp(camGoal, blend);
        look.lerp(lookGoal, blend);
        camera.position.copy(camPos);
        camera.lookAt(look);

        let chosen: Actor | null = null;
        for (const actor of actors) {
          const selected = actor.id === selectedRef.current;
          if (selected) chosen = actor;
          actor.present += ((selected ? 1 : 0) - actor.present) * Math.min(1, dt * 4.4);
          actor.phase += dt * (selected ? 4.6 : 3.1);
          const group = actor.fighter.humanoid.group;
          const face = actor.id === 'keven' ? Math.PI : 0;
          const idle = Math.sin(time * 0.65 + actor.slotX) * 0.07 * (selected ? 0.2 : 1);
          const targetYaw = face + (1 - actor.present) * 0.55 + idle;
          const targetX = actor.slotX;
          const targetZ = actor.slotZ + actor.present * 0.95;
          const step = Math.min(1, dt * 4.4);
          group.position.x += (targetX - group.position.x) * step;
          group.position.y += (0 - group.position.y) * Math.min(1, dt * 3.2);
          group.position.z += (targetZ - group.position.z) * step;
          group.rotation.y += (targetYaw - group.rotation.y) * step;
          const pose =
            selected && actor.id !== 'leo' && actor.fighter.rig?.skeleton
              ? { kind: 'finish' as const, t: 0.55 + Math.sin(time * 1.3) * 0.04, weight: actor.present * 0.42 }
              : null;
          if (actor.fighter.meshSource === 'gltf') {
            animateGltfFighter(actor.fighter, dt, actor.phase, 0, false, 0, false, { pose, camera });
          } else {
            animateHumanoid(actor.fighter.humanoid, actor.phase, 0, time);
          }
          setDim(group, 1 - (1 - actor.present) * 0.4);
          const ringMat = actor.ring.material as THREE.MeshBasicMaterial;
          ringMat.opacity = 0.2 + actor.present * 0.65;
          actor.ring.position.set(group.position.x, 0.03, group.position.z);
          const ringScale = 1 + actor.present * 0.3;
          actor.ring.scale.set(ringScale, ringScale, 1);
        }
        if (chosen) {
          auraLight.color.setHex(RYDERZ[chosen.id as RyderId]?.color ?? 0xffffff);
          // Yellow washes out Leo's textured face and outfit much faster than
          // the other aura colors. Keep enough rim light to identify her while
          // letting the model's shape and shading remain visible.
          const auraIntensity = chosen.id === 'leo' ? 0.62 : 1.65;
          auraLight.intensity += (auraIntensity - auraLight.intensity) * Math.min(1, dt * 4);
          const spot = chosen.fighter.humanoid.group.position;
          auraLight.position.set(spot.x, 1.2, spot.z + 0.4);
        } else {
          auraLight.intensity += (0 - auraLight.intensity) * Math.min(1, dt * 4);
        }
        const attr = sparkGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < sparkCount; i += 1) {
          let y = attr.getY(i) + dt * 0.1;
          if (y > 2.6) y = 0.04;
          attr.setY(i, y);
        }
        attr.needsUpdate = true;
        if (!document.hidden) renderer.render(scene, camera);
      };

      const stop = () => {
        disposed = true;
        cancelAnimationFrame(raf);
        observer.disconnect();
        window.removeEventListener('resize', resize);
        for (const actor of actors) {
          scene.remove(actor.fighter.humanoid.group);
          disposeObject(actor.fighter.humanoid.group);
          actor.ring.geometry.dispose();
          (actor.ring.material as THREE.Material).dispose();
          scene.remove(actor.ring);
        }
        floorGeo.dispose();
        floorMat.dispose();
        sparkGeo.dispose();
        sparkMat.dispose();
        renderer.dispose();
      };

      void (async () => {
        const built: Array<Actor | null> = lineup.map(() => null);
        await Promise.all(
          lineup.map(async (character, index) => {
            const id = character.ryderId as RyderId;
            const spec = RYDERZ[id];
            let missing = !spec?.glb;
            if (spec?.glb) {
              const load = preloadRyderGltf(spec);
              load.catch(() => undefined);
              try {
                await Promise.race([
                  load,
                  new Promise((_, reject) => {
                    window.setTimeout(() => reject(new Error('timed out')), 15000);
                  }),
                ]);
              } catch (error) {
                missing = true;
                console.warn('[premiere] model failed', spec.glb, error);
              }
            }
            if (disposed || !spec) return;
            let fighter: Fighter;
            try {
              fighter = buildRyder(spec);
            } catch (error) {
              missing = true;
              status[character.id] = 'missing';
              console.warn('[premiere] could not build', id, error);
              return;
            }
            if (disposed) {
              disposeObject(fighter.humanoid.group);
              return;
            }
            primeDim(fighter.humanoid.group);
            fighter.humanoid.group.traverse((object) => {
              const mesh = object as THREE.Mesh;
              if (mesh.isMesh) mesh.castShadow = true;
            });
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.32, 0.5, 28),
              new THREE.MeshBasicMaterial({
                color: spec.color,
                transparent: true,
                opacity: 0.24,
                side: THREE.DoubleSide,
                depthWrite: false,
              }),
            );
            ring.rotation.x = -Math.PI / 2;
            scene.add(ring);
            fighter.humanoid.group.position.y = -0.4;
            scene.add(fighter.humanoid.group);
            status[character.id] = missing ? 'missing' : 'ready';
            built[index] = {
              id: character.id,
              fighter,
              ring,
              slotX: 0,
              slotZ: 0,
              present: character.id === selectedRef.current ? 1 : 0,
              phase: index * 0.7,
            };
          }),
        );
        if (disposed) {
          built.forEach((actor) => {
            if (!actor) return;
            scene.remove(actor.fighter.humanoid.group);
            scene.remove(actor.ring);
            disposeObject(actor.fighter.humanoid.group);
            actor.ring.geometry.dispose();
            (actor.ring.material as THREE.Material).dispose();
          });
          return;
        }
        built.forEach((actor) => {
          if (actor) actors.push(actor);
        });
        place();
        statusRef.current?.({ ...status });
        setNotice('');
        clock.start();
        raf = requestAnimationFrame(loop);
      })();

      return stop;
    } catch (error) {
      console.warn('[premiere] lineup renderer failed', error);
      setNotice('The 3D lineup could not start. The roster below still works.');
      return undefined;
    }
    // The lineup identity is the id string. `characters` is read from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineupKey]);

  return (
      <div className={`${styles.stage} ${notice ? styles.stageBusy : ''}`}>
      <canvas ref={canvasRef} aria-hidden="true" />
      {notice ? <p className={styles.stageNotice}>{notice}</p> : null}
    </div>
  );
}
