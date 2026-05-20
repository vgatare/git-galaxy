import * as THREE from "three";

import nebulaVert from "./shaders/nebula.vert.glsl?raw";
import nebulaFrag from "./shaders/nebula.frag.glsl?raw";

export interface NebulaHandle {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  tick(time: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function buildNebula(): NebulaHandle {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
    },
    vertexShader: nebulaVert,
    fragmentShader: nebulaFrag,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return {
    mesh,
    material,
    tick(time) {
      material.uniforms.uTime.value = time;
    },
    resize(width, height) {
      const res = material.uniforms.uResolution.value as THREE.Vector2;
      res.set(width, height);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
