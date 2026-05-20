import * as THREE from "three";

import type { GalaxyData } from "../galaxy/types";

export interface ConnectionsHandle {
  object: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  dispose(): void;
}

/**
 * Render subtle directory -> child line connections as `LineSegments`.
 * We only draw connections involving directories so the picture doesn't
 * get visually overwhelmed for huge file-heavy repos.
 */
export function buildConnections(galaxy: GalaxyData): ConnectionsHandle {
  // Only include edges where at least one endpoint is a directory.
  const filteredEdges = galaxy.edges.filter((e) => {
    const from = galaxy.nodes[galaxy.byId.get(e.from)!];
    const to = galaxy.nodes[galaxy.byId.get(e.to)!];
    return from.kind === "dir" || to.kind === "dir";
  });

  const positions = new Float32Array(filteredEdges.length * 6);
  const colors = new Float32Array(filteredEdges.length * 6);

  for (let i = 0; i < filteredEdges.length; i++) {
    const edge = filteredEdges[i];
    const a = galaxy.nodes[galaxy.byId.get(edge.from)!];
    const b = galaxy.nodes[galaxy.byId.get(edge.to)!];

    positions[i * 6 + 0] = a.x;
    positions[i * 6 + 1] = a.y;
    positions[i * 6 + 2] = a.z;
    positions[i * 6 + 3] = b.x;
    positions[i * 6 + 4] = b.y;
    positions[i * 6 + 5] = b.z;

    // Connection lines are very subtle (low alpha cyan/violet).
    colors[i * 6 + 0] = 0.45;
    colors[i * 6 + 1] = 0.6;
    colors[i * 6 + 2] = 0.85;
    colors[i * 6 + 3] = 0.6;
    colors[i * 6 + 4] = 0.45;
    colors[i * 6 + 5] = 0.95;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;

  return {
    object: lines,
    geometry,
    material,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
