/**
 * Ambient sonification — the galaxy plays music based on its structure.
 *
 * Base layer: a warm C2 pad drone.
 * Harmonic layer: pentatonic tones whose volume modulates with
 * proximity to stars of each language type.
 * SFX: warp whoosh, supernova boom, selection bell.
 */

const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

interface NodeRef {
  x: number;
  y: number;
  z: number;
  language: string;
}

export interface SonificationHandle {
  toggle(): boolean;
  setGalaxy(nodes: ReadonlyArray<NodeRef>): void;
  tick(cx: number, cy: number, cz: number): void;
  playWarp(): void;
  playSupernova(): void;
  playSelect(): void;
  dispose(): void;
  readonly enabled: boolean;
}

export function createSonification(): SonificationHandle {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let reverb: ConvolverNode | null = null;
  let padOscs: OscillatorNode[] = [];
  let toneOscs: OscillatorNode[] = [];
  let toneGains: GainNode[] = [];
  let isEnabled = false;
  let galaxyNodes: ReadonlyArray<NodeRef> = [];
  let frameCount = 0;
  let langMap = new Map<string, number>();
  let langIdx = 0;

  function langToScaleIndex(lang: string): number {
    let idx = langMap.get(lang);
    if (idx === undefined) {
      idx = langIdx++ % SCALE.length;
      langMap.set(lang, idx);
    }
    return idx;
  }

  function createContext(): AudioContext {
    const ac = new AudioContext();

    const mg = ac.createGain();
    mg.gain.value = 0.12;
    mg.connect(ac.destination);
    masterGain = mg;

    // Procedural impulse-response reverb
    const rv = ac.createConvolver();
    const irLen = Math.floor(ac.sampleRate * 2.5);
    const impulse = ac.createBuffer(2, irLen, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.5);
      }
    }
    rv.buffer = impulse;
    reverb = rv;

    const rvGain = ac.createGain();
    rvGain.gain.value = 0.3;
    rv.connect(rvGain);
    rvGain.connect(mg);

    // Pad drone — detuned C2 for warmth
    const pg = ac.createGain();
    pg.gain.value = 0.06;
    pg.connect(mg);
    pg.connect(rv);

    const padFreqs = [65.41, 65.41 * 1.003, 65.41 * 0.997];
    for (const freq of padFreqs) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 350;
      lp.Q.value = 0.7;

      osc.connect(lp);
      lp.connect(pg);
      osc.start();
      padOscs.push(osc);
    }

    // Harmonic tones — one per scale note
    for (const freq of SCALE) {
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const gain = ac.createGain();
      gain.gain.value = 0;

      osc.connect(gain);
      gain.connect(mg);
      gain.connect(rv);
      osc.start();

      toneOscs.push(osc);
      toneGains.push(gain);
    }

    return ac;
  }

  function teardown(): void {
    for (const o of padOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const o of toneOscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    if (ctx) void ctx.close();
    ctx = null;
    masterGain = null;
    reverb = null;
    padOscs = [];
    toneOscs = [];
    toneGains = [];
  }

  return {
    get enabled() {
      return isEnabled;
    },

    toggle() {
      if (isEnabled) {
        teardown();
        isEnabled = false;
      } else {
        ctx = createContext();
        isEnabled = true;
      }
      return isEnabled;
    },

    setGalaxy(nodes) {
      galaxyNodes = nodes;
      langMap = new Map();
      langIdx = 0;
    },

    tick(cx, cy, cz) {
      if (!isEnabled || !ctx || toneGains.length === 0) return;
      frameCount++;
      if (frameCount % 20 !== 0) return;

      const volumes = new Float32Array(SCALE.length);
      const maxDist = 200;
      const step = Math.max(1, Math.floor(galaxyNodes.length / 400));

      for (let i = 0; i < galaxyNodes.length; i += step) {
        const n = galaxyNodes[i];
        const dx = n.x - cx;
        const dy = n.y - cy;
        const dz = n.z - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > maxDist) continue;

        const scaleIdx = langToScaleIndex(n.language);
        const influence = Math.pow(1 - dist / maxDist, 2) * 0.015;
        volumes[scaleIdx] += influence;
      }

      const now = ctx.currentTime;
      for (let i = 0; i < SCALE.length; i++) {
        const target = Math.min(0.05, volumes[i]);
        toneGains[i].gain.linearRampToValueAtTime(target, now + 0.4);
      }
    },

    playWarp() {
      if (!ctx || !masterGain) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.35);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.8);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.85);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(200, now);
      lp.frequency.exponentialRampToValueAtTime(1800, now + 0.3);
      lp.frequency.exponentialRampToValueAtTime(120, now + 0.85);

      osc.connect(lp);
      lp.connect(gain);
      gain.connect(masterGain);
      if (reverb) gain.connect(reverb);
      osc.start(now);
      osc.stop(now + 0.9);
    },

    playSupernova() {
      if (!ctx || !masterGain) return;
      const now = ctx.currentTime;

      const boom = ctx.createOscillator();
      boom.type = "sine";
      boom.frequency.setValueAtTime(100, now);
      boom.frequency.exponentialRampToValueAtTime(25, now + 0.6);

      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0.08, now);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      boom.connect(bGain);
      bGain.connect(masterGain);
      if (reverb) bGain.connect(reverb);
      boom.start(now);
      boom.stop(now + 0.8);

      const shimmer = ctx.createOscillator();
      shimmer.type = "triangle";
      shimmer.frequency.value = 2000 + Math.random() * 1500;

      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.025, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      shimmer.connect(sGain);
      sGain.connect(masterGain);
      if (reverb) sGain.connect(reverb);
      shimmer.start(now);
      shimmer.stop(now + 0.55);
    },

    playSelect() {
      if (!ctx || !masterGain) return;
      const now = ctx.currentTime;
      const freq = SCALE[Math.floor(Math.random() * SCALE.length)] * 2;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(masterGain);
      if (reverb) gain.connect(reverb);
      osc.start(now);
      osc.stop(now + 0.8);
    },

    dispose() {
      teardown();
    },
  };
}
