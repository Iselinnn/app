/**
 * Профили тел обитателей для движка «позвоночник + мозаика»:
 * ширина вдоль тела, плавники/крылья/молот как «лопасти», параметры волны и движения.
 * t — положение вдоль тела: 0 — нос, 1 — хвост. Ширины — в долях maxHalf.
 */
import type { Species } from '../store/settings';

export type View = 'side' | 'top';

export interface BodyDef {
  /** Число узлов позвоночника. */
  nodes: number;
  /** Длина тела, px (при масштабе 1). */
  length: number;
  /** Скорость, px/с. */
  speed: number;
  view: View;
  /** Наибольшая полуширина тела, px. */
  maxHalf: number;
  /** Амплитуда волны по телу, в долях maxHalf. */
  waveAmp: number;
  /** Частота волны, рад/с. */
  waveSpeed: number;
  /** Сдвиг фазы на узел. */
  phaseStep: number;
  /** Максимальная скорость поворота, рад/с. */
  turnRate: number;
  /** Полуширина тела в точке t, 0..1. */
  width: (t: number) => number;
  /** Лопасти [верх/лево, низ/право] в точке t, в долях maxHalf; time — для колыхания. */
  lobes: (t: number, time: number) => [number, number];
  /** Стайка: диапазон числа особей. */
  school?: { min: number; max: number };
}

const smooth = (t: number, a: number, b: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Треугольная лопасть: 0 вне [a, b], пик h в точке p. */
const tri = (t: number, a: number, p: number, b: number, h: number): number => {
  if (t <= a || t >= b) return 0;
  return t < p ? (h * (t - a)) / (p - a) : (h * (b - t)) / (b - p);
};

const sharkWidth = (t: number): number => {
  if (t < 0.3) return 0.22 + 0.78 * smooth(t, 0, 0.3);
  if (t < 0.55) return 1;
  if (t < 0.9) return 1 - 0.75 * ((t - 0.55) / 0.35);
  return 0.25 - 0.12 * ((t - 0.9) / 0.1);
};

export const BODIES: Record<Species, BodyDef> = {
  shark: {
    nodes: 20,
    length: 240,
    speed: 30,
    view: 'side',
    maxHalf: 22,
    waveAmp: 0.45,
    waveSpeed: 2.2,
    phaseStep: 0.35,
    turnRate: 0.9,
    width: sharkWidth,
    lobes: (t) => [tri(t, 0.32, 0.4, 0.58, 1.5) + tri(t, 0.9, 0.98, 1, 1.6), tri(t, 0.28, 0.35, 0.52, 1.05) + tri(t, 0.9, 0.98, 1, 1.0)],
  },
  hammerhead: {
    nodes: 20,
    length: 230,
    speed: 28,
    view: 'top',
    maxHalf: 20,
    waveAmp: 0.5,
    waveSpeed: 2.4,
    phaseStep: 0.35,
    turnRate: 0.9,
    width: (t) => {
      if (t < 0.08) return 2.2;
      if (t < 0.14) return 2.2 - 1.6 * smooth(t, 0.08, 0.14);
      return Math.min(sharkWidth(t) + 0.1, 1);
    },
    lobes: (t) => [tri(t, 0.3, 0.37, 0.52, 1.1) + tri(t, 0.9, 0.98, 1, 1.2), tri(t, 0.3, 0.37, 0.52, 1.1) + tri(t, 0.9, 0.98, 1, 1.2)],
  },
  ray: {
    nodes: 18,
    length: 210,
    speed: 22,
    view: 'top',
    maxHalf: 13,
    waveAmp: 0.25,
    waveSpeed: 1.4,
    phaseStep: 0.3,
    turnRate: 0.7,
    width: (t) => {
      if (t < 0.15) return 0.55 + 0.45 * smooth(t, 0, 0.15);
      if (t < 0.55) return 1;
      if (t < 0.63) return 1 - 0.82 * smooth(t, 0.55, 0.63);
      return 0.18 - 0.12 * ((t - 0.63) / 0.37);
    },
    lobes: (t, time) => {
      const wing = tri(t, 0.08, 0.32, 0.66, 4.2) * (1 + 0.16 * Math.sin(time * 1.6 - t * 5));
      return [wing, wing];
    },
  },
  moray: {
    nodes: 24,
    length: 270,
    speed: 20,
    view: 'side',
    maxHalf: 12,
    waveAmp: 1.1,
    waveSpeed: 2.6,
    phaseStep: 0.3,
    turnRate: 1.1,
    width: (t) => {
      if (t < 0.1) return 0.78 + 0.22 * smooth(t, 0, 0.1);
      if (t < 0.5) return 1;
      return 1 - 0.65 * ((t - 0.5) / 0.5);
    },
    lobes: (t, time) => [t > 0.12 && t < 0.97 ? 0.45 * (1 + 0.3 * Math.sin(time * 4 - t * 14)) : 0, t > 0.5 && t < 0.95 ? 0.25 : 0],
  },
  school: {
    nodes: 6,
    length: 30,
    speed: 42,
    view: 'top',
    maxHalf: 4.5,
    waveAmp: 0.6,
    waveSpeed: 7,
    phaseStep: 0.6,
    turnRate: 3,
    width: (t) => {
      if (t < 0.3) return 0.45 + 0.55 * smooth(t, 0, 0.3);
      if (t < 0.7) return 1;
      if (t < 0.88) return 1 - 0.65 * ((t - 0.7) / 0.18);
      return 0.8;
    },
    lobes: () => [0, 0],
    school: { min: 6, max: 10 },
  },
};

export const LABELS: Record<Species, string> = {
  shark: 'акула',
  hammerhead: 'акула-молот',
  ray: 'скат',
  moray: 'мурена',
  school: 'стайка',
};
