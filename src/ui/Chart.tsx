/** График солёности по времени: тонкая линия, полоса целевого диапазона, подсказка по касанию. */
import { useState } from 'preact/hooks';
import { fixed } from '../calc';
import type { Measurement } from '../store/measurements';
import { settings } from '../store/settings';
import { SAL_UNIT } from './strings';

const W = 360;
const H = 170;
const PAD = { l: 30, r: 10, t: 14, b: 22 };

const fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Chart({ data }: { data: Measurement[] }) {
  const s = settings.value;
  const [picked, setPicked] = useState<string | null>(null);
  const pts = [...data].filter((m) => Number.isFinite(m.salinity)).sort((a, b) => a.at - b.at);
  if (pts.length === 0) return <p class="empty">График появится после первого замера</p>;

  const t0 = pts[0]?.at ?? 0;
  const t1 = pts[pts.length - 1]?.at ?? t0;
  const span = Math.max(t1 - t0, 1);
  const sals = pts.map((p) => p.salinity);
  let yMin = Math.min(...sals, s.targetMin) - 0.5;
  let yMax = Math.max(...sals, s.targetMax) + 0.5;
  if (yMax - yMin < 2) {
    const mid = (yMin + yMax) / 2;
    yMin = mid - 1;
    yMax = mid + 1;
  }
  const x = (t: number): number => (pts.length === 1 ? W / 2 : PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r));
  const y = (v: number): number => PAD.t + ((yMax - v) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const ticks: number[] = [];
  const stepY = yMax - yMin > 6 ? 2 : 1;
  for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v += stepY) ticks.push(v);

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.salinity).toFixed(1)}`).join(' ');
  const sel = picked ? pts.find((p) => p.id === picked) : undefined;
  const fmtAxis = t1 - t0 < 36 * 3600 * 1000 ? fmtTime : fmtDay;
  const unit = SAL_UNIT[s.salinityUnit];

  return (
    <div>
      <svg
        class="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Солёность по времени, ${pts.length} замеров, от ${fixed(Math.min(...sals), 1)} до ${fixed(Math.max(...sals), 1)} ${unit}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPicked(null);
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line class="grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text x={PAD.l - 6} y={y(v) + 4} text-anchor="end">
              {v}
            </text>
          </g>
        ))}
        <rect
          class="band"
          x={PAD.l}
          width={W - PAD.l - PAD.r}
          y={y(s.targetMax)}
          height={Math.max(0, y(s.targetMin) - y(s.targetMax))}
        />
        <line class="band-edge" x1={PAD.l} x2={W - PAD.r} y1={y(s.target)} y2={y(s.target)} />
        <path class="line" d={path} />
        {pts.map((p) => (
          <g key={p.id}>
            <circle class="pt" cx={x(p.at)} cy={y(p.salinity)} r={pts.length > 40 ? 1.5 : 3} />
            <circle
              class="pt-hit"
              cx={x(p.at)}
              cy={y(p.salinity)}
              r={12}
              onClick={() => setPicked(picked === p.id ? null : p.id)}
            />
          </g>
        ))}
        {sel && (
          <g transform={`translate(${Math.min(Math.max(x(sel.at), 70), W - 70)}, ${Math.max(y(sel.salinity) - 40, 4)})`}>
            <rect class="tip-bg" x={-64} y={0} width={128} height={32} rx={8} />
            <text class="tip-text" x={0} y={13} text-anchor="middle">
              {fixed(sel.salinity, 1)} {unit} · {fixed(sel.reading, 4)}
            </text>
            <text class="tip-sub" x={0} y={26} text-anchor="middle">
              {fmtFull.format(sel.at)} · {fixed(sel.temperature, 1)} °C
            </text>
          </g>
        )}
        <text x={PAD.l} y={H - 6}>
          {fmtAxis.format(t0)}
        </text>
        {pts.length > 1 && (
          <text x={W - PAD.r} y={H - 6} text-anchor="end">
            {fmtAxis.format(t1)}
          </text>
        )}
      </svg>
      <div class="chart-caption">
        <span>
          Цель {fixed(s.targetMin, 1)}–{fixed(s.targetMax, 1)} {unit}
        </span>
        <span>Касание — детали точки</span>
      </div>
    </div>
  );
}
