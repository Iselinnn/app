/**
 * Силуэты морских животных (SVG-контуры, смотрят вправо) и их растеризация
 * в сетку квадратиков: контур → маска → клетки с «рассыпающимся» краем и пылью.
 */
import type { PixelPalette, Species } from '../store/settings';

export type Motion = 'wave' | 'flap' | 'eel' | 'paddle';

export interface SpriteDef {
  path: string;
  /** Размер системы координат контура. */
  vb: readonly [number, number];
  /** Базовая длина на экране, px. */
  length: number;
  /** Базовая скорость, px/с. */
  speed: number;
  motion: Motion;
  /** Амплитуда изгиба в клетках, число волн по телу, частота, Гц. */
  amp: number;
  waves: number;
  freq: number;
  /** Стайка: сколько особей. */
  school: number;
}

export const SPRITES: Record<Species, SpriteDef> = {
  shark: {
    path: 'M200,46 C184,36 158,28 126,30 L118,30 C110,20 100,10 92,4 C90,16 86,26 80,32 C64,34 46,38 30,44 C22,34 12,22 2,14 C8,26 14,38 16,48 C12,56 8,64 6,72 C14,66 22,58 30,54 C48,58 70,62 100,64 C98,72 94,80 90,88 C102,80 114,70 126,62 C156,60 180,54 200,46 Z',
    vb: [200, 90],
    length: 230,
    speed: 30,
    motion: 'wave',
    amp: 0.9,
    waves: 0.9,
    freq: 0.9,
    school: 1,
  },
  hammerhead: {
    path: 'M200,18 L200,66 L186,66 L186,56 C172,58 160,61 148,63 C136,65 124,66 116,64 C110,72 102,82 94,90 C102,80 106,70 106,64 C80,62 54,58 30,54 C22,60 14,68 6,74 C12,60 14,52 16,48 C12,36 8,24 2,12 C14,22 24,34 30,44 C50,38 66,34 80,32 C88,24 92,12 94,2 C104,12 112,22 118,30 C132,31 150,33 166,36 L186,38 L186,18 Z',
    vb: [200, 90],
    length: 220,
    speed: 28,
    motion: 'wave',
    amp: 0.9,
    waves: 0.9,
    freq: 1,
    school: 1,
  },
  ray: {
    path: 'M198,55 C196,47 190,42 182,42 C170,38 150,24 128,10 C116,2 104,2 100,4 C96,20 80,40 62,48 C56,50 52,52 50,52 L2,54 L2,57 L50,58 C52,58 56,60 62,62 C80,70 96,90 100,106 C104,108 116,108 128,100 C150,86 170,72 182,68 C190,68 196,63 198,55 Z',
    vb: [200, 110],
    length: 200,
    speed: 22,
    motion: 'flap',
    amp: 1.6,
    waves: 0.8,
    freq: 0.45,
    school: 1,
  },
  clownfish: {
    path: 'M198,58 C192,44 178,32 158,28 C146,22 128,20 112,26 C100,22 88,26 80,34 C70,40 62,52 60,58 C50,50 36,42 24,38 C28,48 30,56 30,60 C30,64 28,72 24,82 C36,78 50,70 60,62 C64,70 72,82 84,88 C100,94 124,92 144,86 C164,82 184,72 198,58 Z',
    vb: [200, 110],
    length: 48,
    speed: 34,
    motion: 'wave',
    amp: 0.6,
    waves: 0.7,
    freq: 2.6,
    school: 5,
  },
  turtle: {
    path: 'M198,60 C198,52 192,46 184,46 L168,47 C170,40 174,34 180,30 C188,22 198,14 200,8 C190,8 174,14 160,24 C148,18 130,14 110,14 C88,14 70,18 56,26 C50,20 40,12 28,8 C32,18 36,28 38,36 C32,44 30,54 30,60 C30,66 32,76 38,84 C36,92 32,102 28,112 C40,108 50,100 56,94 C70,102 88,106 110,106 C130,106 148,102 160,96 C174,106 190,112 200,112 C198,106 188,98 180,90 C174,86 170,80 168,73 L184,74 C192,74 198,68 198,60 Z',
    vb: [200, 120],
    length: 150,
    speed: 15,
    motion: 'paddle',
    amp: 0.35,
    waves: 0.5,
    freq: 0.6,
    school: 1,
  },
  moray: {
    path: 'M200,24 C196,18 188,14 176,14 C150,10 110,8 70,12 C50,14 30,20 14,26 C8,28 2,30 2,32 C8,36 20,40 36,44 C70,52 120,54 160,50 C176,48 190,42 198,38 L184,31 L200,24 Z',
    vb: [200, 60],
    length: 250,
    speed: 20,
    motion: 'eel',
    amp: 1.5,
    waves: 1.4,
    freq: 0.8,
    school: 1,
  },
};

export interface RawCell {
  x: number;
  y: number;
  edge: boolean;
}
export interface RawDust {
  x: number;
  y: number;
  s: number;
}
export interface Shape {
  cols: number;
  rows: number;
  cells: RawCell[];
  dust: RawDust[];
}

/** Простой детерминированный генератор (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shapeCache = new Map<string, Shape | null>();

/** Контур → сетка cols × rows клеток. null, если Canvas 2D недоступен. */
export function rasterize(species: Species, cols: number, rnd: () => number): Shape | null {
  const def = SPRITES[species];
  const rows = Math.max(3, Math.round((cols * def.vb[1]) / def.vb[0]));
  const key = `${species}:${cols}`;
  const cached = shapeCache.get(key);
  if (cached !== undefined) return cached;

  let mask: Uint8Array | null = null;
  try {
    const cv = document.createElement('canvas');
    cv.width = cols;
    cv.height = rows;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (ctx && typeof Path2D === 'function') {
      ctx.scale(cols / def.vb[0], rows / def.vb[1]);
      ctx.fillStyle = '#000';
      ctx.fill(new Path2D(def.path));
      const data = ctx.getImageData(0, 0, cols, rows).data;
      mask = new Uint8Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) mask[i] = (data[i * 4 + 3] ?? 0) > 110 ? 1 : 0;
    }
  } catch {
    mask = null;
  }
  if (!mask) {
    shapeCache.set(key, null);
    return null;
  }
  const m = mask;
  const on = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < cols && y < rows && m[y * cols + x] === 1;
  const cells: RawCell[] = [];
  const dust: RawDust[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!on(x, y)) continue;
      const edge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
      if (edge) {
        if (rnd() < 0.28) {
          // край рассыпается: клетка выпадает, рядом остаётся пыль
          if (rnd() < 0.6) {
            dust.push({ x: x + (rnd() - 0.5) * 0.8, y: y + (rnd() - 0.5) * 0.8, s: 0.3 + rnd() * 0.3 });
          }
          continue;
        }
        if (rnd() < 0.4) {
          const dx = !on(x + 1, y) ? 1 : !on(x - 1, y) ? -1 : 0;
          const dy = !on(x, y + 1) ? 1 : !on(x, y - 1) ? -1 : 0;
          const dist = 1 + Math.floor(rnd() * 2);
          dust.push({ x: x + dx * dist + (rnd() - 0.5) * 0.6, y: y + dy * dist + (rnd() - 0.5) * 0.6, s: 0.22 + rnd() * 0.3 });
        }
      }
      cells.push({ x, y, edge });
    }
  }
  const shape: Shape = { cols, rows, cells, dust };
  shapeCache.set(key, shape);
  return shape;
}

export interface Group {
  color: string;
  alpha: number;
  cells: { x: number; y: number; s: number }[];
}

export interface Sprite {
  cols: number;
  rows: number;
  groups: Group[];
}

const GREY_LIGHT = ['#2b2e33', '#3c4047', '#52565e', '#6a6f78'];
const GREY_DARK = ['#d9dde4', '#c3c8d0', '#aab0b9', '#8f96a0'];
const WARM_LIGHT = ['#8a694c', '#a6805e'];
const WARM_DARK = ['#c9ae92', '#dcc5aa'];

function mix(hex: string, towards: string, k: number): string {
  const p = (h: string): [number, number, number] => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const a = p(hex);
  const b = p(towards);
  const c = a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function pickFrom(list: string[], rnd: () => number): string {
  return list[Math.floor(rnd() * list.length)] ?? list[0] ?? '#000';
}

/** Цвет клетки в «натуральной» палитре: по виду, положению на теле и краю. */
function naturalColor(species: Species, fx: number, fy: number, edge: boolean, rnd: () => number): string {
  switch (species) {
    case 'shark':
      return fy > 0.64 ? pickFrom(['#b7bec6', '#c7ccd2'], rnd) : pickFrom(['#4d5964', '#5a6774', '#44505a'], rnd);
    case 'hammerhead':
      return fy > 0.66 ? pickFrom(['#bcbfbb', '#cbcdc8'], rnd) : pickFrom(['#5b5f5a', '#6a6e68', '#4f5350'], rnd);
    case 'ray':
      return rnd() < 0.07 ? '#9fb3bf' : pickFrom(['#2f3a44', '#3b4854', '#273039'], rnd);
    case 'clownfish': {
      const stripe = (fx > 0.24 && fx < 0.33) || (fx > 0.52 && fx < 0.61) || (fx > 0.8 && fx < 0.87);
      if (stripe) return '#f4f1ea';
      return edge ? '#c45d1f' : pickFrom(['#e8762e', '#f08a3c', '#df6c26'], rnd);
    }
    case 'turtle': {
      const shell = fx > 0.28 && fx < 0.8 && fy > 0.14 && fy < 0.86;
      return shell ? pickFrom(['#5b7a4a', '#6e8a52', '#4f6a42'], rnd) : pickFrom(['#8a8456', '#7e7a50', '#938d5c'], rnd);
    }
    case 'moray':
      return rnd() < 0.08 ? '#d9d5b8' : pickFrom(['#6e7d43', '#7d8c4c', '#5e6d3a'], rnd);
  }
}

/** Раскраска формы под палитру и тему; клетки группируются по цвету и прозрачности. */
export function colorize(shape: Shape, species: Species, palette: PixelPalette, dark: boolean, rnd: () => number): Sprite {
  const greys = dark ? GREY_DARK : GREY_LIGHT;
  const warm = dark ? WARM_DARK : WARM_LIGHT;
  const groups = new Map<string, Group>();
  const add = (color: string, alpha: number, x: number, y: number, s: number): void => {
    const key = `${color}|${alpha}`;
    let g = groups.get(key);
    if (!g) {
      g = { color, alpha, cells: [] };
      groups.set(key, g);
    }
    g.cells.push({ x, y, s });
  };
  const colorOf = (c: { x: number; y: number; edge: boolean }): string => {
    if (palette === 'natural') {
      const nat = naturalColor(species, c.x / shape.cols, c.y / shape.rows, c.edge, rnd);
      return dark ? mix(nat, '#ffffff', 0.3) : nat;
    }
    if (palette === 'warm' && rnd() < 0.08) return pickFrom(warm, rnd);
    return pickFrom(greys, rnd);
  };
  for (const c of shape.cells) {
    const alpha = c.edge ? 0.55 + Math.round(rnd() * 2) * 0.15 : 0.85 + Math.round(rnd()) * 0.15;
    const s = c.edge ? 0.7 + Math.round(rnd() * 2) * 0.1 : 1;
    add(colorOf(c), Math.round(alpha * 100) / 100, c.x, c.y, s);
  }
  for (const d of shape.dust) {
    add(pickFrom(greys, rnd), 0.4, d.x, d.y, d.s);
  }
  return { cols: shape.cols, rows: shape.rows, groups: [...groups.values()] };
}
