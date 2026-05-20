import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface StageHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createStage(canvas: HTMLCanvasElement): StageHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    8000,
  );
  camera.position.set(0, 80, 240);
  camera.lookAt(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // strength, radius, threshold. High threshold so only the brightest cores
  // bloom — keeps the picture clean even with thousands of stars.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42,
    0.45,
    0.78,
  );
  composer.addPass(bloom);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  function resize(width: number, height: number) {
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    bloom.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  return {
    scene,
    camera,
    renderer,
    composer,
    bloom,
    resize,
    dispose() {
      renderer.dispose();
    },
  };
}
