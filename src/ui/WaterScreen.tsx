/** Подмена воды и долив: сколько осмоса долить, сколько соли или рассола добавить. */
import { useState } from 'preact/hooks';
import { brineToAdd, fixed, freshWaterToAdd, parseDecimal, saltToAdd, waterChangeVolume } from '../calc';
import { measurements } from '../store/measurements';
import { settings, updateSettings } from '../store/settings';
import { NumInput } from './components';
import { result, tempC } from './state';
import { SAL_UNIT } from './strings';

function Item({ label, value, unit, digits = 1 }: { label: string; value: number; unit: string; digits?: number }) {
  if (!Number.isFinite(value)) return null;
  return (
    <div class="water-item">
      <span class="label">{label}</span>
      <span class="value">
        {fixed(value, digits)}
        <small>{unit}</small>
      </span>
    </div>
  );
}

export function WaterScreen() {
  const s = settings.value;
  const unit = SAL_UNIT[s.salinityUnit];
  const last = measurements.value[0];
  const initialCurrent = Number.isFinite(result.value.salinity) ? result.value.salinity : (last?.salinity ?? s.target);
  const [volumeText, setVolumeText] = useState(String(s.tankVolume));
  const [currentText, setCurrentText] = useState(fixed(initialCurrent, 1));
  const [targetText, setTargetText] = useState(fixed(s.target, 1));
  const [newText, setNewText] = useState('0');
  const [brineText, setBrineText] = useState('70');

  const volume = parseDecimal(volumeText);
  const current = parseDecimal(currentText);
  const target = parseDecimal(targetText);
  const newWater = parseDecimal(newText);
  const brine = parseDecimal(brineText);
  const t = tempC.value;
  const ok = volume !== null && current !== null && target !== null && volume > 0;

  const commitVolume = (text: string): void => {
    setVolumeText(text);
    const v = parseDecimal(text);
    if (v !== null && v > 0) updateSettings({ tankVolume: v });
  };

  const items: preact.JSX.Element[] = [];
  if (ok) {
    if (current > target) {
      items.push(
        <Item key="fresh" label="Долить осмоса (есть место)" value={freshWaterToAdd(volume, current, target, t)} unit="л" />,
        <Item key="change-down" label="Или подменить на осмос" value={waterChangeVolume(volume, current, target, t, 0)} unit="л" />,
      );
    } else if (current < target) {
      items.push(
        <Item key="salt" label="Добавить сухой соли" value={saltToAdd(volume, current, target, t)} unit="г" digits={0} />,
      );
      if (brine !== null) {
        items.push(
          <Item key="brine" label={`Или долить рассола ${fixed(brine, 0)} ${unit}`} value={brineToAdd(volume, current, target, t, brine)} unit="л" digits={2} />,
        );
      }
      if (newWater !== null && newWater > target) {
        items.push(
          <Item key="change-up" label={`Или подменить на воду ${fixed(newWater, 1)} ${unit}`} value={waterChangeVolume(volume, current, target, t, newWater)} unit="л" />,
        );
      }
    }
  }

  return (
    <main class="screen" aria-label="Подмена воды">
      <section class="card glass">
        <h2>Подмена и долив</h2>
        <div class="grid-2">
          <NumInput id="w-volume" label="Объём" unit="л" value={volumeText} onCommit={commitVolume} invalid={volume === null || volume <= 0} />
          <NumInput id="w-current" label="Сейчас" unit={unit} value={currentText} onCommit={setCurrentText} invalid={current === null} />
          <NumInput id="w-target" label="Цель" unit={unit} value={targetText} onCommit={setTargetText} invalid={target === null} />
          <NumInput id="w-new" label="Новая вода" unit={unit} value={newText} onCommit={setNewText} invalid={newWater === null} />
          <NumInput id="w-brine" label="Рассол" unit={unit} value={brineText} onCommit={setBrineText} invalid={brine === null} />
          <div class="input-row">
            <label for="w-temp">Температура</label>
            <div class="inline-unit">
              <input id="w-temp" class="input" type="text" readOnly value={fixed(t, 1)} aria-describedby="w-temp-hint" />
              <span>°C</span>
            </div>
          </div>
        </div>
        <p class="hint" id="w-temp-hint">
          Температура берётся с главного экрана. Расчёт — баланс массы соли с плотностями по EOS-80; масса сухой соли — нижняя
          оценка, у реальных смесей добавьте 3–5 %.
        </p>
      </section>
      <section class="card glass" aria-live="polite">
        <h2>Что сделать</h2>
        {!ok ? (
          <p class="empty">Введите объём, текущую и целевую солёность.</p>
        ) : current === target ? (
          <p class="empty">Солёность уже равна цели — ничего делать не нужно.</p>
        ) : (
          <div class="water-result">{items}</div>
        )}
      </section>
    </main>
  );
}
