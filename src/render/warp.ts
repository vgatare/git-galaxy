import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

import warpFrag from "./shaders/warp.frag.glsl?raw";

export interface WarpHandle {
  pass: ShaderPass;
  activate(duration?: number): void;
  tick(dt: number, time: number): void;
  readonly active: boolean;
}

const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export function createWarp(): WarpHandle {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uIntensity: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    vertexShader: PASSTHROUGH_VERT,
    fragmentShader: warpFrag,
  });

  let duration = 0;
  let elapsed = 0;
  let isActive = false;

  return {
    pass,
    get active() {
      return isActive;
    },
    activate(dur = 0.8) {
      duration = dur;
      elapsed = 0;
      isActive = true;
    },
    tick(dt, time) {
      pass.uniforms.uTime.value = time;
      if (!isActive) {
        pass.uniforms.uIntensity.value = 0;
        return;
      }
      elapsed += dt;
      const t = elapsed / duration;
      let intensity: number;
      if (t < 0.25) {
        intensity = t / 0.25;
      } else if (t < 0.65) {
        intensity = 1.0;
      } else if (t < 1.0) {
        intensity = (1.0 - t) / 0.35;
      } else {
        intensity = 0;
        isActive = false;
      }
      pass.uniforms.uIntensity.value = intensity * 0.85;
    },
  };
}
