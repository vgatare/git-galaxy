import * as THREE from "three";

import { hexToRgb } from "../galaxy/colors";

const POOL_SIZE = 6;
const RING_SEGMENTS = 96;

interface PoolEntry {
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
  glowMaterial: THREE.SpriteMaterial;
  elapsed: number;
  duration: number;
  active: boolean;
  color: THREE.Color;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.7, "rgba(255,255,255,0.0)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Supernovas {
  group = new THREE.Group();
  private pool: PoolEntry[] = [];
  private glowTexture: THREE.CanvasTexture;

  constructor() {
    this.group.frustumCulled = false;
    this.glowTexture = makeGlowTexture();
    for (let i = 0; i < POOL_SIZE; i++) {
      const ringGeo = new THREE.RingGeometry(1, 1.04, RING_SEGMENTS);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.visible = false;
      this.group.add(ring);

      const glowMat = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.visible = false;
      this.group.add(glow);

      this.pool.push({
        ring,
        ringMaterial: ringMat,
        glow,
        glowMaterial: glowMat,
        elapsed: 0,
        duration: 1.6,
        active: false,
        color: new THREE.Color(0xffffff),
      });
    }
  }

  emit(position: THREE.Vector3, hexColor: string, scale: number = 14): void {
    // Find an inactive entry, or replace the oldest active one.
    let target = this.pool.find((p) => !p.active);
    if (!target) {
      target = this.pool.reduce((a, b) =>
        a.elapsed > b.elapsed ? a : b,
      );
    }
    const [r, g, b] = hexToRgb(hexColor);
    target.color.setRGB(r, g, b);
    target.ring.position.copy(position);
    target.glow.position.copy(position);
    target.ring.visible = true;
    target.glow.visible = true;
    target.active = true;
    target.elapsed = 0;
    target.duration = 1.6;
    // Orient ring to face camera... we update orientation in tick.
    const startScale = scale * 0.05;
    target.ring.scale.setScalar(startScale);
    target.glow.scale.setScalar(scale * 0.6);
    target.ringMaterial.color.setRGB(r, g, b);
    target.glowMaterial.color.setRGB(
      Math.min(1, r + 0.5),
      Math.min(1, g + 0.5),
      Math.min(1, b + 0.5),
    );
    target.ringMaterial.opacity = 1;
    target.glowMaterial.opacity = 1;
    // Stash final scale on a custom field via dataset on the mesh's userData.
    target.ring.userData.maxScale = scale * 1.8;
    target.glow.userData.startScale = scale * 0.6;
    target.glow.userData.maxScale = scale * 1.5;
  }

  tick(dt: number, cameraQuaternion: THREE.Quaternion): void {
    for (const entry of this.pool) {
      if (!entry.active) continue;
      entry.elapsed += dt;
      const t = Math.min(1, entry.elapsed / entry.duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const ringMax = (entry.ring.userData.maxScale as number) ?? 25;
      const ringScale = ringMax * ease;
      entry.ring.scale.setScalar(Math.max(0.001, ringScale));
      entry.ring.quaternion.copy(cameraQuaternion);

      const glowStart = (entry.glow.userData.startScale as number) ?? 8;
      const glowMax = (entry.glow.userData.maxScale as number) ?? 18;
      const glowScale = glowStart + (glowMax - glowStart) * ease;
      entry.glow.scale.setScalar(glowScale);

      // Fade out: ring fades linearly, glow fades faster.
      entry.ringMaterial.opacity = Math.max(0, 1 - t);
      entry.glowMaterial.opacity = Math.max(0, 1 - t * 1.4);

      if (t >= 1) {
        entry.active = false;
        entry.ring.visible = false;
        entry.glow.visible = false;
      }
    }
  }

  dispose(): void {
    for (const entry of this.pool) {
      entry.ring.geometry.dispose();
      entry.ringMaterial.dispose();
      entry.glowMaterial.dispose();
    }
    this.glowTexture.dispose();
  }
}
