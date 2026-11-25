/**
 * График солёности по времени: сглаженная монотонная кривая, полоса цели, зум по периодам,
 * перетаскивание и щипок для масштабирования, подсказка по касанию точки.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { fixed } from '../calc';
import type { Measurement } from '../store/measurements';
import { settings } from '../store/settings';
import { tick } from './haptics';
import { SAL_UNIT } from './strings';

const H = 210;
const PAD = { l: 34, r: 12, t: 16, b: 24 };
const DAY = 86_400_000;
const MIN_SPAN = 6 * 3_600_000;

type Range = '7d' | '30d' | '90d' | 'all';
const RANGES: { key: Range; label: string; days: number }[] = [
  { key: '7d', label: '7д', days: 7 },
  { key: '30d', label: '30д', days: 30 },
  { key: '90d', label: '90д', days: 90 },
  { key: 'all', label: 'всё', days: 0 },
];

const fmtTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Pt {
  x: number;
  y: number;
}

/** Монотонный кубический сплайн (Fritsch–Carlson): гладко, без выбросов за соседние точки. */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const p0 = pts[0]!;
  if (n === 1) return `M${p0.x.toFixed(1)},${p0.y.toFixed(1)}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d = Math.max(b.x - a.x, 1e-6);
    dx.push(d);
    m.push((b.y - a.y) / d);
  }
  const t: number[] = new Array<number>(n).fill(0);
  t[0] = m[0] ?? 0;
  t[n - 1] = m[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    const a = m[i - 1] ?? 0;
    const b = m[i] ?? 0;
    t[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const mi = m[i] ?? 0;
    if (mi === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = (t[i] ?? 0) / mi;
    const b = (t[i + 1] ?? 0) / mi;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * mi;
      t[i + 1] = tau * b * mi;
    }
  }
  let d = `M${p0.x.toFixed(1)},${p0.y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const h = (dx[i] ?? 0) / 3;
    const c1x = a.x + h;
    const c1y = a.y + (t[i] ?? 0) * h;
    const c2x = b.x - h;
    const c2y = b.y - (t[i + 1] ?? 0) * h;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  return d;
}

function niceStep(span: number): number {
  if (span <= 2.5) return 0.5;
  if (span <= 6) return 1;
  if (span <= 12) return 2;
  return 5;
}

function xLabel(t: number, span: number): string {
  if (span < 2 * DAY) return fmtTime.format(t);
  if (span < 120 * DAY) return fmtDay.format(t);
  return fmtMonth.format(t);
}

export function Chart({ data }: { data: Measurement[] }) {
  const s = settings.value;
  const unit = SAL_UNIT[s.salinityUnit];
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);
  const [range, setRange] = useState<Range>('all');
  const [win, setWin] = useState<{ t0: number; t1: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const gesture = useRef<{ pointers: Map<number, number>; startWin: { t0: number; t1: number }; startDist: number; startMid: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.round(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(240, Math.round(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const pts = [...data].filter((m) => Number.isFinite(m.salinity)).sort((a, b) => a.at - b.at);
  if (pts.length === 0) return <p class="empty">График появится после первого замера</p>;

  const dataMin = pts[0]?.at ?? 0;
  const dataMax = pts[pts.length - 1]?.at ?? dataMin;
  const extentPad = Math.max((dataMax - dataMin) * 0.06, 3_600_000);
  const fullLen = Math.max(dataMax - dataMin + 2 * extentPad, MIN_SPAN);
  const mid = (dataMin + dataMax) / 2;
  const full = { t0: mid - fullLen / 2, t1: mid + fullLen / 2 };
  const view = win ?? full;
  const span = Math.max(view.t1 - view.t0, MIN_SPAN);
  const visible = pts.filter((p) => p.at >= view.t0 && p.at <= view.t1);
  const sals = (visible.length ? visible : pts).map((p) => p.salinity);
  let yMin = Math.min(...sals, s.targetMin) - 0.4;
  let yMax = Math.max(...sals, s.targetMax) + 0.4;
  if (yMax - yMin < 2) {
    const mid = (yMin + yMax) / 2;
    yMin = mid - 1;
    yMax = mid + 1;
  }
  const x = (t: number): number => PAD.l + ((t - view.t0) / span) * (W - PAD.l - PAD.r);
  const y = (v: number): number => PAD.t + ((yMax - v) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const step = niceStep(yMax - yMin);
  const ticks: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
  const xTicks: number[] = [];
  for (let i = 0; i < 4; i++) xTicks.push(view.t0 + (span * (i + 0.5)) / 4);

  const line = pts.map((p) => ({ x: x(p.at), y: y(p.salinity) }));
  const path = monotonePath(line);
  const base = y(yMin);
  const first = line[0];
  const last = line[line.length - 1];
  const area = first && last && line.length > 1 ? `${path} L${last.x.toFixed(1)},${base.toFixed(1)} L${first.x.toFixed(1)},${base.toFixed(1)} Z` : '';
  const sel = picked ? pts.find((p) => p.id === picked) : undefined;
  const showPoints = visible.length <= 60;

  const applyRange = (r: Range): void => {
    tick();
    setRange(r);
    setPicked(null);
    const def = RANGES.find((it) => it.key === r);
    if (!def || def.days === 0) {
      setWin(null);
      return;
    }
    const t1 = Math.max(dataMax, Date.now()) + 3_600_000;
    setWin({ t0: t1 - def.days * DAY, t1 });
  };

  const clampWin = (w: { t0: number; t1: number }): { t0: number; t1: number } => {
    const minT = full.t0 - (dataMax - dataMin);
    const maxT = full.t1 + (dataMax - dataMin);
    let { t0, t1 } = w;
    if (t1 - t0 < MIN_SPAN) {
      const mid = (t0 + t1) / 2;
      t0 = mid - MIN_SPAN / 2;
      t1 = mid + MIN_SPAN / 2;
    }
    const len = t1 - t0;
    if (t0 < minT) {
      t0 = minT;
      t1 = minT + len;
    }
    if (t1 > maxT) {
      t1 = maxT;
      t0 = Math.max(minT, maxT - len);
    }
    return { t0, t1 };
  };

  const plotW = W - PAD.l - PAD.r;

  return (
    <div class="chart-wrap" ref={wrap}>
      <div class="filter-row" role="group" aria-label="Период">
        {RANGES.map((r) => (
          <button key={r.key} type="button" class="chip" aria-pressed={range === r.key && (r.key === 'all' ? win === null : true)} onClick={() => applyRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      <svg
        class="chart"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={`Солёность по времени, ${pts.length} замеров, от ${fixed(Math.min(...sals), 1)} до ${fixed(Math.max(...sals), 1)} ${unit}`}
        onPointerDown={(e) => {
          const g = gesture.current ?? { pointers: new Map<number, number>(), startWin: view, startDist: 0, startMid: 0, moved: false };
          g.pointers.set(e.pointerId, e.clientX);
          g.startWin = view;
          const xs = [...g.pointers.values()];
          if (xs.length === 2) {
            g.startDist = Math.abs((xs[0] ?? 0) - (xs[1] ?? 0));
            g.startMid = ((xs[0] ?? 0) + (xs[1] ?? 0)) / 2;
          }
          gesture.current = g;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (!g?.pointers.has(e.pointerId)) return;
          const startX = g.pointers.get(e.pointerId) ?? e.clientX;
          if (g.pointers.size === 1) {
            const dxPx = e.clientX - startX;
            if (Math.abs(dxPx) > 3) g.moved = true;
            const shift = (-dxPx / plotW) * (g.startWin.t1 - g.startWin.t0);
            setWin(clampWin({ t0: g.startWin.t0 + shift, t1: g.startWin.t1 + shift }));
          } else {
            g.pointers.set(e.pointerId, e.clientX);
            const xs = [...g.pointers.values()];
            const dist = Math.max(Math.abs((xs[0] ?? 0) - (xs[1] ?? 0)), 10);
            const scale = g.startDist > 0 ? g.startDist / dist : 1;
            const midFrac = (g.startMid - (e.currentTarget.getBoundingClientRect().left + PAD.l)) / plotW;
            const len = g.startWin.t1 - g.startWin.t0;
            const anchor = g.startWin.t0 + len * midFrac;
            const newLen = len * scale;
            g.moved = true;
            setWin(clampWin({ t0: anchor - newLen * midFrac, t1: anchor + newLen * (1 - midFrac) }));
          }
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          if (!g) return;
          g.pointers.delete(e.pointerId);
          if (g.pointers.size === 0) {
            if (!g.moved && e.target === e.currentTarget) setPicked(null);
            gesture.current = null;
          } else {
            g.startWin = view;
            g.startDist = 0;
          }
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
      >
        <defs>
          <clipPath id="plot">
            <rect x={PAD.l} y={0} width={plotW} height={H} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line class="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text x={PAD.l - 6} y={y(v) + 3.5} text-anchor="end">
              {step < 1 ? fixed(v, 1) : String(v)}
            </text>
          </g>
        ))}
        <rect class="band" x={PAD.l} width={plotW} y={y(s.targetMax)} height={Math.max(0, y(s.targetMin) - y(s.targetMax))} />
        <line class="band-edge" x1={PAD.l} x2={W - PAD.r} y1={y(s.targetMax)} y2={y(s.targetMax)} />
        <line class="band-edge" x1={PAD.l} x2={W - PAD.r} y1={y(s.targetMin)} y2={y(s.targetMin)} />
        <line class="goal" x1={PAD.l} x2={W - PAD.r} y1={y(s.target)} y2={y(s.target)} />
        <g clip-path="url(#plot)">
          {area && <path class="area" d={area} />}
          <path class="line" d={path} />
          {showPoints &&
            pts.map((p) => (
              <g key={p.id}>
                <circle class="pt" cx={x(p.at)} cy={y(p.salinity)} r={visible.length > 30 ? 2 : 3} />
                <circle
                  class="pt-hit"
                  cx={x(p.at)}
                  cy={y(p.salinity)}
                  r={14}
                  onClick={() => {
                    if (gesture.current?.moved) return;
                    setPicked(picked === p.id ? null : p.id);
                  }}
                />
              </g>
            ))}
        </g>
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={H - 7} text-anchor="middle">
            {xLabel(t, span)}
          </text>
        ))}
        {sel && (
          <g transform={`translate(${Math.min(Math.max(x(sel.at), PAD.l + 72), W - PAD.r - 72)}, ${Math.max(y(sel.salinity) - 42, 2)})`}>
            <rect class="tip-bg" x={-70} y={0} width={140} height={34} rx={8} />
            <text class="tip-text" x={0} y={14} text-anchor="middle">
              {fixed(sel.salinity, 1)} {unit} · {fixed(sel.reading, 4)}
            </text>
            <text class="tip-sub" x={0} y={27} text-anchor="middle">
              {fmtFull.format(sel.at)} · {fixed(sel.temperature, 1)} °C
            </text>
          </g>
        )}
      </svg>
      <div class="chart-caption">
        <span>
          {visible.length} из {pts.length} · цель {fixed(s.targetMin, 1)}–{fixed(s.targetMax, 1)} {unit}
        </span>
        <span>тяни · щипок · точка</span>
      </div>
    </div>
  );
}
