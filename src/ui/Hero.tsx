/** Hero «01 / солёность»: огромная цифра, моно-строка с ρ25, погрешностью и целью; «02 / цель» — шкала. */
import { SCALE_LABEL, fixed, signed } from '../calc';
import { settings, updateSettings, type HeroUnit } from '../store/settings';
import { AnimatedNumber } from './AnimatedNumber';
import { tick } from './haptics';
import { corridor, effectiveTarget, heroDigits, mode, result, reverse, salinityToHero, tempC } from './state';
import { DENSITY_UNIT, SAL_UNIT, WARNING_TEXT } from './strings';

const HERO_TITLE: Record<HeroUnit, string> = {
  permille: 'солёность',
  sg: 'удельный вес 25/25',
  rho: 'плотность при 25 °C',
};

function heroUnitLabel(unit: HeroUnit): string {
  const s = settings.value;
  if (unit === 'permille') return SAL_UNIT[s.salinityUnit];
  if (unit === 'sg') return 'SG';
  return DENSITY_UNIT[s.densityUnit];
}

function Warnings({ list }: { list: readonly string[] }) {
  return (
    <>
      {list.map((w) => (
        <div key={w} class={w === 'outside-green-zone' ? 'hint hint-warn' : 'hint hint-danger'}>
          {WARNING_TEXT[w as keyof typeof WARNING_TEXT]}
        </div>
      ))}
    </>
  );
}

function MeasureHero() {
  const s = settings.value;
  const r = result.value;
  const unit = s.heroUnit;
  const salUnit = SAL_UNIT[s.salinityUnit];
  const value = salinityToHero(r.salinity, unit, s);
  const dev = r.salinity - s.target;
  const inRange = r.salinity >= s.targetMin && r.salinity <= s.targetMax;
  const rho25 = s.densityUnit === 'kgm3' ? fixed(r.density25, 2) : fixed(r.density25 / 1000, 4);
  return (
    <section class="hero" id="hero" aria-live="polite" data-testid="result">
      <div class="label">01 / {HERO_TITLE[unit]}</div>
      <div class="hero-num">
        <AnimatedNumber value={value} digits={heroDigits(unit, s)} />
        <span class="unit">{heroUnitLabel(unit)}</span>
      </div>
      <div class="hero-line">
        {unit === 'rho' ? (
          <span>
            S <b>{fixed(r.salinity, 1)}</b> {salUnit}
          </span>
        ) : (
          <span>
            ρ25 <b>{rho25}</b>
          </span>
        )}
        <span class="sep">·</span>
        <span>
          ± <b>{fixed(r.uncertainty, 1)}</b> {salUnit}
        </span>
        <span class="sep">·</span>
        <span>
          цель <b>{fixed(s.target, 1)}</b>{' '}
          <span class={inRange ? 'dev-ok' : 'dev-off'}>{signed(dev, 1)}</span>
        </span>
        <span class="sep">·</span>
        <span>{SCALE_LABEL[s.scale]}</span>
      </div>
      {s.showExtra && Number.isFinite(r.salinity) && (
        <div class="hint">
          S_A {fixed(r.absoluteSalinity, 1)} г/кг · {fixed(r.conductivity25, 1)} мС/см при 25 °C
        </div>
      )}
      <Warnings list={r.warnings} />
    </section>
  );
}

function ReverseHero() {
  const s = settings.value;
  const r = reverse.value;
  const c = corridor.value;
  const t = tempC.value;
  const unit = SAL_UNIT[s.salinityUnit];
  return (
    <section class="hero" id="hero" aria-live="polite" data-testid="reverse-result">
      <div class="label">01 / показание ареометра</div>
      <div class="hero-num is-reverse">
        <AnimatedNumber value={r.reading} digits={4} />
      </div>
      <div class="hero-line">
        <span>
          на шкале ≈ <b>{fixed(r.readingOnScale, 4)}</b>
        </span>
        <span class="sep">·</span>
        <span>
          для <b>{fixed(effectiveTarget.value, 1)}</b> {unit} при <b>{fixed(t, 1)}</b> °C
        </span>
      </div>
      <div class="hero-line">
        <span>
          ρ(t) <b>{fixed(r.densityAtT, 2)}</b> кг/м³
        </span>
        <span class="sep">·</span>
        <span>
          ρ25 <b>{fixed(r.density25, 2)}</b> кг/м³
        </span>
        <span class="sep">·</span>
        <span>
          коридор {fixed(s.targetMin, 1)}–{fixed(s.targetMax, 1)}: <b>{fixed(c.from, 4)}</b> … <b>{fixed(c.to, 4)}</b>
        </span>
      </div>
      <Warnings list={r.warnings} />
    </section>
  );
}

export function Hero() {
  return mode.value === 'measure' ? <MeasureHero /> : <ReverseHero />;
}

/** «02 / цель»: диапазон цели тонкой шкалой, риска текущего значения, переключатель ‰ / SG / ρ. */
export function TargetScale() {
  const s = settings.value;
  const m = mode.value;
  const unit = s.heroUnit;
  const digits = heroDigits(unit, s);
  const salNow = m === 'measure' ? result.value.salinity : effectiveTarget.value;
  const now = salinityToHero(salNow, unit, s);
  const lo = salinityToHero(s.targetMin, unit, s);
  const hi = salinityToHero(s.targetMax, unit, s);
  const goal = salinityToHero(s.target, unit, s);
  const span = Math.max(hi - lo, 1e-9);
  let dLo = lo - span * 0.75;
  let dHi = hi + span * 0.75;
  if (Number.isFinite(now)) {
    dLo = Math.min(dLo, now - span * 0.2);
    dHi = Math.max(dHi, now + span * 0.2);
  }
  const x = (v: number): string => `${(((v - dLo) / (dHi - dLo)) * 100).toFixed(2)}%`;
  const nowOk = Number.isFinite(now);
  const setUnit = (u: HeroUnit): void => {
    if (u !== unit) {
      tick();
      updateSettings({ heroUnit: u });
    }
  };
  return (
    <section class="target" aria-label="Цель">
      <div class="target-head">
        <div class="label">02 / цель {fixed(s.targetMin, 1)}–{fixed(s.targetMax, 1)} ‰</div>
        <div class="unit-toggle" role="group" aria-label="Единица результата">
          {(['permille', 'sg', 'rho'] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>
              {u === 'permille' ? '‰' : u === 'sg' ? 'SG' : 'ρ'}
            </button>
          ))}
        </div>
      </div>
      <svg class="scale" role="img" aria-label={`Текущее ${nowOk ? fixed(now, digits) : '—'}, цель ${fixed(goal, digits)}, диапазон ${fixed(lo, digits)}–${fixed(hi, digits)}`}>
        <line class="axis" x1="0%" x2="100%" y1="27" y2="27" />
        <line class="range" x1={x(lo)} x2={x(hi)} y1="27" y2="27" />
        <line class="range-tick" x1={x(lo)} x2={x(lo)} y1="22" y2="32" />
        <line class="range-tick" x1={x(hi)} x2={x(hi)} y1="22" y2="32" />
        <line class="range-tick" x1={x(goal)} x2={x(goal)} y1="24" y2="30" />
        <text x={x(lo)} y="43" text-anchor="middle">
          {fixed(lo, digits)}
        </text>
        <text x={x(hi)} y="43" text-anchor="middle">
          {fixed(hi, digits)}
        </text>
        {nowOk && (
          <>
            <line class="now" x1={x(now)} x2={x(now)} y1="19" y2="35" />
            <text class="now-label" x={x(now)} y="12" text-anchor="middle">
              {fixed(now, digits)}
            </text>
          </>
        )}
      </svg>
    </section>
  );
}
