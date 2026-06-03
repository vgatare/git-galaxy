import * as THREE from "three";

import type { GalaxyData, GalaxyNode } from "../galaxy/types";
import cometVert from "./shaders/comet.vert.glsl?raw";
import cometFrag from "./shaders/comet.frag.glsl?raw";

const NUM_COMETS = 8;
const TRAIL_LEN = 40;
const TOTAL = NUM_COMETS * TRAIL_LEN;

interface CometState {
  source: THREE.Vector3;
  target: THREE.Vector3;
  control: THREE.Vector3;
  progress: number;
  speed: number;
  trail: THREE.Vector3[];
}

export interface CometSystem {
  object: THREE.Points;
  setGalaxy(galaxy: GalaxyData): void;
  clear(): void;
  tick(dt: number): void;
  dispose(): void;
}

const PALETTE: [number, number, number][] = [
  [0.3, 0.75, 1.0],
  [1.0, 0.5, 0.2],
  [0.45, 1.0, 0.55],
  [1.0, 0.35, 0.55],
  [0.8, 0.6, 1.0],
  [1.0, 0.85, 0.3],
  [0.3, 1.0, 0.8],
  [1.0, 0.3, 0.3],
];

function pick(arr: GalaxyNode[]): GalaxyNode {
  return arr[Math.floor(Math.random() * arr.length)];
}

function midControl(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const spread = a.distanceTo(b) * 0.5;
  mid.x += (Math.random() - 0.5) * spread;
  mid.y += (Math.random() - 0.5) * spread;
  mid.z += (Math.random() - 0.5) * spread;
  return mid;
}

function bezier(
  a: THREE.Vector3,
  c: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): void {
  const u = 1 - t;
  out.x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
  out.y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
  out.z = u * u * a.z + 2 * u * t * c.z + t * t * b.z;
}

export function createCometSystem(): CometSystem {
  const positions = new Float32Array(TOTAL * 3);
  const alphas = new Float32Array(TOTAL);
  const colors = new Float32Array(TOTAL * 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cometAlpha", new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute("cometColor", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
    },
    vertexShader: cometVert,
    fragmentShader: cometFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const alphaAttr = geometry.getAttribute("cometAlpha") as THREE.BufferAttribute;
  const colorAttr = geometry.getAttribute("cometColor") as THREE.BufferAttribute;

  let comets: CometState[] = [];
  let fileNodes: GalaxyNode[] = [];
  const tmpVec = new THREE.Vector3();

  function initComets(): void {
    comets = [];
    for (let i = 0; i < NUM_COMETS; i++) {
      const src = pick(fileNodes);
      const dst = pick(fileNodes);
      const source = new THREE.Vector3(src.x, src.y, src.z);
      const target = new THREE.Vector3(dst.x, dst.y, dst.z);
      const control = midControl(source, target);
      const color = PALETTE[i % PALETTE.length];

      const trail: THREE.Vector3[] = [];
      for (let j = 0; j < TRAIL_LEN; j++) trail.push(source.clone());

      comets.push({
        source,
        target,
        control,
        progress: Math.random(),
        speed: 0.25 + Math.random() * 0.35,
        trail,
      });

      for (let j = 0; j < TRAIL_LEN; j++) {
        const idx = i * TRAIL_LEN + j;
        colors[idx * 3] = color[0];
        colors[idx * 3 + 1] = color[1];
        colors[idx * 3 + 2] = color[2];
      }
    }
    colorAttr.needsUpdate = true;
  }

  return {
    object: points,

    setGalaxy(galaxy) {
      fileNodes = galaxy.nodes.filter((n) => n.kind === "file");
      if (fileNodes.length < 2) {
        this.clear();
        return;
      }
      initComets();
    },

    clear() {
      comets = [];
      fileNodes = [];
      alphas.fill(0);
      alphaAttr.needsUpdate = true;
    },

    tick(dt) {
      if (comets.length === 0 || fileNodes.length < 2) return;

      for (let i = 0; i < NUM_COMETS; i++) {
        const comet = comets[i];
        comet.progress += dt * comet.speed;

        if (comet.progress >= 1.0) {
          comet.source.copy(comet.target);
          const dst = pick(fileNodes);
          comet.target.set(dst.x, dst.y, dst.z);
          comet.control.copy(midControl(comet.source, comet.target));
          comet.progress = 0;
          comet.speed = 0.25 + Math.random() * 0.35;
        }

        bezier(
          comet.source,
          comet.control,
          comet.target,
          comet.progress,
          tmpVec,
        );

        for (let j = TRAIL_LEN - 1; j > 0; j--) {
          comet.trail[j].copy(comet.trail[j - 1]);
        }
        comet.trail[0].copy(tmpVec);

        for (let j = 0; j < TRAIL_LEN; j++) {
          const idx = i * TRAIL_LEN + j;
          const pos = comet.trail[j];
          positions[idx * 3] = pos.x;
          positions[idx * 3 + 1] = pos.y;
          positions[idx * 3 + 2] = pos.z;
          alphas[idx] = Math.pow(1.0 - j / (TRAIL_LEN - 1), 2.5);
        }
      }

      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
