import * as THREE from "three";

import type { GalaxyData } from "../galaxy/types";

/**
 * Project every star into NDC and pick the one closest to the cursor (within
 * a generous pixel radius). Built bespoke because Three.js' Raycaster against
 * a custom-shader Points cloud doesn't account for variable point sizes.
 */
export class StarPicker {
  private cache: Float32Array; // screen-space xy + depth per node
  private valid = false;
  private camera: THREE.PerspectiveCamera;
  private galaxy: GalaxyData;
  private viewport = { w: 1, h: 1 };
  private tmpVec = new THREE.Vector3();

  /** Pixel radius for hit-testing — generous to make hover feel forgiving. */
  hitRadiusPx = 22;

  constructor(camera: THREE.PerspectiveCamera, galaxy: GalaxyData) {
    this.camera = camera;
    this.galaxy = galaxy;
    this.cache = new Float32Array(galaxy.nodes.length * 3);
  }

  setViewport(width: number, height: number): void {
    this.viewport.w = width;
    this.viewport.h = height;
    this.valid = false;
  }

  /** Recompute screen-space cache. Should be called once per frame before picking. */
  refresh(): void {
    const { camera, galaxy, viewport, tmpVec } = this;
    const w = viewport.w;
    const h = viewport.h;
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    for (let i = 0; i < galaxy.nodes.length; i++) {
      const n = galaxy.nodes[i];
      tmpVec.set(n.x, n.y, n.z);
      tmpVec.project(camera);
      this.cache[i * 3 + 0] = halfW + tmpVec.x * halfW;
      this.cache[i * 3 + 1] = halfH - tmpVec.y * halfH;
      this.cache[i * 3 + 2] = tmpVec.z; // depth in NDC ([-1,1])
    }
    this.valid = true;
  }

  /** Return the node index closest to (px, py), or -1 if none within hit radius. */
  pick(px: number, py: number, visibilityMask?: Float32Array): number {
    if (!this.valid) this.refresh();
    const r2 = this.hitRadiusPx * this.hitRadiusPx;
    let bestIndex = -1;
    let bestDist = Infinity;
    const cache = this.cache;
    for (let i = 0; i < this.galaxy.nodes.length; i++) {
      if (visibilityMask && visibilityMask[i] < 0.5) continue;
      const sx = cache[i * 3 + 0];
      const sy = cache[i * 3 + 1];
      const sz = cache[i * 3 + 2];
      if (sz < -1 || sz > 1) continue;
      const dx = sx - px;
      const dy = sy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 < bestDist) {
        bestDist = d2;
        bestIndex = i;
      }
    }
    return bestIndex;
  }
}
