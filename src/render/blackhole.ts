import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import type { GalaxyData } from "../galaxy/types";
import accretionVert from "./shaders/accretion.vert.glsl?raw";
import accretionFrag from "./shaders/accretion.frag.glsl?raw";
import lensingFrag from "./shaders/lensing.frag.glsl?raw";

const MAX_BH = 4;

export interface BlackHoleSystem {
  group: THREE.Group;
  lensingPass: ShaderPass;
  setGalaxy(galaxy: GalaxyData): void;
  clearGalaxy(): void;
  tick(
    time: number,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): void;
  dispose(): void;
}

interface BHEntry {
  disk: THREE.Mesh;
  material: THREE.ShaderMaterial;
  position: THREE.Vector3;
  mass: number;
}

const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export function createBlackHoleSystem(): BlackHoleSystem {
  const group = new THREE.Group();
  group.frustumCulled = false;

  const lensingPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
      uBHPositions: {
        value: Array.from(
          { length: MAX_BH },
          () => new THREE.Vector2(-10, -10),
        ),
      },
      uBHMasses: { value: [0, 0, 0, 0] },
      uTime: { value: 0 },
    },
    vertexShader: PASSTHROUGH_VERT,
    fragmentShader: lensingFrag,
  });

  let entries: BHEntry[] = [];
  const tmpVec = new THREE.Vector3();

  function clearEntries(): void {
    for (const e of entries) {
      group.remove(e.disk);
      e.disk.geometry.dispose();
      e.material.dispose();
    }
    entries = [];
    (lensingPass.uniforms.uBHMasses.value as number[]).fill(0);
  }

  return {
    group,
    lensingPass,

    setGalaxy(galaxy) {
      clearEntries();

      const candidates = galaxy.nodes
        .filter(
          (n) =>
            n.kind === "dir" && n.subtreeCount >= 15 && n.id !== "__root__",
        )
        .sort((a, b) => b.subtreeCount - a.subtreeCount)
        .slice(0, MAX_BH);

      for (const node of candidates) {
        const position = new THREE.Vector3(node.x, node.y, node.z);
        const mass = Math.log10(Math.max(1, node.subtreeCount)) * 0.8;
        const diskScale = 2 + mass * 2.5;

        const geometry = new THREE.RingGeometry(diskScale * 0.3, diskScale, 64);
        const material = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 } },
          vertexShader: accretionVert,
          fragmentShader: accretionFrag,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        });

        const disk = new THREE.Mesh(geometry, material);
        disk.position.copy(position);

        // Unique tilt per black hole based on path hash
        let hash = 0;
        for (let i = 0; i < node.path.length; i++) {
          hash = (hash * 31 + node.path.charCodeAt(i)) >>> 0;
        }
        disk.rotation.x = ((hash & 0xffff) / 0xffff) * Math.PI;
        disk.rotation.z = (((hash >>> 16) & 0xffff) / 0xffff) * Math.PI;

        group.add(disk);
        entries.push({ disk, material, position, mass });
      }
    },

    clearGalaxy() {
      clearEntries();
    },

    tick(time, camera, width, height) {
      for (const e of entries) {
        e.material.uniforms.uTime.value = time;
      }

      const positions = lensingPass.uniforms.uBHPositions
        .value as THREE.Vector2[];
      const masses = lensingPass.uniforms.uBHMasses.value as number[];

      for (let i = 0; i < MAX_BH; i++) {
        if (i < entries.length) {
          const e = entries[i];
          tmpVec.copy(e.position).project(camera);

          if (tmpVec.z > 1) {
            masses[i] = 0;
            positions[i].set(-10, -10);
            continue;
          }

          positions[i].set((tmpVec.x + 1) * 0.5, (tmpVec.y + 1) * 0.5);
          const dist = camera.position.distanceTo(e.position);
          masses[i] = e.mass / Math.max(1, dist * 0.008);
        } else {
          positions[i].set(-10, -10);
          masses[i] = 0;
        }
      }

      lensingPass.uniforms.uResolution.value.set(width, height);
      lensingPass.uniforms.uTime.value = time;
    },

    dispose() {
      clearEntries();
    },
  };
}
