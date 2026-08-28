import React, { useEffect, useRef } from 'react';

// Ported from the Comfort Curators marketing hero (Host repo, "Hero V8 ·
// Woven Locus"), now brought to full parity with that source and with the
// SuperhostOS port: peripheral rings, expansion fronts, the interference
// contour field, weave threads, gesture trails, disturbance contours, the
// recognition reach-line, and the center thread bundle. Tuned to Curatom's
// Night-only palette (no theme toggle, no brand mark - this app already has
// its own chrome). Mounted once at the app root (App.tsx), beneath every
// route - previously scoped to Reception's sign-in screen only.
export const WovenLocusField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const rawCanvas = canvasRef.current;
    if (!rawCanvas) return undefined;
    const rawCtx = rawCanvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!rawCtx) return undefined;
    // Nested function declarations below close over `canvas`/`ctx`; TS
    // doesn't carry the null-check narrowing of `rawCanvas`/`rawCtx` into
    // them, so bind known-non-null locals instead of littering `!` at every
    // call site.
    const canvas: HTMLCanvasElement = rawCanvas;
    const ctx: CanvasRenderingContext2D = rawCtx;

    let mounted = true;
    let raf = 0;

    const TAU = Math.PI * 2;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    const pal = { primary: '245,245,247', secondary: '161,161,166', accent: '199,199,204' };

    type Contact = {
      id: number;
      pointerType: string;
      x: number;
      y: number;
      age: number;
      strength: number;
      targetStrength: number;
      phase: number;
      points: { x: number; y: number; t: number }[];
    };
    type Disturbance = { x: number; y: number; age: number; baseStrength: number; strength: number; angle: number };
    type GestureTrail = { points: { x: number; y: number; t: number }[]; strength: number; released: boolean; age: number };

    const state = {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      cx: window.innerWidth / 2,
      cy: window.innerHeight / 2,
      targetCx: window.innerWidth / 2,
      targetCy: window.innerHeight / 2,
      minDim: Math.min(window.innerWidth, window.innerHeight),
      start: performance.now(),
      last: performance.now(),
      lastDraw: 0,
      cycle: 0,
      evolution: 0,
      phase: 0,
      cycleDuration: 9200,
      reduced: prefersReduced.matches,
      pointer: { x: window.innerWidth * 0.7, y: window.innerHeight * 0.38, active: false, strength: 0, targetStrength: 0 },
      contacts: new Map<number, Contact>(),
      gestureTrails: [] as GestureTrail[],
      disturbances: [] as Disturbance[],
      seed: 0.73,
      perceptionX: 0,
      perceptionY: 0,
      perceptionWeight: 0,
      lastPerceptionX: window.innerWidth * 0.72,
      lastPerceptionY: window.innerHeight * 0.38,
      locusVelocityX: 0,
      locusVelocityY: 0,
    };

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const smoothstep = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const smootherstep = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * t * (t * (t * 6 - 15) + 10);
    };
    const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
    const fract = (x: number) => x - Math.floor(x);
    const hash = (n: number) => fract(Math.sin(n * 127.1 + state.seed * 91.7) * 43758.5453123);

    function resize() {
      const oldW = Math.max(1, state.w);
      const oldH = Math.max(1, state.h);
      const nx = state.cx / oldW;
      const ny = state.cy / oldH;
      const ntx = state.targetCx / oldW;
      const nty = state.targetCy / oldH;

      state.w = window.innerWidth;
      state.h = window.innerHeight;
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.minDim = Math.min(state.w, state.h);
      state.cx = clamp(nx * state.w, state.w * 0.1, state.w * 0.9);
      state.cy = clamp(ny * state.h, state.h * 0.1, state.h * 0.9);
      state.targetCx = clamp(ntx * state.w, state.w * 0.1, state.w * 0.9);
      state.targetCy = clamp(nty * state.h, state.h * 0.1, state.h * 0.9);
      canvas.width = Math.round(state.w * state.dpr);
      canvas.height = Math.round(state.h * state.dpr);
      canvas.style.width = `${state.w}px`;
      canvas.style.height = `${state.h}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      render(performance.now(), true);
    }

    function accumulatePerception(x: number, y: number, weight = 0.12) {
      if (Math.hypot(x - state.cx, y - state.cy) < coreRadius() * 2.15) return;
      state.perceptionX += x * weight;
      state.perceptionY += y * weight;
      state.perceptionWeight += weight;
    }

    function integrateLocus(advances = 1) {
      if (state.perceptionWeight > 0.025) {
        const px = state.perceptionX / state.perceptionWeight;
        const py = state.perceptionY / state.perceptionWeight;
        const dx = px - state.cx;
        const dy = py - state.cy;
        const distance = Math.hypot(dx, dy) / Math.max(1, state.minDim);
        const weightGain = clamp(state.perceptionWeight / 3.2, 0.16, 1);
        const gain = clamp((0.055 + distance * 0.16) * weightGain * advances, 0.035, 0.17);
        state.targetCx = clamp(state.cx + dx * gain, state.w * 0.1, state.w * 0.9);
        state.targetCy = clamp(state.cy + dy * gain, state.h * 0.1, state.h * 0.9);
        state.lastPerceptionX = px;
        state.lastPerceptionY = py;
        state.perceptionX *= 0.12;
        state.perceptionY *= 0.12;
        state.perceptionWeight *= 0.12;
      } else {
        state.targetCx = state.cx;
        state.targetCy = state.cy;
        state.perceptionX = 0;
        state.perceptionY = 0;
        state.perceptionWeight = 0;
      }
    }

    function settleLocus(dt: number) {
      const response = 1 - 0.018 ** (dt / 1000);
      const dx = state.targetCx - state.cx;
      const dy = state.targetCy - state.cy;
      state.locusVelocityX = mix(state.locusVelocityX, dx * 0.42, response);
      state.locusVelocityY = mix(state.locusVelocityY, dy * 0.42, response);
      state.cx += state.locusVelocityX * response;
      state.cy += state.locusVelocityY * response;
      if (Math.abs(dx) < 0.04 && Math.abs(dy) < 0.04) {
        state.cx = state.targetCx;
        state.cy = state.targetCy;
        state.locusVelocityX *= 0.25;
        state.locusVelocityY *= 0.25;
      }
    }

    function radialInteraction(theta: number, radius: number) {
      let shift = 0;
      const agents: { x: number; y: number; s: number }[] = [];
      if (state.pointer.strength > 0.003) agents.push({ x: state.pointer.x, y: state.pointer.y, s: state.pointer.strength * 0.24 });
      for (const c of state.contacts.values()) agents.push({ x: c.x, y: c.y, s: c.strength * 0.52 });
      for (const d of state.disturbances) agents.push({ x: d.x, y: d.y, s: d.strength });
      for (const a of agents) {
        const dx = a.x - state.cx;
        const dy = a.y - state.cy;
        const ar = Math.hypot(dx, dy);
        const at = Math.atan2(dy, dx);
        const delta = Math.atan2(Math.sin(theta - at), Math.cos(theta - at));
        const angular = Math.exp(-(delta * delta) / 0.16);
        const radial = Math.exp(-(((radius - ar) / (state.minDim * 0.16)) ** 2));
        shift += angular * radial * a.s * state.minDim * 0.026 * (delta >= 0 ? 1 : -1);
        shift += angular * a.s * state.minDim * 0.012;
      }
      return shift;
    }

    function outerRadius(theta: number, p: number) {
      const evo = state.evolution;
      const base = state.minDim * (0.435 + Math.min(evo, 10) * 0.0024);
      const breathing = Math.sin(theta * 2 + state.cycle * 0.73) * state.minDim * 0.009;
      const fine = Math.sin(theta * (5 + Math.min(4, Math.floor(evo / 2))) - state.cycle * 0.41) * state.minDim * (0.004 + evo * 0.0002);
      return base + breathing + fine + radialInteraction(theta, base);
    }

    function coreRadius() {
      return state.minDim * Math.max(0.026, 0.046 - state.evolution * 0.0015);
    }

    function contactEnvelope(p: number) {
      const arrive = smoothstep(0.28, 0.56, p);
      const leave = 1 - smoothstep(0.78, 0.96, p);
      return arrive * leave;
    }

    function drawPeripheral(p: number) {
      const reciprocal = smoothstep(0.08, 0.27, p);
      const contractT = easeInOut(smoothstep(0.24, 0.56, p));
      const returnT = smoothstep(0.78, 1, p);
      const contact = state.minDim * (0.242 + state.evolution * 0.0008);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let band = 0; band < 3; band++) {
        ctx.beginPath();
        const steps = 240;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * TAU;
          const outer = outerRadius(th, p) - band * state.minDim * 0.011;
          const radius = mix(outer, contact + band * state.minDim * 0.006, contractT * 0.92);
          const restored = mix(radius, outer * 1.015, returnT * 0.38);
          const wav = Math.sin(th * (7 + band * 2) + state.cycle * 0.53 + band) * state.minDim * 0.0023;
          const r = restored + wav;
          const x = state.cx + Math.cos(th) * r;
          const y = state.cy + Math.sin(th) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const alpha = 0.032 + reciprocal * 0.042 + contractT * 0.035 - returnT * 0.018;
        ctx.strokeStyle = `rgba(${pal.secondary},${clamp(alpha - band * 0.009, 0.012, 0.11)})`;
        ctx.lineWidth = band === 0 ? 0.85 : 0.55;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawExpansionFronts(p: number) {
      const t = easeInOut(smoothstep(0.23, 0.58, p));
      const fade = (1 - smoothstep(0.58, 0.78, p)) * smoothstep(0.16, 0.34, p);
      if (fade <= 0.002) return;
      const core = coreRadius();
      const contact = state.minDim * 0.245;
      ctx.save();
      ctx.lineCap = 'round';
      for (let band = 0; band < 5; band++) {
        const stagger = (band / 5) * 0.11;
        const bt = clamp((t - stagger) / (1 - stagger), 0, 1);
        const base = mix(core * (1.35 + band * 0.3), contact * (1 - band * 0.018), easeInOut(bt));
        ctx.beginPath();
        const start = -Math.PI * (0.88 - band * 0.03);
        const span = TAU * (0.88 - band * 0.018);
        const rot = (hash(state.cycle * 9 + band) - 0.5) * 0.65;
        const steps = 180;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const th = start + span * u + rot;
          const wav = Math.sin(th * (4 + band) + state.cycle * 0.61) * state.minDim * (0.003 + band * 0.0007);
          const r = base + wav + radialInteraction(th, base) * 0.75;
          const x = state.cx + Math.cos(th) * r;
          const y = state.cy + Math.sin(th) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${pal.primary},${(0.027 + band * 0.005) * fade})`;
        ctx.lineWidth = 0.55 + (band % 2) * 0.25;
        ctx.stroke();
      }
      ctx.restore();
    }

    function scalarField(x: number, y: number, p: number) {
      const dx = x - state.cx;
      const dy = y - state.cy;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      const contactR = state.minDim * 0.247;
      const norm = r / state.minDim;
      const evo = state.evolution;

      const centerWave = Math.sin(r * (0.071 + evo * 0.0008) - p * 13.2 + Math.sin(th * 3 + state.cycle * 0.3) * 0.75);
      const outerDistance = outerRadius(th, p) - r;
      const outerWave = Math.sin(outerDistance * (0.068 + evo * 0.0006) + p * 11.6 + Math.sin(th * 5 - 0.8) * 0.53);
      const weave = Math.sin(x * 0.031 + y * 0.024 + Math.sin(th * (4 + Math.floor(evo % 4))) * 0.8 + state.cycle * 0.9);
      const cross = Math.sin(x * 0.021 - y * 0.036 - p * 5.2 + evo * 0.23);

      let v = centerWave * 0.62 + outerWave * 0.62 + weave * (0.12 + Math.min(evo, 9) * 0.006) + cross * 0.08;

      for (const d of state.disturbances) {
        const ddx = x - d.x;
        const ddy = y - d.y;
        const dr = Math.hypot(ddx, ddy);
        const local = Math.exp(-((dr / (state.minDim * 0.14)) ** 2));
        v += Math.sin(dr * 0.095 - d.age * 0.0043 + Math.atan2(ddy, ddx) * 2) * local * d.strength * 0.68;
        v += Math.sin(ddx * 0.034 - ddy * 0.027 + d.age * 0.002) * local * d.strength * 0.18;
      }

      const ptrdx = x - state.pointer.x;
      const ptrdy = y - state.pointer.y;
      const ptrr = Math.hypot(ptrdx, ptrdy);
      const ptrLocal = Math.exp(-((ptrr / (state.minDim * 0.12)) ** 2)) * state.pointer.strength;
      v += Math.sin(ptrr * 0.078 + th * 1.6) * ptrLocal * 0.22;

      for (const c of state.contacts.values()) {
        const cdx = x - c.x;
        const cdy = y - c.y;
        const cr = Math.hypot(cdx, cdy);
        const local = Math.exp(-((cr / (state.minDim * 0.115)) ** 2)) * c.strength;
        const direction = Math.atan2(cdy, cdx);
        v += Math.sin(cr * 0.082 - c.age * 0.003 + direction * 2.4) * local * 0.46;
        v += Math.sin(cdx * 0.03 - cdy * 0.033 + c.phase) * local * 0.16;
      }

      const band = Math.exp(-(((r - contactR) / (state.minDim * 0.1)) ** 2));
      const interiorQuiet = smoothstep(0.065, 0.14, norm);
      return { v, band: band * interiorQuiet };
    }

    function contourSegments(v0: number, v1: number, v2: number, v3: number, level: number) {
      const pts: [number, number][] = [];
      function edge(ax: number, ay: number, av: number, bx: number, by: number, bv: number) {
        const da = av - level;
        const db = bv - level;
        if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
          const t = da / (da - db);
          pts.push([mix(ax, bx, t), mix(ay, by, t)]);
        }
      }
      edge(0, 0, v0, 1, 0, v1);
      edge(1, 0, v1, 1, 1, v2);
      edge(1, 1, v2, 0, 1, v3);
      edge(0, 1, v3, 0, 0, v0);
      return pts;
    }

    function drawInterference(p: number) {
      const env = contactEnvelope(p);
      const interactionBoost = Math.min(1, state.disturbances.reduce((s, d) => s + d.strength * 0.23, 0));
      const alphaBase = env * 0.085 + interactionBoost * 0.025;
      if (alphaBase < 0.002) return;

      const cell = clamp(state.minDim / 42, 10, 18);
      const cols = Math.ceil(state.w / cell) + 1;
      const rows = Math.ceil(state.h / cell) + 1;
      const vals = new Float32Array(cols * rows);
      const bands = new Float32Array(cols * rows);

      for (let j = 0; j < rows; j++) {
        const y = j * cell;
        for (let i = 0; i < cols; i++) {
          const x = i * cell;
          const s = scalarField(x, y, p);
          const idx = j * cols + i;
          vals[idx] = s.v;
          bands[idx] = s.band;
        }
      }

      const levels = [-0.84, -0.44, -0.08, 0.31, 0.72];
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let li = 0; li < levels.length; li++) {
        const level = levels[li] as number;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) {
          for (let i = 0; i < cols - 1; i++) {
            const a = j * cols + i;
            const b = a + 1;
            const d = a + cols;
            const c = d + 1;
            const localBand = ((bands[a] as number) + (bands[b] as number) + (bands[c] as number) + (bands[d] as number)) * 0.25;
            if (localBand < 0.035 && interactionBoost < 0.02) continue;

            const pts = contourSegments(vals[a] as number, vals[b] as number, vals[c] as number, vals[d] as number, level);
            if (pts.length >= 2) {
              const p0 = pts[0] as [number, number];
              const p1 = pts[1] as [number, number];
              const x0 = (i + p0[0]) * cell;
              const y0 = (j + p0[1]) * cell;
              const x1 = (i + p1[0]) * cell;
              const y1 = (j + p1[1]) * cell;
              const mx = (x0 + x1) * 0.5;
              const my = (y0 + y1) * 0.5;
              const rr = Math.hypot(mx - state.cx, my - state.cy);
              const contactR = state.minDim * 0.247;
              const region = Math.exp(-(((rr - contactR) / (state.minDim * 0.115)) ** 2));
              if (region < 0.025 && interactionBoost < 0.02) continue;
              ctx.moveTo(x0, y0);
              ctx.lineTo(x1, y1);
            }
          }
        }
        const levelWeight = 0.78 + li * 0.05;
        ctx.strokeStyle = `rgba(${li === 2 ? pal.accent : pal.primary},${alphaBase * levelWeight})`;
        ctx.lineWidth = li === 2 ? 0.64 : 0.48;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawWeave(p: number) {
      const inT = smoothstep(0.56, 0.72, p);
      const outT = 1 - smoothstep(0.78, 0.94, p);
      const env = inT * outT;
      if (env < 0.004) return;

      const r0 = state.minDim * 0.247;
      const evo = state.evolution;
      const count = 12 + Math.min(14, Math.floor(evo * 1.3));
      ctx.save();
      ctx.lineCap = 'round';

      for (let k = 0; k < count; k++) {
        const offset = (k - (count - 1) / 2) * state.minDim * 0.0047;
        const dir = k % 2 === 0 ? 1 : -1;
        const rot = (k / count) * 0.9 + state.cycle * 0.11;
        ctx.beginPath();
        const steps = 130;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const th = -Math.PI * 0.72 + u * Math.PI * 1.44 + rot;
          const warp = Math.sin(th * (3 + (k % 4)) + state.cycle * 0.37) * state.minDim * 0.0065;
          const cross = Math.sin(u * Math.PI * 4 + k * 0.7) * state.minDim * 0.0022 * dir;
          const r = r0 + offset + warp + cross + radialInteraction(th, r0) * 0.6;
          const x = state.cx + Math.cos(th) * r + Math.sin(th) * cross;
          const y = state.cy + Math.sin(th) * r - Math.cos(th) * cross;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${k % 5 === 0 ? pal.accent : pal.primary},${env * (k % 5 === 0 ? 0.055 : 0.031)})`;
        ctx.lineWidth = k % 5 === 0 ? 0.62 : 0.42;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawCenter(p: number) {
      const core = coreRadius();
      const pulseRelease = smootherstep(0.82, 1, p);
      const preTension = smoothstep(0.08, 0.28, p) * (1 - smoothstep(0.45, 0.62, p));
      const expansion = smoothstep(0.25, 0.53, p) * (1 - smoothstep(0.55, 0.72, p));
      const radius = core * (1 + preTension * 0.1 + expansion * 0.16 - pulseRelease * 0.035);
      const evo = state.evolution;
      const threads = 6 + Math.min(22, Math.floor(evo * 1.55));
      const turns = 1.5 + Math.min(2.6, evo * 0.1);

      ctx.save();
      ctx.translate(state.cx, state.cy);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let shell = 0; shell < 2; shell++) {
        ctx.beginPath();
        const steps = 150;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * TAU;
          const h3 = Math.sin(th * 3 + state.cycle * 0.23 + evo * 0.11) * radius * 0.036;
          const h5 = Math.sin(th * 5 - state.cycle * 0.17 + evo * 0.07) * radius * 0.024;
          const h11 = Math.sin(th * 11 + state.cycle * 0.09 + shell * 0.8) * radius * (0.009 + evo * 0.00034);
          const drift = Math.cos(th * 2 + state.seed * 5.7) * radius * 0.013;
          const r = radius * (1 + shell * 0.16) + h3 + h5 + h11 + drift;
          const x = Math.cos(th) * r;
          const y = Math.sin(th) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${pal.primary},${shell === 0 ? 0.22 : 0.08})`;
        ctx.lineWidth = shell === 0 ? 0.7 : 0.45;
        ctx.stroke();
      }

      for (let t = 0; t < threads; t++) {
        const phase = (t / threads) * TAU + hash(t + state.cycle * 13) * 0.35;
        const orientation = t % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        const steps = 90;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const a = phase + orientation * u * TAU * turns;
          const envelope = Math.sin(Math.PI * u);
          const rr = radius * (0.1 + 0.84 * u) * (1 - 0.22 * u) + Math.sin(a * 2.3 + t) * radius * 0.035 * envelope;
          const skew = Math.sin(u * Math.PI * 3 + phase) * radius * (0.025 + evo * 0.0005);
          const x = Math.cos(a) * rr + Math.cos(phase) * skew;
          const y = Math.sin(a) * rr + Math.sin(phase) * skew;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const a = 0.037 + Math.min(evo, 12) * 0.0018;
        ctx.strokeStyle = `rgba(${t % 6 === 0 ? pal.accent : pal.primary},${a})`;
        ctx.lineWidth = t % 6 === 0 ? 0.58 : 0.38;
        ctx.stroke();
      }

      const crossCount = 2 + Math.min(10, Math.floor(evo * 0.65));
      for (let i = 0; i < crossCount; i++) {
        const angle = (i / Math.max(1, crossCount)) * Math.PI + state.cycle * 0.025;
        const span = radius * (0.56 + hash(i * 3.1) * 0.32);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * -span, Math.sin(angle) * -span);
        const bend = radius * 0.16 * Math.sin(i * 1.7 + evo * 0.3);
        ctx.quadraticCurveTo(
          Math.cos(angle + Math.PI / 2) * bend,
          Math.sin(angle + Math.PI / 2) * bend,
          Math.cos(angle) * span,
          Math.sin(angle) * span,
        );
        ctx.strokeStyle = `rgba(${pal.primary},${0.028 + evo * 0.0012})`;
        ctx.lineWidth = 0.36;
        ctx.stroke();
      }

      ctx.beginPath();
      const microSpan = Math.max(1.8, radius * 0.12);
      ctx.moveTo(-microSpan, -microSpan * 0.18);
      ctx.quadraticCurveTo(0, microSpan * 0.22, microSpan, -microSpan * 0.08);
      ctx.strokeStyle = `rgba(${pal.primary},${0.16 + Math.min(evo, 12) * 0.003})`;
      ctx.lineWidth = 0.42;
      ctx.stroke();
      ctx.restore();
    }

    function drawRecognition(p: number) {
      const t = smoothstep(0.06, 0.26, p) * (1 - smoothstep(0.3, 0.48, p));
      if (t < 0.003) return;

      const rememberedDx = state.lastPerceptionX - state.cx;
      const rememberedDy = state.lastPerceptionY - state.cy;
      const rememberedR = Math.hypot(rememberedDx, rememberedDy);
      const fallbackAngle = (state.cycle * 1.618 + state.seed) % TAU;
      const angle =
        rememberedR > state.minDim * 0.06
          ? Math.atan2(rememberedDy, rememberedDx) + Math.sin(state.cycle * 0.71) * 0.07
          : fallbackAngle;
      const outer = state.minDim * (0.4 + Math.min(state.evolution, 10) * 0.002);
      const inner = coreRadius() * 1.35;
      const reach = rememberedR > state.minDim * 0.06 ? Math.min(outer, rememberedR * 1.08) : outer;
      const endX = state.cx + Math.cos(angle) * reach;
      const endY = state.cy + Math.sin(angle) * reach;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(state.cx + Math.cos(angle) * inner, state.cy + Math.sin(angle) * inner);
      const mx = mix(state.cx, endX, 0.55) + Math.sin(angle) * state.minDim * 0.012;
      const my = mix(state.cy, endY, 0.55) - Math.cos(angle) * state.minDim * 0.012;
      ctx.quadraticCurveTo(mx, my, endX, endY);
      const grad = ctx.createLinearGradient(state.cx, state.cy, endX, endY);
      grad.addColorStop(0, `rgba(${pal.primary},0)`);
      grad.addColorStop(0.35, `rgba(${pal.primary},${0.026 * t})`);
      grad.addColorStop(0.72, `rgba(${pal.secondary},${0.045 * t})`);
      grad.addColorStop(1, `rgba(${pal.primary},0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.65;
      ctx.stroke();
      ctx.restore();
    }

    function drawGestureTrails() {
      if (!state.gestureTrails.length && !state.contacts.size) return;
      const trails = state.gestureTrails.slice();
      for (const c of state.contacts.values()) {
        if (c.points.length > 1) trails.push({ points: c.points, strength: c.strength, released: false, age: 0 });
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const trail of trails) {
        const pts = trail.points;
        if (!pts || pts.length < 2) continue;
        const fade = trail.released ? Math.exp(-trail.age / 4200) : 1;
        const baseAlpha = clamp((trail.strength || 0.6) * fade, 0, 1);
        if (baseAlpha < 0.01) continue;

        for (let strand = -1; strand <= 1; strand++) {
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            const q = pts[i] as (typeof pts)[number];
            const prev = pts[Math.max(0, i - 1)] as (typeof pts)[number];
            const next = pts[Math.min(pts.length - 1, i + 1)] as (typeof pts)[number];
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const nx = -dy / len;
            const ny = dx / len;
            const weave = Math.sin(i * 0.82 + strand * 1.9 + q.t * 0.003) * state.minDim * 0.0018;
            const offset = strand * state.minDim * 0.0032 + weave;
            const x = q.x + nx * offset;
            const y = q.y + ny * offset;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${strand === 0 ? pal.accent : pal.primary},${baseAlpha * (strand === 0 ? 0.052 : 0.028)})`;
          ctx.lineWidth = strand === 0 ? 0.58 : 0.42;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function drawDisturbanceContours() {
      if (!state.disturbances.length) return;
      ctx.save();
      ctx.lineCap = 'round';
      for (const d of state.disturbances) {
        const age = d.age / 1000;
        const settle = clamp(d.strength, 0, 1);
        if (settle < 0.005) continue;
        const rings = 3;
        for (let k = 0; k < rings; k++) {
          const base = state.minDim * (0.028 + k * 0.025) + age * state.minDim * 0.005;
          ctx.beginPath();
          const steps = 100;
          const arcSpan = Math.PI * (1.15 + k * 0.22);
          const rot = d.angle + k * 1.21 + age * 0.045 * (k % 2 ? 1 : -1);
          for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const th = rot - arcSpan / 2 + arcSpan * u;
            const wav = Math.sin(th * 5 + age * 0.6 + k) * state.minDim * 0.003;
            const r = base + wav;
            const x = d.x + Math.cos(th) * r;
            const y = d.y + Math.sin(th) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = `rgba(${k === 1 ? pal.accent : pal.primary},${settle * (0.035 - k * 0.006)})`;
          ctx.lineWidth = 0.45;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    function updateDisturbances(dt: number) {
      settleLocus(dt);
      state.pointer.strength += (state.pointer.targetStrength - state.pointer.strength) * (1 - 0.002 ** (dt / 1000));
      for (const c of state.contacts.values()) {
        c.age += dt;
        c.strength += (c.targetStrength - c.strength) * (1 - 0.0008 ** (dt / 1000));
      }
      for (const trail of state.gestureTrails) trail.age += dt;
      state.gestureTrails = state.gestureTrails.filter((t) => t.age < 12000 && Math.exp(-t.age / 4200) > 0.025);
      for (const d of state.disturbances) {
        d.age += dt;
        const hold = d.age < 700 ? 1 : Math.exp(-(d.age - 700) / 6200);
        d.strength = d.baseStrength * hold;
      }
      state.disturbances = state.disturbances.filter((d) => d.strength > 0.018 && d.age < 16000);
    }

    // Same frame-rate cap and first-paint-deferral fix already proven in the
    // Host repo's version of this component: state updates every frame for
    // pointer/animation smoothness, but the expensive canvas draw calls are
    // throttled to ~30fps so this loop doesn't compete with React's own
    // hydration/paint work.
    const FRAME_INTERVAL_MS = 1000 / 30;

    function render(now: number, force = false) {
      if (!mounted) return;
      const dt = Math.min(50, Math.max(0, now - state.last));
      state.last = now;
      updateDisturbances(dt);

      const sinceDraw = now - state.lastDraw;
      if (!force && sinceDraw < FRAME_INTERVAL_MS) {
        raf = requestAnimationFrame(render);
        return;
      }
      state.lastDraw = now;

      if (!state.reduced) {
        const elapsed = now - state.start;
        const cyc = Math.floor(elapsed / state.cycleDuration);
        if (cyc !== state.cycle) {
          const advances = Math.max(0, cyc - state.cycle);
          integrateLocus(Math.max(1, advances));
          state.evolution = Math.min(18, state.evolution + advances * 0.72);
          state.cycle = cyc;
          state.seed = fract(state.seed * 1.731 + 0.271);
        }
        state.phase = (elapsed % state.cycleDuration) / state.cycleDuration;
      } else {
        state.phase = 0.94;
        state.evolution = Math.max(state.evolution, 4.2);
      }

      ctx.clearRect(0, 0, state.w, state.h);
      drawPeripheral(state.phase);
      drawRecognition(state.phase);
      drawExpansionFronts(state.phase);
      drawInterference(state.phase);
      drawWeave(state.phase);
      drawGestureTrails();
      drawDisturbanceContours();
      drawCenter(state.phase);

      if (
        !state.reduced ||
        state.disturbances.length ||
        state.gestureTrails.length ||
        state.contacts.size ||
        state.pointer.strength > 0.005 ||
        force
      ) {
        raf = requestAnimationFrame(render);
      }
    }

    function pointerDistance(x: number, y: number) {
      return Math.hypot(x - state.cx, y - state.cy);
    }
    function eventPoint(e: PointerEvent) {
      return { x: e.clientX, y: e.clientY };
    }

    function appendGesturePoint(contact: Contact, x: number, y: number, now: number) {
      const last = contact.points[contact.points.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) > Math.max(4, state.minDim * 0.006) || now - last.t > 90) {
        contact.points.push({ x, y, t: now });
        if (contact.points.length > 54) contact.points.shift();
      }
    }

    function seedIntegratedDisturbance(x: number, y: number, strength = 0.86) {
      if (pointerDistance(x, y) < coreRadius() * 2.2) return;
      state.disturbances.push({ x, y, age: 0, baseStrength: strength, strength, angle: Math.atan2(y - state.cy, x - state.cx) });
      accumulatePerception(x, y, 0.34 + strength * 0.22);
      if (state.disturbances.length > 7) state.disturbances.shift();
    }

    function setPassivePointer(e: PointerEvent) {
      const x = e.clientX;
      const y = e.clientY;
      state.pointer.x += (x - state.pointer.x) * 0.24;
      state.pointer.y += (y - state.pointer.y) * 0.24;
      const outside = pointerDistance(x, y) > coreRadius() * 2.4;
      state.pointer.targetStrength = outside ? 0.17 : 0.02;
      if (outside) accumulatePerception(x, y, 0.018);
      if (state.reduced) render(performance.now(), true);
    }

    const pointerMove = (e: PointerEvent) => {
      const p = eventPoint(e);
      const contact = state.contacts.get(e.pointerId);
      if (contact) {
        contact.x = p.x;
        contact.y = p.y;
        contact.targetStrength = clamp(0.72 + (e.pressure || 0.42) * 0.34, 0.74, 1.06);
        appendGesturePoint(contact, p.x, p.y, performance.now());
        accumulatePerception(p.x, p.y, 0.028 * contact.strength);
        state.pointer.x = p.x;
        state.pointer.y = p.y;
        state.pointer.targetStrength = 0;
        if (state.reduced) render(performance.now(), true);
        return;
      }
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') setPassivePointer(e);
    };
    window.addEventListener('pointermove', pointerMove, { passive: true });

    const pointerLeave = (e: PointerEvent) => {
      if (!state.contacts.has(e.pointerId)) state.pointer.targetStrength = 0;
    };
    window.addEventListener('pointerleave', pointerLeave, { passive: true });

    const pointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest && target.closest('button, a, input, textarea, select, [contenteditable=true]')) return;
      const p = eventPoint(e);
      if (pointerDistance(p.x, p.y) < coreRadius() * 2.25) return;
      const now = performance.now();
      const pressure = e.pressure > 0 ? e.pressure : e.pointerType === 'touch' ? 0.5 : 0.35;
      const strength = clamp(0.76 + pressure * 0.28 + (pointerDistance(p.x, p.y) / state.minDim) * 0.08, 0.78, 1.06);
      state.contacts.set(e.pointerId, {
        id: e.pointerId,
        pointerType: e.pointerType,
        x: p.x,
        y: p.y,
        age: 0,
        strength: strength * 0.72,
        targetStrength: strength,
        phase: hash(e.pointerId * 3.17 + now * 0.0001) * TAU,
        points: [{ x: p.x, y: p.y, t: now }],
      });
      state.pointer.x = p.x;
      state.pointer.y = p.y;
      state.pointer.targetStrength = 0;
      seedIntegratedDisturbance(p.x, p.y, strength * 0.68);
      if (state.reduced) render(now, true);
    };
    window.addEventListener('pointerdown', pointerDown, { passive: true });

    function releaseContact(e: PointerEvent) {
      const contact = state.contacts.get(e.pointerId);
      if (!contact) return;
      const now = performance.now();
      appendGesturePoint(contact, contact.x, contact.y, now);
      if (contact.points.length > 1) {
        state.gestureTrails.push({ points: contact.points.slice(), strength: contact.strength, released: true, age: 0 });
        if (state.gestureTrails.length > 8) state.gestureTrails.shift();
      }
      seedIntegratedDisturbance(contact.x, contact.y, clamp(contact.strength * 0.72, 0.48, 0.86));
      state.contacts.delete(e.pointerId);
      if (!state.contacts.size) state.pointer.targetStrength = 0;
      if (state.reduced) render(now, true);
    }
    window.addEventListener('pointerup', releaseContact);
    window.addEventListener('pointercancel', releaseContact);

    const reducedChange = (e: MediaQueryListEvent) => {
      state.reduced = e.matches;
      state.start = performance.now();
      state.last = state.start;
      render(state.start, true);
    };
    prefersReduced.addEventListener?.('change', reducedChange);

    window.addEventListener('resize', resize, { passive: true });
    resize();

    let paused = document.visibilityState === 'hidden';
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame((now) => {
        if (!paused) render(now, true);
      });
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        paused = true;
        cancelAnimationFrame(raf);
      } else if (paused) {
        paused = false;
        const now = performance.now();
        state.last = now;
        state.lastDraw = 0;
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    state.pointer.x = state.w * 0.7;
    state.pointer.y = state.h * 0.38;
    state.lastPerceptionX = state.pointer.x;
    state.lastPerceptionY = state.pointer.y;

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerleave', pointerLeave);
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', releaseContact);
      window.removeEventListener('pointercancel', releaseContact);
      prefersReduced.removeEventListener?.('change', reducedChange);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-0"
      style={{ background: 'radial-gradient(circle at 50% 0%, rgba(245,245,247,0.03), transparent 42%), #0a0a0c' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
