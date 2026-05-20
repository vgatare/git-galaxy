import * as THREE from "three";

import type { GalaxyData, GalaxyNode } from "../galaxy/types";

/**
 * DOM-overlay directory labels. Each visible directory becomes an absolutely
 * positioned <div> on top of the canvas; each frame we project its 3D
 * position to screen space and update its transform.
 *
 * We render at most MAX_LABELS, ranked by visual importance (subtree size,
 * shallower depth) so even on huge repos the screen stays readable.
 */

const MAX_LABELS = 240;
const TMP = new THREE.Vector3();

interface LabelEntry {
  node: GalaxyNode;
  el: HTMLDivElement;
  baseOpacity: number;
  baseScale: number;
}

export interface LabelsHandle {
  setGalaxy(galaxy: GalaxyData): void;
  /** Mirror the GPU-side visibility mask so isolation hides labels too. */
  setVisibilityMask(mask: Float32Array): void;
  update(camera: THREE.PerspectiveCamera, w: number, h: number): void;
  clear(): void;
}

export function createLabels(container: HTMLElement): LabelsHandle {
  let entries: LabelEntry[] = [];
  let galaxy: GalaxyData | null = null;
  let visibilityMask: Float32Array | null = null;

  function clear() {
    for (const e of entries) e.el.remove();
    entries = [];
    galaxy = null;
    visibilityMask = null;
  }

  function rank(node: GalaxyNode): number {
    // Bigger subtree + shallower depth = more important.
    return Math.log2(node.subtreeCount + 2) * 4 - node.depth * 1.1;
  }

  function buildEntries(g: GalaxyData) {
    const dirs = g.nodes.filter((n) => n.kind === "dir" && n.depth > 0);
    dirs.sort((a, b) => rank(b) - rank(a));
    const cap = Math.min(MAX_LABELS, dirs.length);
    for (let i = 0; i < cap; i++) {
      const node = dirs[i];
      const el = document.createElement("div");
      el.className = "galaxy-label";
      el.textContent = node.name;
      // Visual weight: shallow dirs (root packages) get larger, bolder labels;
      // deep dirs shrink so they don't compete with parents.
      const weight = Math.max(0.62, 1.0 - (node.depth - 1) * 0.1);
      const fontSize = Math.round(weight * 14);
      el.style.fontSize = `${fontSize}px`;
      if (node.depth <= 1) el.classList.add("galaxy-label--root");
      // Tint with the directory's color so packages have identity.
      el.style.setProperty("--label-tint", node.color);
      container.appendChild(el);
      entries.push({
        node,
        el,
        baseOpacity: Math.min(1, 0.55 + Math.log2(node.subtreeCount + 2) * 0.14),
        baseScale: weight,
      });
    }
  }

  return {
    setGalaxy(g) {
      clear();
      galaxy = g;
      buildEntries(g);
    },
    setVisibilityMask(mask) {
      visibilityMask = mask;
    },
    update(camera, w, h) {
      if (!galaxy || entries.length === 0) return;
      const halfW = w * 0.5;
      const halfH = h * 0.5;
      const cameraPos = camera.position;
      for (const entry of entries) {
        const { node, el, baseOpacity, baseScale } = entry;
        const idx = galaxy.byId.get(node.id);
        if (idx === undefined) {
          el.style.display = "none";
          continue;
        }
        if (visibilityMask && visibilityMask[idx] < 0.5) {
          el.style.display = "none";
          continue;
        }
        TMP.set(node.x, node.y, node.z);
        const dx = TMP.x - cameraPos.x;
        const dy = TMP.y - cameraPos.y;
        const dz = TMP.z - cameraPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        TMP.project(camera);
        if (TMP.z < -1 || TMP.z > 1) {
          el.style.display = "none";
          continue;
        }
        const sx = halfW + TMP.x * halfW;
        const sy = halfH - TMP.y * halfH;
        // Fade with distance — small dirs vanish first as you pull out.
        // Bigger subtrees keep their label readable from further away.
        const fadeStart = 100;
        const fadeRange = 700 + node.subtreeCount * 10;
        const distFade = Math.max(
          0,
          Math.min(1, 1 - (dist - fadeStart) / fadeRange),
        );
        const opacity = baseOpacity * distFade;
        if (opacity < 0.05) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "block";
        el.style.opacity = opacity.toFixed(3);
        const scale = baseScale * (0.85 + distFade * 0.3);
        // Lift the label a bit above the star so it doesn't sit on top of the glow.
        const yOffset = -10 - node.radius * 2;
        el.style.transform = `translate3d(${sx}px, ${sy + yOffset}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      }
    },
    clear,
  };
}
