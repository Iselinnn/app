/** Главный экран: замер (показание + температура → солёность) и обратный режим. */
import { useState } from 'preact/hooks';
import { SCALE_LABEL, fixed, signed } from '../calc';
import { addMeasurement } from '../store/measurements';
import { settings } from '../store/settings';
import { AnimatedNumber } from './AnimatedNumber';
import { Segment } from './components';
import { tick } from './haptics';
import { IconCheck } from './icons';
import { Keypad } from './Keypad';
import { NumberField } from './NumberField';
import { corridor, effectiveTarget, mode, reading, result, reverse, setMode, tempC } from './state';
import { DENSITY_UNIT, SAL_UNIT, WARNING_TEXT } from './strings';
import { showToast } from './toast';

function densityText(kgm3: number): { value: number; digits: number; unit: string } {
  const u = settings.value.densityUnit;
  return u === 'kgm3'
    ? { value: kgm3, digits: 2, unit: DENSITY_UNIT.kgm3 }
    : { value: kgm3 / 1000, digits: 4, unit: DENSITY_UNIT.gcm3 };
}

function MeasureResult() {
  const r = result.value;
  const s = settings.value;
  const unit = SAL_UNIT[s.salinityUnit];
  const d = densityText(r.density25);
  const dev = r.salinity - s.target;
  const inRange = r.salinity >= s.targetMin && r.salinity <= s.targetMax;
  return (
    <div class="result" aria-live="polite" data-testid="result">
      <div class="result-main">
        <AnimatedNumber value={r.salinity} digits={1} />
        <span class="result-unit">{unit}</span>
      </div>
      <div class="result-sub">
        Плотность при 25 °C: <AnimatedNumber value={d.value} digits={d.digits} /> {d.unit}
      </div>
      <div class="result-meta">
        <span>
          ± {fixed(r.uncertainty, 1)} {unit}
        </span>
        <span aria-hidden="true">·</span>
        <span>{SCALE_LABEL[s.scale]}</span>
        <span aria-hidden="true">·</span>
        <span class={inRange ? 'dev-ok' : 'dev-off'}>
          {signed(dev, 1)} {unit} к цели {fixed(s.target, 1)}
        </span>
      </div>
      {s.showExtra && Number.isFinite(r.salinity) && (
        <div class="result-extra">
          S<sub>A</sub> {fixed(r.absoluteSalinity, 1)} г/кг · {fixed(r.conductivity25, 1)} мС/см при 25 °C
        </div>
      )}
      {r.warnings.map((w) => (
        <div key={w} class={w === 'outside-green-zone' ? 'hint hint-warn' : 'hint hint-danger'}>
          {WARNING_TEXT[w]}
        </div>
      ))}
    </div>
  );
}

function ReverseResult() {
  const r = reverse.value;
  const s = settings.value;
  const unit = SAL_UNIT[s.salinityUnit];
  const c = corridor.value;
  const t = tempC.value;
  return (
    <div class="result" aria-live="polite" data-testid="reverse-result">
      <div class="result-main">
        <AnimatedNumber value={r.reading} digits={4} />
      </div>
      <div class="result-sub">на шкале ≈ {fixed(r.readingOnScale, 4)}</div>
      <div class="result-meta">
        <span>
          показание ареометра для {fixed(effectiveTarget.value, 1)} {unit} при {fixed(t, 1)} °C
        </span>
      </div>
      <div class="rows">
        <span>
          ρ при {fixed(t, 1)} °C: <b>{fixed(r.densityAtT, 2)}</b> кг/м³ = <b>{fixed(r.densityAtT / 1000, 5)}</b> г/см³
        </span>
        <span>
          ρ при 25 °C: <b>{fixed(r.density25, 2)}</b> кг/м³ = <b>{fixed(r.density25 / 1000, 5)}</b> г/см³
        </span>
        <span>
          Коридор {fixed(s.targetMin, 1)}–{fixed(s.targetMax, 1)} {unit}: <b>{fixed(c.from, 4)}</b> … <b>{fixed(c.to, 4)}</b>
        </span>
      </div>
      {r.warnings.map((w) => (
        <div key={w} class={w === 'outside-green-zone' ? 'hint hint-warn' : 'hint hint-danger'}>
          {WARNING_TEXT[w]}
        </div>
      ))}
    </div>
  );
}

export function MeasureScreen() {
  const m = mode.value;
  const s = settings.value;
  const [saved, setSaved] = useState(false);
  const tempUnit = s.tempUnit === 'f' ? '°F' : '°C';

  const save = async (): Promise<void> => {
    tick();
    try {
      await addMeasurement({
        reading: reading.value,
        temperature: tempC.value,
        scale: s.scale,
        glassCorrection: s.glassCorrection,
        beta: s.beta,
      });
      setSaved(true);
      showToast('Замер сохранён');
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  };

  return (
    <main class="screen-measure">
      <section class="main-card glass" aria-label={m === 'measure' ? 'Замер' : 'Обратный расчёт'}>
        <div class="seg-row">
          <Segment
            label="Режим"
            value={m}
            onChange={setMode}
            options={[
              { value: 'measure', label: 'Замер' },
              { value: 'reverse', label: 'Обратный' },
            ]}
          />
        </div>
        {m === 'measure' ? <MeasureResult /> : <ReverseResult />}
        <div class="fields">
          {m === 'measure' ? (
            <NumberField id="reading" label="Показание" unit="" />
          ) : (
            <NumberField id="target" label="Солёность" unit={SAL_UNIT[s.salinityUnit]} />
          )}
          <NumberField id="temp" label="Температура" unit={tempUnit} />
        </div>
        <Keypad />
        {m === 'measure' && (
          <button
            type="button"
            class={saved ? 'btn btn-primary is-done' : 'btn btn-primary'}
            onClick={() => void save()}
            disabled={!Number.isFinite(result.value.salinity)}
          >
            {saved ? <IconCheck /> : null}
            {saved ? 'Сохранено' : 'Сохранить замер'}
          </button>
        )}
      </section>
    </main>
  );
}
