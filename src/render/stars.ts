import * as THREE from "three";

import { hexToRgb } from "../galaxy/colors";
import type { GalaxyData } from "../galaxy/types";
import starVert from "./shaders/star.vert.glsl?raw";
import starFrag from "./shaders/star.frag.glsl?raw";

export interface StarFieldHandle {
  object: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  /** Update time-based uniforms per frame. */
  tick(time: number): void;
  /** Update the highlighted star (by node index in galaxy.nodes). Pass -1 to clear. */
  setHighlight(nodeIndex: number): void;
  /** Toggle visibility for a star by index (1 = visible, 0 = hidden). */
  setVisibility(nodeIndex: number, visible: boolean): void;
  /** Re-upload the entire visibility buffer at once. */
  setVisibilityMask(mask: Float32Array): void;
  /** Apply a brightness scale to a single star. */
  setSizeMultiplier(nodeIndex: number, multiplier: number): void;
  /** Get the world position of a star. */
  positionOf(nodeIndex: number, out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export function buildStarField(galaxy: GalaxyData): StarFieldHandle {
  const count = galaxy.nodes.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const baseSizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const ids = new Float32Array(count);
  const visible = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const n = galaxy.nodes[i];
    positions[i * 3 + 0] = n.x;
    positions[i * 3 + 1] = n.y;
    positions[i * 3 + 2] = n.z;
    const [r, g, b] = hexToRgb(n.color);
    colors[i * 3 + 0] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    sizes[i] = n.radius;
    baseSizes[i] = n.radius;
    // Pseudo-random per-star seed for twinkling.
    seeds[i] = ((i * 9301 + 49297) % 233280) / 233280;
    ids[i] = i;
    visible[i] = 1.0;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute("starColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("starSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("starSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("starId", new THREE.BufferAttribute(ids, 1));
  geometry.setAttribute(
    "starVisible",
    new THREE.BufferAttribute(visible, 1),
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
      uViewport: {
        value: window.innerHeight ? window.innerHeight * 0.5 : 400,
      },
      uHighlightId: { value: -1 },
    },
    vertexShader: starVert,
    fragmentShader: starFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  const sizeAttr = geometry.getAttribute("starSize") as THREE.BufferAttribute;
  const visibleAttr = geometry.getAttribute(
    "starVisible",
  ) as THREE.BufferAttribute;

  return {
    object: points,
    geometry,
    material,
    tick(time) {
      material.uniforms.uTime.value = time;
    },
    setHighlight(nodeIndex) {
      material.uniforms.uHighlightId.value = nodeIndex;
    },
    setVisibility(nodeIndex, isVisible) {
      visible[nodeIndex] = isVisible ? 1 : 0;
      visibleAttr.needsUpdate = true;
    },
    setVisibilityMask(mask) {
      if (mask.length !== visible.length) {
        throw new Error("Visibility mask length mismatch");
      }
      visible.set(mask);
      visibleAttr.needsUpdate = true;
    },
    setSizeMultiplier(nodeIndex, multiplier) {
      sizes[nodeIndex] = baseSizes[nodeIndex] * multiplier;
      sizeAttr.needsUpdate = true;
    },
    positionOf(nodeIndex, out) {
      out.set(
        positions[nodeIndex * 3 + 0],
        positions[nodeIndex * 3 + 1],
        positions[nodeIndex * 3 + 2],
      );
      return out;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
