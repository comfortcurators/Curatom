import React, { useEffect, useRef } from 'react';

// Ported from the Comfort Curators marketing hero (Host repo, "Hero V8 ·
// Woven Locus") - same interactive field, tuned to Curatom's Night-only
// palette (no theme toggle, no brand mark - this app already has its own
// chrome). Reception's sign-in screen was flat black; this gives it the
// same polish as the parent brand's own hero, not a knockoff of it.
export const WovenLocusField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;

    const TAU = Math.PI * 2;
    const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let destroyed = false;

    const pal = { primary: '245,245,247', secondary: '161,161,166', accent: '199,199,204' };

    const state = {
      w: 0, h: 0, dpr: Math.min(devicePixelRatio || 1, 2),
      cx: 0, cy: 0, targetCx: 0, targetCy: 0, minDim: 0,
      start: performance.now(), last: performance.now(),
      cycle: 0, evolution: 0, phase: 0, cycleDuration: 9200,
      reduced: prefersReduced.matches,
      pointer: { x: 0, y: 0, active: false, strength: 0, targetStrength: 0 },
      contacts: new Map<number, any>(),
      gestureTrails: [] as any[],
      disturbances: [] as any[],
      seed: 0.73,
      perceptionX: 0, perceptionY: 0, perceptionWeight: 0,
      lastPerceptionX: 0, lastPerceptionY: 0,
      locusVelocityX: 0, locusVelocityY: 0,
    };

    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const fract = (x: number) => x - Math.floor(x);
    const hash = (n: number) => fract(Math.sin(n * 127.1 + state.seed * 91.7) * 43758.5453123);

    function resize() {
      if (!canvas || !stage) return;
      const rect = stage.getBoundingClientRect();
      const oldW = Math.max(1, state.w), oldH = Math.max(1, state.h);
      const nx = state.cx / oldW || 0.7, ny = state.cy / oldH || 0.38;
      state.w = rect.width; state.h = rect.height;
      state.dpr = Math.min(devicePixelRatio || 1, 2);
      state.minDim = Math.min(state.w, state.h);
      state.cx = state.targetCx = clamp(nx * state.w, state.w * .1, state.w * .9);
      state.cy = state.targetCy = clamp(ny * state.h, state.h * .1, state.h * .9);
      canvas.width = Math.round(state.w * state.dpr);
      canvas.height = Math.round(state.h * state.dpr);
      canvas.style.width = state.w + 'px';
      canvas.style.height = state.h + 'px';
      ctx!.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    }

    function accumulatePerception(x: number, y: number, weight = .12) {
      if (Math.hypot(x - state.cx, y - state.cy) < coreRadius() * 2.15) return;
      state.perceptionX += x * weight; state.perceptionY += y * weight; state.perceptionWeight += weight;
    }

    function integrateLocus(advances = 1) {
      if (state.perceptionWeight > .025) {
        const px = state.perceptionX / state.perceptionWeight;
        const py = state.perceptionY / state.perceptionWeight;
        const dx = px - state.cx, dy = py - state.cy;
        const distance = Math.hypot(dx, dy) / Math.max(1, state.minDim);
        const weightGain = clamp(state.perceptionWeight / 3.2, .16, 1);
        const gain = clamp((.055 + distance * .16) * weightGain * advances, .035, .17);
        state.targetCx = clamp(state.cx + dx * gain, state.w * .1, state.w * .9);
        state.targetCy = clamp(state.cy + dy * gain, state.h * .1, state.h * .9);
        state.lastPerceptionX = px; state.lastPerceptionY = py;
        state.perceptionX *= .12; state.perceptionY *= .12; state.perceptionWeight *= .12;
      } else {
        state.targetCx = state.cx; state.targetCy = state.cy;
        state.perceptionX = 0; state.perceptionY = 0; state.perceptionWeight = 0;
      }
    }

    function settleLocus(dt: number) {
      const response = 1 - Math.pow(.018, dt / 1000);
      const dx = state.targetCx - state.cx, dy = state.targetCy - state.cy;
      state.locusVelocityX = mix(state.locusVelocityX, dx * .42, response);
      state.locusVelocityY = mix(state.locusVelocityY, dy * .42, response);
      state.cx += state.locusVelocityX * response; state.cy += state.locusVelocityY * response;
      if (Math.abs(dx) < .04 && Math.abs(dy) < .04) {
        state.cx = state.targetCx; state.cy = state.targetCy;
        state.locusVelocityX *= .25; state.locusVelocityY *= .25;
      }
    }

    function radialInteraction(theta: number, radius: number) {
      let shift = 0;
      const agents: any[] = [];
      if (state.pointer.strength > .003) agents.push({ x: state.pointer.x, y: state.pointer.y, s: state.pointer.strength * .24 });
      for (const c of state.contacts.values()) agents.push({ x: c.x, y: c.y, s: c.strength * .52 });
      for (const d of state.disturbances) agents.push({ x: d.x, y: d.y, s: d.strength });
      for (const a of agents) {
        const dx = a.x - state.cx, dy = a.y - state.cy;
        const ar = Math.hypot(dx, dy), at = Math.atan2(dy, dx);
        const delta = Math.atan2(Math.sin(theta - at), Math.cos(theta - at));
        const angular = Math.exp(-(delta * delta) / .16);
        const radial = Math.exp(-Math.pow((radius - ar) / (state.minDim * .16), 2));
        shift += angular * radial * a.s * state.minDim * .026 * (delta >= 0 ? 1 : -1);
        shift += angular * a.s * state.minDim * .012;
      }
      return shift;
    }

    function outerRadius(theta: number) {
      const evo = state.evolution;
      const base = state.minDim * (.435 + Math.min(evo, 10) * .0024);
      const breathing = Math.sin(theta * 2 + state.cycle * .73) * state.minDim * .009;
      const fine = Math.sin(theta * (5 + Math.min(4, Math.floor(evo / 2))) - state.cycle * .41) * state.minDim * (.004 + evo * .0002);
      return base + breathing + fine + radialInteraction(theta, base);
    }

    function coreRadius() { return state.minDim * Math.max(.026, .046 - state.evolution * .0015); }

    function drawPeripheral(p: number) {
      const reciprocal = smoothstep(.08, .27, p);
      const contractT = .5 - .5 * Math.cos(Math.PI * clamp(smoothstep(.24, .56, p), 0, 1));
      const returnT = smoothstep(.78, 1, p);
      const contact = state.minDim * (.242 + state.evolution * .0008);
      ctx!.save(); ctx!.lineCap = 'round'; ctx!.lineJoin = 'round';
      for (let band = 0; band < 3; band++) {
        ctx!.beginPath();
        const steps = 200;
        for (let i = 0; i <= steps; i++) {
          const th = i / steps * TAU;
          const outer = outerRadius(th) - band * state.minDim * .011;
          const radius = mix(outer, contact + band * state.minDim * .006, contractT * .92);
          const restored = mix(radius, outer * 1.015, returnT * .38);
          const wav = Math.sin(th * (7 + band * 2) + state.cycle * .53 + band) * state.minDim * .0023;
          const r = restored + wav;
          const x = state.cx + Math.cos(th) * r, y = state.cy + Math.sin(th) * r;
          if (i === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
        }
        const alpha = .032 + reciprocal * .042 + contractT * .035 - returnT * .018;
        ctx!.strokeStyle = `rgba(${pal.secondary},${clamp(alpha - band * .009, .012, .11)})`;
        ctx!.lineWidth = band === 0 ? .85 : .55;
        ctx!.stroke();
      }
      ctx!.restore();
    }

    function drawCenter(p: number) {
      const core = coreRadius();
      const pulseRelease = smoothstep(.82, 1, p);
      const preTension = smoothstep(.08, .28, p) * (1 - smoothstep(.45, .62, p));
      const expansion = smoothstep(.25, .53, p) * (1 - smoothstep(.55, .72, p));
      const radius = core * (1 + preTension * .10 + expansion * .16 - pulseRelease * .035);
      const evo = state.evolution;
      const threads = 6 + Math.min(22, Math.floor(evo * 1.55));

      ctx!.save(); ctx!.translate(state.cx, state.cy); ctx!.lineCap = 'round'; ctx!.lineJoin = 'round';
      for (let shell = 0; shell < 2; shell++) {
        ctx!.beginPath();
        const steps = 130;
        for (let i = 0; i <= steps; i++) {
          const th = i / steps * TAU;
          const h3 = Math.sin(th * 3 + state.cycle * .23 + evo * .11) * radius * .036;
          const h5 = Math.sin(th * 5 - state.cycle * .17 + evo * .07) * radius * .024;
          const h11 = Math.sin(th * 11 + state.cycle * .09 + shell * .8) * radius * (.009 + evo * .00034);
          const drift = Math.cos(th * 2 + state.seed * 5.7) * radius * .013;
          const r = radius * (1 + shell * .16) + h3 + h5 + h11 + drift;
          const x = Math.cos(th) * r, y = Math.sin(th) * r;
          if (i === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
        }
        ctx!.strokeStyle = `rgba(${pal.primary},${shell === 0 ? .22 : .08})`;
        ctx!.lineWidth = shell === 0 ? .7 : .45;
        ctx!.stroke();
      }
      for (let t = 0; t < threads; t++) {
        const phase = t / threads * TAU + hash(t + state.cycle * 13) * .35;
        const orientation = t % 2 === 0 ? 1 : -1;
        ctx!.beginPath();
        const steps = 70;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const a = phase + orientation * u * TAU * (1.5 + Math.min(2.6, evo * .10));
          const envelope = Math.sin(Math.PI * u);
          const rr = radius * (.10 + .84 * u) * (1 - .22 * u) + Math.sin(a * 2.3 + t) * radius * .035 * envelope;
          const skew = Math.sin(u * Math.PI * 3 + phase) * radius * (.025 + evo * .0005);
          const x = Math.cos(a) * rr + Math.cos(phase) * skew, y = Math.sin(a) * rr + Math.sin(phase) * skew;
          if (i === 0) ctx!.moveTo(x, y); else ctx!.lineTo(x, y);
        }
        const a = .037 + Math.min(evo, 12) * .0018;
        ctx!.strokeStyle = `rgba(${t % 6 === 0 ? pal.accent : pal.primary},${a})`;
        ctx!.lineWidth = t % 6 === 0 ? .58 : .38;
        ctx!.stroke();
      }
      ctx!.restore();
    }

    function updateDisturbances(dt: number) {
      settleLocus(dt);
      state.pointer.strength += (state.pointer.targetStrength - state.pointer.strength) * (1 - Math.pow(.002, dt / 1000));
      for (const c of state.contacts.values()) {
        c.age += dt;
        c.strength += (c.targetStrength - c.strength) * (1 - Math.pow(.0008, dt / 1000));
      }
      for (const trail of state.gestureTrails) trail.age += dt;
      state.gestureTrails = state.gestureTrails.filter((t) => t.age < 12000 && Math.exp(-t.age / 4200) > .025);
      for (const d of state.disturbances) {
        d.age += dt;
        const hold = d.age < 700 ? 1 : Math.exp(-(d.age - 700) / 6200);
        d.strength = d.baseStrength * hold;
      }
      state.disturbances = state.disturbances.filter((d) => d.strength > .018 && d.age < 16000);
    }

    function render(now: number, force = false) {
      if (destroyed) return;
      const dt = Math.min(50, Math.max(0, now - state.last));
      state.last = now;
      updateDisturbances(dt);

      if (!state.reduced) {
        const elapsed = now - state.start;
        const cyc = Math.floor(elapsed / state.cycleDuration);
        if (cyc !== state.cycle) {
          const advances = Math.max(0, cyc - state.cycle);
          integrateLocus(Math.max(1, advances));
          state.evolution = Math.min(18, state.evolution + advances * .72);
          state.cycle = cyc;
          state.seed = fract(state.seed * 1.731 + .271);
        }
        state.phase = (elapsed % state.cycleDuration) / state.cycleDuration;
      } else {
        state.phase = .94;
        state.evolution = Math.max(state.evolution, 4.2);
      }

      ctx!.clearRect(0, 0, state.w, state.h);
      drawPeripheral(state.phase);
      drawCenter(state.phase);

      if (!destroyed && (!state.reduced || state.disturbances.length || state.gestureTrails.length || state.contacts.size || state.pointer.strength > .005 || force)) {
        raf = requestAnimationFrame(render);
      }
    }

    function eventPoint(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function pointerDistance(x: number, y: number) { return Math.hypot(x - state.cx, y - state.cy); }

    function seedIntegratedDisturbance(x: number, y: number, strength = .86) {
      if (pointerDistance(x, y) < coreRadius() * 2.2) return;
      state.disturbances.push({ x, y, age: 0, baseStrength: strength, strength, angle: Math.atan2(y - state.cy, x - state.cx) });
      accumulatePerception(x, y, .34 + strength * .22);
      if (state.disturbances.length > 7) state.disturbances.shift();
    }

    const onMove = (e: PointerEvent) => {
      const p = eventPoint(e);
      state.pointer.x += (p.x - state.pointer.x) * .24;
      state.pointer.y += (p.y - state.pointer.y) * .24;
      const outside = pointerDistance(p.x, p.y) > coreRadius() * 2.4;
      state.pointer.targetStrength = outside ? .17 : .02;
      if (outside) accumulatePerception(p.x, p.y, .018);
      if (state.reduced) render(performance.now(), true);
    };
    const onDown = (e: PointerEvent) => {
      const p = eventPoint(e);
      if (pointerDistance(p.x, p.y) < coreRadius() * 2.25) return;
      seedIntegratedDisturbance(p.x, p.y, .78);
      if (state.reduced) render(performance.now(), true);
    };
    const onResize = () => resize();

    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerdown', onDown);
    addEventListener('resize', onResize, { passive: true });

    resize();
    state.pointer.x = state.w * .7; state.pointer.y = state.h * .38;
    state.lastPerceptionX = state.pointer.x; state.lastPerceptionY = state.pointer.y;
    raf = requestAnimationFrame(render);

    return () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerdown', onDown);
      removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className="fixed inset-0 z-0"
      style={{ background: 'radial-gradient(circle at 50% 0%, rgba(245,245,247,0.03), transparent 42%), #0a0a0c' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
