import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface CameraRig {
  controls: OrbitControls;
  /** Smoothly move the camera to focus on a world-space target. */
  focusOn(target: THREE.Vector3, distance?: number): void;
  /** Reset to default galaxy-wide view. */
  resetView(maxRadius: number): void;
  /** Cinematic fly-in from very far away to the default view. */
  cinematicEntrance(maxRadius: number): void;
  /** Update per-frame. */
  tick(dt: number): void;
  dispose(): void;
}

interface FlyToState {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  duration: number;
  elapsed: number;
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  dom: HTMLElement,
): CameraRig {
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.6;
  controls.minDistance = 4;
  controls.maxDistance = 1600;
  controls.target.set(0, 0, 0);
  controls.update();

  // Gentle auto-rotate when the user is idle.
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.25;

  // Cancel auto-rotate on user interaction.
  const cancelAuto = () => {
    controls.autoRotate = false;
  };
  dom.addEventListener("pointerdown", cancelAuto);
  dom.addEventListener("wheel", cancelAuto, { passive: true });

  let flyTo: FlyToState | null = null;

  function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  return {
    controls,
    focusOn(target, distance = 18) {
      controls.autoRotate = false;
      const fromPos = camera.position.clone();
      const dir = camera.position.clone().sub(controls.target).normalize();
      const toPos = target.clone().add(dir.multiplyScalar(distance));
      flyTo = {
        fromPos,
        toPos,
        fromTarget: controls.target.clone(),
        toTarget: target.clone(),
        duration: 0.9,
        elapsed: 0,
      };
    },
    resetView(maxRadius) {
      controls.autoRotate = true;
      const d = Math.max(180, maxRadius * 2.4);
      const fromPos = camera.position.clone();
      const fromTarget = controls.target.clone();
      const toPos = new THREE.Vector3(0, d * 0.35, d);
      flyTo = {
        fromPos,
        toPos,
        fromTarget,
        toTarget: new THREE.Vector3(0, 0, 0),
        duration: 1.0,
        elapsed: 0,
      };
    },
    cinematicEntrance(maxRadius) {
      controls.autoRotate = true;
      const restingDistance = Math.max(180, maxRadius * 2.4);
      // Start ~6x further out, slightly off-axis, then ease into the resting view.
      const startDistance = restingDistance * 5.5;
      camera.position.set(
        startDistance * 0.15,
        startDistance * 0.55,
        startDistance,
      );
      controls.target.set(0, 0, 0);
      controls.update();
      flyTo = {
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(0, restingDistance * 0.35, restingDistance),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(0, 0, 0),
        duration: 2.4,
        elapsed: 0,
      };
    },
    tick(dt) {
      if (flyTo) {
        flyTo.elapsed += dt;
        const t = Math.min(1, flyTo.elapsed / flyTo.duration);
        const k = easeInOut(t);
        camera.position.lerpVectors(flyTo.fromPos, flyTo.toPos, k);
        controls.target.lerpVectors(flyTo.fromTarget, flyTo.toTarget, k);
        if (t >= 1) flyTo = null;
      }
      controls.update();
    },
    dispose() {
      controls.dispose();
      dom.removeEventListener("pointerdown", cancelAuto);
      dom.removeEventListener("wheel", cancelAuto);
    },
  };
}
