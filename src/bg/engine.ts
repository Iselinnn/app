/**
 * Фоновый движок: обитатели как цепочки узлов позвоночника (spine chain) с wander-steering
 * и boids для стайки; тело растеризуется на сетку квадратиков каждый кадр (мозаика без гладких кривых).
 * Один Canvas 2D, rAF, DPR ≤ 2, батчи по цвету, пауза при скрытии вкладки, авто-снижение числа
 * обитателей при FPS < 50, статичный кадр при reduced-motion / экономии энергии.
 */
import type { MosaicPalette, Species } from '../store/settings';
import { BODIES, LABELS, type BodyDef } from './bodies';

export interface BgConfig {
  species: Species[];
  count: number;
  speed: number;
  grid: number;
  palette: MosaicPalette;
  dark: boolean;
  /** Статичный кадр (reduced motion, экономия энергии). */
  static: boolean;
  labels: boolean;
}

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Node {
  x: number;
  y: number;
}

interface Creature {
  kind: Species;
  def: BodyDef;
  nodes: Node[];
  heading: number;
  speed: number;
  scale: number;
  seg: number;
  phase: number;
  wander: number;
  goal: number;
  zoneTime: number;
  seed: number;
  group: number;
  leader: boolean;
}

interface Ripple {
  x: number;
  y: number;
  t0: number;
}

const LOW_FPS_MS = 1000 / 50;
const MAX_DPR = 2;
const RIPPLE_R = 120;
const RIPPLE_LIFE = 1.3;

const PALETTES: Record<MosaicPalette, { light: string[]; dark: string[] }> = {
  slate: {
    light: ['#2e333b', '#3f4652', '#525a68', '#6b7483'],
    dark: ['#d9dde4', '#c3c8d0', '#aab0b9', '#8f96a0'],
  },
  warm: {
    light: ['#5a4d40', '#6e5f4f', '#8c7a66', '#a89683'],
    dark: ['#e5d6c4', '#d2c0ab', '#bfa993', '#a8927c'],
  },
  mixed: {
    light: ['#2e333b', '#3f4652', '#525a68', '#6b7483', '#8c7a66', '#a89683'],
    dark: ['#d9dde4', '#c3c8d0', '#aab0b9', '#8f96a0', '#d2c0ab', '#bfa993'],
  },
};

export interface BackgroundEngine {
  setConfig: (cfg: BgConfig) => void;
  setZone: (zone: Zone | null) => void;
  /** Касание фона: рябь по сетке и уклонение обитателей. */
  touch: (x: number, y: number, pressed: boolean) => void;
  /** Наклон телефона → «течение», px/с. */
  setCurrent: (x: number, y: number) => void;
  start: () => void;
  stop: () => void;
  destroy: () => void;
  stats: () => { creatures: number; degraded: number; frameMs: number; cells: number };
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function createBackground(canvas: HTMLCanvasElement): BackgroundEngine | null {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return null;

  let cfg: BgConfig = { species: [], count: 0, speed: 1, grid: 12, palette: 'mixed', dark: false, static: false, labels: false };
  let creatures: Creature[] = [];
  let ripples: Ripple[] = [];
  let finger: { x: number; y: number } | null = null;
  let current = { x: 0, y: 0 };
  let zone: Zone | null = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let running = false;
  let raf = 0;
  let last = 0;
  let time = 0;
  let frameEma = 16;
  let degraded = 0;
  let checkAcc = 0;
  let spawnTimer = 0;
  let cellsDrawn = 0;
  let groupSeq = 1;
  const weak =
    typeof navigator !== 'undefined' &&
    ((navigator.hardwareConcurrency || 8) <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4);
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const resize = (): void => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const d = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    if (w === width && h === height && d === dpr) return;
    width = w;
    height = h;
    dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const maxCreatures = (): number => {
    if (cfg.species.length === 0) return 0;
    const cap = weak ? Math.min(cfg.count, 2) : cfg.count;
    return Math.max(0, cap - degraded);
  };

  const makeCreature = (kind: Species, x: number, y: number, heading: number, scale: number, group: number, leader: boolean): Creature => {
    const def = BODIES[kind];
    const seg = (def.length * scale) / (def.nodes - 1);
    const nodes: Node[] = [];
    for (let i = 0; i < def.nodes; i++) nodes.push({ x: x - Math.cos(heading) * seg * i, y: y - Math.sin(heading) * seg * i });
    return {
      kind,
      def,
      nodes,
      heading,
      speed: def.speed * (0.85 + rnd() * 0.3),
      scale,
      seg,
      phase: rnd() * 6.28,
      wander: 0,
      goal: Math.cos(heading) >= 0 ? 0 : Math.PI,
      zoneTime: 0,
      seed: Math.floor(rnd() * 1e6),
      group,
      leader,
    };
  };

  /** Новый обитатель (или стайка) из-за левого/правого края; inside — сразу внутри экрана. */
  const spawn = (inside: boolean): Creature[] => {
    const kind = cfg.species[Math.floor(rnd() * cfg.species.length)];
    if (!kind) return [];
    const def = BODIES[kind];
    const dir = rnd() < 0.5 ? 1 : -1;
    const scale = 0.85 + rnd() * 0.3;
    const len = def.length * scale;
    const y = height * (0.1 + rnd() * 0.75);
    const x = inside ? width * (0.2 + rnd() * 0.6) : dir > 0 ? -len - 20 : width + len + 20;
    const heading = (dir > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 0.5;
    const group = groupSeq++;
    if (def.school) {
      const n = def.school.min + Math.floor(rnd() * (def.school.max - def.school.min + 1));
      const out: Creature[] = [];
      for (let i = 0; i < n; i++) {
        out.push(makeCreature(kind, x + (rnd() - 0.5) * 90, y + (rnd() - 0.5) * 70, heading + (rnd() - 0.5) * 0.4, scale * (0.8 + rnd() * 0.4), group, i === 0));
      }
      return out;
    }
    return [makeCreature(kind, x, y, heading, scale, group, true)];
  };

  const fill = (inside: boolean): void => {
    const max = maxCreatures();
    let guard = 0;
    while (groupsCount() < max && guard++ < 10) {
      const born = spawn(inside);
      if (born.length === 0) break;
      creatures.push(...born);
    }
  };

  const groupsCount = (): number => new Set(creatures.map((c) => c.group)).size;

  const headOf = (c: Creature): Node => c.nodes[0] ?? { x: 0, y: 0 };

  const inZone = (p: Node): boolean => !!zone && p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h;

  const steer = (c: Creature, dt: number): void => {
    const head = headOf(c);
    let desired = c.goal;
    // wander: медленный случайный дрейф курса
    c.wander = Math.max(-0.7, Math.min(0.7, c.wander + (rnd() - 0.5) * 1.8 * dt));
    desired += c.wander;
    let sx = Math.cos(desired);
    let sy = Math.sin(desired);
    // мягкие границы по вертикали
    if (head.y < height * 0.08) sy += 1.5;
    if (head.y > height * 0.92) sy -= 1.5;
    // палец: обойти
    if (finger) {
      const dx = head.x - finger.x;
      const dy = head.y - finger.y;
      const d = Math.hypot(dx, dy);
      if (d < 170 && d > 1e-3) {
        const k = (1 - d / 170) * 3;
        sx += (dx / d) * k;
        sy += (dy / d) * k;
      }
    }
    // зона результата: дольше 2 с внутри — уходить
    if (zone && inZone(head)) {
      c.zoneTime += dt;
      if (c.zoneTime > 2) {
        const cx = zone.x + zone.w / 2;
        const cy = zone.y + zone.h / 2;
        const dx = head.x - cx;
        const dy = head.y - cy;
        const d = Math.hypot(dx, dy) || 1;
        sx += (dx / d) * 3;
        sy += (dy / d) * 3;
      }
    } else {
      c.zoneTime = Math.max(0, c.zoneTime - dt);
    }
    // boids для стайки
    if (c.def.school) {
      let cx = 0;
      let cy = 0;
      let ax = 0;
      let ay = 0;
      let n = 0;
      for (const o of creatures) {
        if (o === c || o.group !== c.group) continue;
        const oh = headOf(o);
        const dx = oh.x - head.x;
        const dy = oh.y - head.y;
        const d = Math.hypot(dx, dy);
        if (d < 26 && d > 1e-3) {
          sx -= (dx / d) * (1 - d / 26) * 2.5;
          sy -= (dy / d) * (1 - d / 26) * 2.5;
        }
        if (d < 110) {
          cx += oh.x;
          cy += oh.y;
          ax += Math.cos(o.heading);
          ay += Math.sin(o.heading);
          n++;
        }
      }
      if (n > 0) {
        sx += ((cx / n - head.x) / 60) * 0.8 + ax / n;
        sy += ((cy / n - head.y) / 60) * 0.8 + ay / n;
      }
    }
    const target = Math.atan2(sy, sx);
    const dh = wrapAngle(target - c.heading);
    const maxTurn = c.def.turnRate * dt;
    c.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
  };

  const moveSpine = (c: Creature, dt: number): void => {
    const v = c.speed * cfg.speed;
    const head = headOf(c);
    head.x += Math.cos(c.heading) * v * dt + current.x * dt;
    head.y += Math.sin(c.heading) * v * dt + current.y * dt;
    const maxBend = c.def.school ? 0.7 : 0.38;
    for (let i = 1; i < c.nodes.length; i++) {
      const prev = c.nodes[i - 1]!;
      const node = c.nodes[i]!;
      let dx = node.x - prev.x;
      let dy = node.y - prev.y;
      if (Math.hypot(dx, dy) < 1e-6) {
        dx = -Math.cos(c.heading);
        dy = -Math.sin(c.heading);
      }
      let ang = Math.atan2(dy, dx);
      if (i >= 2) {
        const pp = c.nodes[i - 2]!;
        const prevAng = Math.atan2(prev.y - pp.y, prev.x - pp.x);
        const diff = wrapAngle(ang - prevAng);
        if (Math.abs(diff) > maxBend) ang = prevAng + Math.sign(diff) * maxBend;
      } else {
        // первый сегмент тянется за курсом головы
        const diff = wrapAngle(ang - (c.heading + Math.PI));
        if (Math.abs(diff) > maxBend) ang = c.heading + Math.PI + Math.sign(diff) * maxBend;
      }
      node.x = prev.x + Math.cos(ang) * c.seg;
      node.y = prev.y + Math.sin(ang) * c.seg;
    }
  };

  const update = (dt: number): void => {
    time += dt;
    const max = maxCreatures();
    while (groupsCount() > max && creatures.length > 0) {
      const g = creatures[creatures.length - 1]!.group;
      creatures = creatures.filter((c) => c.group !== g);
    }
    for (const c of creatures) {
      steer(c, dt);
      moveSpine(c, dt);
    }
    // ушедшие за противоположный край
    const margin = 80;
    creatures = creatures.filter((c) => {
      const len = c.def.length * c.scale;
      const head = headOf(c);
      const gone = (c.goal === 0 && head.x > width + len + margin) || (c.goal !== 0 && head.x < -len - margin);
      return !gone;
    });
    spawnTimer -= dt;
    if (groupsCount() < max && spawnTimer <= 0) {
      creatures.push(...spawn(false));
      spawnTimer = 1.5 + rnd() * 3;
    }
    const now = time;
    ripples = ripples.filter((r) => now - r.t0 < RIPPLE_LIFE);
  };

  /** Контур тела: узлы со смещением волны и полуширинами → многоугольник. */
  const outline = (c: Creature): Node[] => {
    const def = c.def;
    const n = c.nodes.length;
    const maxHalf = def.maxHalf * c.scale;
    const left: Node[] = [];
    const right: Node[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const node = c.nodes[i]!;
      const next = c.nodes[Math.min(i + 1, n - 1)]!;
      const prev = c.nodes[Math.max(i - 1, 0)]!;
      let dx = prev.x - next.x;
      let dy = prev.y - next.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // нормаль к позвоночнику; для вида сбоку «верх» — вверх экрана
      let nx = -dy;
      let ny = dx;
      if (def.view === 'side' && ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const ramp = 0.25 + 0.75 * t;
      const wave = Math.sin(time * def.waveSpeed - i * def.phaseStep + c.phase) * def.waveAmp * maxHalf * ramp;
      const px = node.x + nx * wave;
      const py = node.y + ny * wave;
      const w = def.width(t) * maxHalf;
      const [lu, ld] = def.lobes(t, time + c.phase);
      left.push({ x: px + nx * (w + lu * maxHalf), y: py + ny * (w + lu * maxHalf) });
      right.push({ x: px - nx * (w + ld * maxHalf), y: py - ny * (w + ld * maxHalf) });
    }
    const head = c.nodes[0]!;
    const nose = { x: head.x + Math.cos(c.heading) * def.width(0) * maxHalf * 0.9, y: head.y + Math.sin(c.heading) * def.width(0) * maxHalf * 0.9 };
    return [nose, ...left, ...right.reverse()];
  };

  const inside = (poly: Node[], x: number, y: number): boolean => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i]!;
      const b = poly[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };

  const rippleOffset = (x: number, y: number): [number, number] => {
    let ox = 0;
    let oy = 0;
    for (const r of ripples) {
      const dx = x - r.x;
      const dy = y - r.y;
      const d = Math.hypot(dx, dy);
      if (d > RIPPLE_R || d < 1e-3) continue;
      const age = time - r.t0;
      const k = (1 - d / RIPPLE_R) * Math.exp(-age * 2.4) * 7 * Math.sin(age * 10 - d / 14);
      ox += (dx / d) * k;
      oy += (dy / d) * k;
    }
    return [ox, oy];
  };

  const draw = (): void => {
    ctx.clearRect(0, 0, width, height);
    const G = cfg.grid;
    const size = Math.round(G * 0.75);
    const pad = (G - size) / 2;
    const colors = cfg.dark ? PALETTES[cfg.palette].dark : PALETTES[cfg.palette].light;
    const buckets: number[][] = colors.map(() => []);
    cellsDrawn = 0;
    const labels: { text: string; x: number; y: number }[] = [];
    for (const c of creatures) {
      const poly = outline(c);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (maxX < -G || minX > width + G || maxY < -G || minY > height + G) continue;
      const gx0 = Math.floor(Math.max(minX, -G) / G) * G;
      const gy0 = Math.floor(Math.max(minY, -G) / G) * G;
      const gx1 = Math.min(maxX, width + G);
      const gy1 = Math.min(maxY, height + G);
      const n = c.nodes.length;
      for (let gy = gy0; gy <= gy1; gy += G) {
        for (let gx = gx0; gx <= gx1; gx += G) {
          const cx = gx + G / 2;
          const cy = gy + G / 2;
          if (!inside(poly, cx, cy)) continue;
          // ближайший узел → стабильный цвет клетки, привязанный к телу
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < n; i++) {
            const node = c.nodes[i]!;
            const d = (node.x - cx) * (node.x - cx) + (node.y - cy) * (node.y - cy);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          const node = c.nodes[best]!;
          const nxt = c.nodes[Math.min(best + 1, n - 1)]!;
          const side = (nxt.x - node.x) * (cy - node.y) - (nxt.y - node.y) * (cx - node.x) > 0 ? 1 : 0;
          const lateral = Math.round(Math.sqrt(bestD) / G);
          const h = (best * 31 + lateral * 17 + side * 7 + c.seed) % 97;
          const idx = h < 55 ? 0 : h < 78 ? 1 : h < 92 ? 2 : 3 + ((h + c.seed) % Math.max(1, colors.length - 3));
          buckets[Math.min(idx, colors.length - 1)]!.push(gx, gy);
        }
      }
      if (cfg.labels && c.leader) {
        const head = headOf(c);
        labels.push({ text: LABELS[c.kind], x: head.x, y: head.y - c.def.maxHalf * c.scale - 8 });
      }
    }
    const hasRipple = ripples.length > 0;
    for (let k = 0; k < colors.length; k++) {
      const cells = buckets[k]!;
      if (cells.length === 0) continue;
      ctx.fillStyle = colors[k]!;
      for (let i = 0; i < cells.length; i += 2) {
        let x = cells[i]! + pad;
        let y = cells[i + 1]! + pad;
        if (hasRipple) {
          const [ox, oy] = rippleOffset(x, y);
          x += ox;
          y += oy;
        }
        ctx.fillRect(x, y, size, size);
        cellsDrawn++;
      }
    }
    // рябь по пустой сетке вокруг касания — редкие точки
    if (hasRipple) {
      ctx.fillStyle = cfg.dark ? 'rgba(255,255,255,0.22)' : 'rgba(24,24,27,0.16)';
      for (const r of ripples) {
        const age = time - r.t0;
        const fade = Math.exp(-age * 2.4);
        for (let gy = Math.floor((r.y - RIPPLE_R) / G) * G; gy <= r.y + RIPPLE_R; gy += G * 2) {
          for (let gx = Math.floor((r.x - RIPPLE_R) / G) * G; gx <= r.x + RIPPLE_R; gx += G * 2) {
            const d = Math.hypot(gx - r.x, gy - r.y);
            if (d > RIPPLE_R) continue;
            const [ox, oy] = rippleOffset(gx, gy);
            const s = Math.max(1, 2.5 * fade * (1 - d / RIPPLE_R));
            ctx.fillRect(gx + G / 2 + ox - s / 2, gy + G / 2 + oy - s / 2, s, s);
          }
        }
      }
    }
    if (labels.length) {
      ctx.fillStyle = cfg.dark ? '#8f96a0' : '#71717a';
      ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'bottom';
      for (const l of labels) ctx.fillText(l.text, l.x, l.y);
    }
  };

  const frame = (now: number): void => {
    if (!running) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    frameEma = frameEma * 0.9 + dt * 1000 * 0.1;
    checkAcc += dt;
    if (checkAcc > 3) {
      checkAcc = 0;
      if (frameEma > LOW_FPS_MS && degraded < cfg.count - 1) degraded++;
    }
    resize();
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };

  const renderStatic = (): void => {
    resize();
    creatures = [];
    fill(true);
    // статичный кадр: не класть тела на зону цифры результата
    if (zone) {
      for (const c of creatures) {
        for (let tries = 0; tries < 8 && c.nodes.some((n) => inZone(n)); tries++) {
          const dy = (rnd() < 0.5 ? -1 : 1) * (zone.h / 2 + 60 + rnd() * 80);
          for (const n of c.nodes) n.y = Math.min(height - 20, Math.max(20, n.y + dy));
        }
      }
    }
    // несколько шагов, чтобы тела «расправились»
    for (let i = 0; i < 40; i++) for (const c of creatures) moveSpine(c, 0.03);
    draw();
  };

  const onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (running && !cfg.static) {
      last = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
  };
  const onResize = (): void => {
    resize();
    if (cfg.static) renderStatic();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);

  const api: BackgroundEngine = {
    setConfig(next) {
      const rebuild = next.species.join() !== cfg.species.join();
      cfg = { ...next, species: [...next.species] };
      degraded = 0;
      if (rebuild) creatures = [];
      if (cfg.static) {
        cancelAnimationFrame(raf);
        raf = 0;
        renderStatic();
      } else if (running) {
        resize();
        if (!raf && !document.hidden) {
          last = 0;
          raf = requestAnimationFrame(frame);
        }
      }
    },
    setZone(z) {
      const changed = !!z !== !!zone || (z && zone && (Math.abs(z.x - zone.x) > 4 || Math.abs(z.y - zone.y) > 4 || Math.abs(z.w - zone.w) > 4 || Math.abs(z.h - zone.h) > 4));
      zone = z;
      if (changed && cfg.static && running) renderStatic();
    },
    touch(x, y, pressed) {
      if (pressed) {
        finger = { x, y };
        const lastR = ripples[ripples.length - 1];
        if (!lastR || Math.hypot(lastR.x - x, lastR.y - y) > 24 || time - lastR.t0 > 0.25) {
          ripples.push({ x, y, t0: time });
          if (ripples.length > 6) ripples.shift();
        }
        if (cfg.static) draw();
      } else {
        finger = null;
      }
    },
    setCurrent(x, y) {
      current = { x, y };
    },
    start() {
      if (running) return;
      running = true;
      resize();
      fill(true);
      if (cfg.static) renderStatic();
      else if (!document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    destroy() {
      api.stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      creatures = [];
      ripples = [];
    },
    stats: () => ({ creatures: groupsCount(), degraded, frameMs: frameEma, cells: cellsDrawn }),
  };
  return api;
}
