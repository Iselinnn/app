/**
 * Фоновая анимация: один Canvas 2D, пиксельные силуэты, след из гаснущих точек,
 * мерцающий «планктон». rAF, DPR ≤ 2, пауза при скрытии вкладки, авто-снижение
 * числа обитателей при низком FPS, статичный кадр при reduced-motion / экономии энергии.
 */
import type { PixelPalette, Species } from '../store/settings';
import { SPRITES, colorize, rasterize, rng, type Motion, type Sprite } from './sprites';

export interface BgConfig {
  species: Species[];
  count: number;
  speed: number;
  pixel: number;
  palette: PixelPalette;
  dark: boolean;
  /** Статичный фон (reduced motion, экономия энергии). */
  static: boolean;
}

interface Member {
  dx: number;
  dy: number;
  phase: number;
}

interface Creature {
  species: Species;
  sprite: Sprite;
  p: number;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  baseY: number;
  bobAmp: number;
  bobFreq: number;
  bobPhase: number;
  phase: number;
  freq: number;
  members: Member[];
  trail: { x: number; y: number; life: number }[];
  trailAcc: number;
  age: number;
}

interface Plankton {
  x: number;
  y: number;
  s: number;
  phase: number;
  rate: number;
  drift: number;
}

const LOW_FPS_MS = 1000 / 42;
const MAX_DPR = 2;

export interface BackgroundEngine {
  setConfig: (cfg: BgConfig) => void;
  start: () => void;
  stop: () => void;
  destroy: () => void;
  /** Для диагностики и тестов. */
  stats: () => { creatures: number; degraded: number; frameMs: number };
}

export function createBackground(canvas: HTMLCanvasElement): BackgroundEngine | null {
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return null;

  let cfg: BgConfig = { species: [], count: 0, speed: 1, pixel: 6, palette: 'warm', dark: false, static: false };
  let creatures: Creature[] = [];
  let plankton: Plankton[] = [];
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
  let seed = 1;
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
    plankton = [];
    const n = Math.min(44, Math.round((w * h) / 20000));
    for (let i = 0; i < n; i++) {
      plankton.push({ x: rnd() * w, y: rnd() * h, s: 1 + Math.round(rnd()), phase: rnd() * 6.28, rate: 0.4 + rnd() * 0.8, drift: 2 + rnd() * 4 });
    }
  };

  const maxCreatures = (): number => (cfg.species.length === 0 ? 0 : Math.max(0, cfg.count - degraded));

  const spawn = (inside: boolean): Creature | null => {
    const species = cfg.species[Math.floor(rnd() * cfg.species.length)];
    if (!species) return null;
    const def = SPRITES[species];
    const p = cfg.pixel;
    const scale = 0.85 + rnd() * 0.3;
    const cols = Math.max(6, Math.round((def.length * scale) / p));
    const shape = rasterize(species, cols, rng(cols * 31 + species.length));
    if (!shape) return null;
    const sprite = colorize(shape, species, cfg.palette, cfg.dark, rng(Math.floor(rnd() * 1e9)));
    const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
    const len = cols * p;
    const lane = rnd() < 0.75 ? 0.08 + rnd() * 0.5 : 0.55 + rnd() * 0.3;
    const baseY = height * lane;
    const members: Member[] = [];
    for (let i = 0; i < def.school; i++) {
      members.push(i === 0 ? { dx: 0, dy: 0, phase: 0 } : { dx: (rnd() - 0.5) * len * 3.2, dy: (rnd() - 0.5) * len * 1.6, phase: rnd() * 6.28 });
    }
    return {
      species,
      sprite,
      p,
      x: inside ? rnd() * width : dir > 0 ? -len * 1.6 : width + len * 1.6,
      y: baseY,
      dir,
      speed: def.speed * (0.8 + rnd() * 0.4),
      baseY,
      bobAmp: p * (2 + rnd() * 3),
      bobFreq: 0.05 + rnd() * 0.06,
      bobPhase: rnd() * 6.28,
      phase: rnd() * 6.28,
      freq: def.freq * (0.85 + rnd() * 0.3),
      members,
      trail: [],
      trailAcc: 0,
      age: 0,
    };
  };

  const fill = (): void => {
    const max = maxCreatures();
    while (creatures.length < max) {
      const c = spawn(true);
      if (!c) break;
      creatures.push(c);
    }
  };

  const update = (dt: number): void => {
    time += dt;
    const max = maxCreatures();
    if (creatures.length > max) creatures.length = max;
    for (const c of creatures) {
      c.age += dt;
      c.x += c.dir * c.speed * cfg.speed * dt;
      c.y = c.baseY + Math.sin(time * c.bobFreq * 6.28 + c.bobPhase) * c.bobAmp;
      c.phase += dt * c.freq * 6.28 * Math.min(cfg.speed, 1.6);
      c.trailAcc += dt;
      if (c.trailAcc > 0.09) {
        c.trailAcc = 0;
        const tailX = c.x - c.dir * (c.sprite.cols / 2) * c.p;
        c.trail.push({ x: tailX, y: c.y + (rnd() - 0.5) * c.p * 2, life: 1 });
        if (c.trail.length > 22) c.trail.shift();
      }
      for (const t of c.trail) t.life -= dt / 1.4;
      c.trail = c.trail.filter((t) => t.life > 0);
    }
    const margin = (c: Creature): number => c.sprite.cols * c.p * 2.2;
    creatures = creatures.filter((c) => (c.dir > 0 ? c.x < width + margin(c) : c.x > -margin(c)));
    spawnTimer -= dt;
    if (creatures.length < max && spawnTimer <= 0) {
      const c = spawn(false);
      if (c) creatures.push(c);
      spawnTimer = 1 + rnd() * 3;
    }
    for (const pl of plankton) {
      pl.y -= pl.drift * dt;
      if (pl.y < -4) {
        pl.y = height + 4;
        pl.x = rnd() * width;
      }
    }
  };

  const motionFactor = (motion: Motion, tailness: number): number => {
    switch (motion) {
      case 'wave':
        return Math.pow(tailness, 1.8);
      case 'eel':
        return 0.45 + 0.55 * tailness;
      case 'paddle':
        return Math.pow(tailness, 1.2) * 0.6;
      case 'flap':
        return 1;
    }
  };

  /**
   * Кадр: клетки рисуются прямоугольниками со смещением по синусоиде вдоль тела.
   * Замерено: ~1500 fillRect на кадр дешевле, чем нарезка предрендеренного спрайта drawImage
   * (в программном растеризаторе drawImage-колонки давали ~90 мс/кадр при CPU ×4).
   */
  const drawCreature = (c: Creature): void => {
    const def = SPRITES[c.species];
    const { cols, rows } = c.sprite;
    const p = c.p;
    const gap = p * 0.82;
    const halfW = cols / 2;
    const halfH = rows / 2;
    const offsets = new Float32Array(cols);
    for (let i = 0; i < cols; i++) {
      offsets[i] = def.amp * p * motionFactor(def.motion, (cols - i) / cols) * Math.sin(6.28 * def.waves * (i / cols) + c.phase);
    }
    for (const m of c.members) {
      const cx = c.x + m.dx;
      const cy = c.y + m.dy + (m.phase ? Math.sin(time * 0.9 + m.phase) * p * 1.5 : 0);
      const ph = m.phase;
      for (const g of c.sprite.groups) {
        ctx.fillStyle = g.color;
        ctx.globalAlpha = g.alpha;
        for (const cell of g.cells) {
          const size = gap * cell.s;
          const col = Math.min(cols - 1, Math.max(0, Math.round(cell.x)));
          let oy = offsets[col] ?? 0;
          if (def.motion === 'flap') {
            const wing = Math.abs(cell.y - halfH) / halfH;
            oy = def.amp * p * Math.pow(wing, 1.6) * Math.sin(6.28 * def.waves * (cell.x / cols) + c.phase + ph);
          } else if (ph) {
            oy *= Math.cos(ph);
          }
          const px = cx + c.dir * (cell.x - halfW + 0.5) * p - size / 2;
          const py = cy + (cell.y - halfH + 0.5) * p + oy - size / 2;
          ctx.fillRect(px, py, size, size);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  const draw = (): void => {
    ctx.clearRect(0, 0, width, height);
    const ink = cfg.dark ? '#aeb4bd' : '#3c4047';
    // планктон
    ctx.fillStyle = ink;
    for (const pl of plankton) {
      const a = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin(time * pl.rate * 6.28 + pl.phase));
      ctx.globalAlpha = a;
      ctx.fillRect(pl.x, pl.y, pl.s, pl.s);
    }
    // следы
    for (const c of creatures) {
      for (const t of c.trail) {
        ctx.globalAlpha = 0.28 * t.life;
        const s = Math.max(1, c.p * 0.35 * t.life);
        ctx.fillRect(t.x, t.y, s, s);
      }
    }
    ctx.globalAlpha = 1;
    for (const c of creatures) drawCreature(c);
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
    fill();
    for (const c of creatures) c.phase = rnd() * 6.28;
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
      const rebuild =
        next.pixel !== cfg.pixel ||
        next.palette !== cfg.palette ||
        next.dark !== cfg.dark ||
        next.species.join() !== cfg.species.join();
      cfg = { ...next, species: [...next.species] };
      degraded = 0;
      if (rebuild) creatures = [];
      if (cfg.static) {
        cancelAnimationFrame(raf);
        raf = 0;
        renderStatic();
      } else if (running) {
        resize();
        fill();
        if (!raf && !document.hidden) {
          last = 0;
          raf = requestAnimationFrame(frame);
        }
      }
    },
    start() {
      if (running) return;
      running = true;
      resize();
      fill();
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
      plankton = [];
    },
    stats: () => ({ creatures: creatures.length, degraded, frameMs: frameEma }),
  };
  return api;
}
