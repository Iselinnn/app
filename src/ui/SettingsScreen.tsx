/** Настройки: расчёт, цель, единицы, вид, обитатели, отдача, данные. */
import { useState } from 'preact/hooks';
import { BETA_BOROSILICATE, BETA_SODA_LIME, fixed, parseDecimal } from '../calc';
import { clearMeasurements, measurements } from '../store/measurements';
import { ACCENTS, ALL_SPECIES, DEFAULT_SETTINGS, resetSettings, settings, updateSettings, type Settings } from '../store/settings';
import { NumInput, Segment, Setting, Slider, Swatches, Toggle } from './components';
import { tick } from './haptics';
import { SPECIES_NAME } from './strings';
import { showToast } from './toast';

const TARGET_COLORS = [
  { value: '#157F86', color: '#157F86', name: 'Бирюза' },
  { value: '#5E8A1F', color: '#5E8A1F', name: 'Лайм' },
  { value: '#8B1E2D', color: '#8B1E2D', name: 'Винный' },
  { value: '#D9573B', color: '#D9573B', name: 'Коралл' },
  { value: '#3F5BA9', color: '#3F5BA9', name: 'Синий' },
  { value: '#6B6B6B', color: '#6B6B6B', name: 'Серый' },
];

function betaKind(beta: number): 'soda' | 'boro' | 'custom' {
  if (Math.abs(beta - BETA_SODA_LIME) < 1e-12) return 'soda';
  if (Math.abs(beta - BETA_BOROSILICATE) < 1e-12) return 'boro';
  return 'custom';
}

function NumberSetting({
  id,
  label,
  unit,
  value,
  digits,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: number;
  digits: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(fixed(value, digits));
  const parsed = parseDecimal(text);
  const valid = parsed !== null && parsed >= min && parsed <= max;
  return (
    <NumInput
      id={id}
      label={label}
      unit={unit}
      value={text}
      invalid={!valid}
      onCommit={(t) => {
        setText(t);
        const n = parseDecimal(t);
        if (n !== null && n >= min && n <= max) onChange(n);
      }}
    />
  );
}

export function SettingsScreen() {
  const s = settings.value;
  const set = (patch: Partial<Settings>): void => updateSettings(patch);
  const [confirmClear, setConfirmClear] = useState(false);
  const [betaText, setBetaText] = useState((s.beta * 1e5).toFixed(2));
  const [kind, setKind] = useState(betaKind(s.beta));

  return (
    <main class="screen" aria-label="Настройки">
      <section class="card glass">
        <h2>Расчёт</h2>
        <Setting title="Тип шкалы ареометра" desc="Aqua Medic Salimeter размечен в плотности, г/см³">
          <Segment
            wide
            label="Тип шкалы"
            value={s.scale}
            onChange={(scale) => set({ scale })}
            options={[
              { value: 'density', label: 'г/см³' },
              { value: 'sg2525', label: 'SG 25/25' },
              { value: 'sg254', label: 'SG 25/4' },
            ]}
          />
        </Setting>
        <Setting
          title="Поправка на стекло"
          desc="Выкл — расчёт как на wpcalc.com, для сверки с коллегами"
          control={<Toggle label="Поправка на стекло" checked={s.glassCorrection} onChange={(v) => set({ glassCorrection: v })} />}
        />
        <Setting title="β стекла, 1/°C" desc="Объёмный коэффициент расширения ареометра">
          <Segment
            wide
            label="β стекла"
            value={kind}
            onChange={(k) => {
              setKind(k);
              if (k === 'soda') set({ beta: BETA_SODA_LIME });
              else if (k === 'boro') set({ beta: BETA_BOROSILICATE });
              else {
                const n = parseDecimal(betaText);
                if (n !== null && n > 0 && n <= 100) set({ beta: n * 1e-5 });
              }
            }}
            options={[
              { value: 'soda', label: '2.5·10⁻⁵' },
              { value: 'boro', label: '1.0·10⁻⁵' },
              { value: 'custom', label: 'Своё' },
            ]}
          />
          {kind === 'custom' && (
            <NumInput
              id="beta-custom"
              label="β, ×10⁻⁵ 1/°C"
              value={betaText}
              invalid={parseDecimal(betaText) === null}
              onCommit={(t) => {
                setBetaText(t);
                const n = parseDecimal(t);
                if (n !== null && n > 0 && n <= 100) set({ beta: n * 1e-5 });
              }}
            />
          )}
        </Setting>
        <Setting
          title="Абсолютная солёность и проводимость"
          desc="S_A по TEOS-10 и мС/см при 25 °C — для сверки с кондуктометром"
          control={<Toggle label="Показывать S_A и проводимость" checked={s.showExtra} onChange={(v) => set({ showExtra: v })} />}
        />
      </section>

      <section class="card glass">
        <h2>Цель</h2>
        <div class="grid-2">
          <NumberSetting id="target" label="Целевая" unit="‰" value={s.target} digits={1} min={0} max={60} onChange={(v) => set({ target: v })} />
          <div />
          <NumberSetting id="target-min" label="Диапазон от" unit="‰" value={s.targetMin} digits={1} min={0} max={60} onChange={(v) => set({ targetMin: v })} />
          <NumberSetting id="target-max" label="до" unit="‰" value={s.targetMax} digits={1} min={0} max={60} onChange={(v) => set({ targetMax: v })} />
        </div>
        <Setting title="Цвет подсветки диапазона">
          <Swatches label="Цвет диапазона" options={TARGET_COLORS} value={s.targetColor} onChange={(v) => set({ targetColor: v })} />
        </Setting>
      </section>

      <section class="card glass">
        <h2>Единицы</h2>
        <Setting title="Солёность">
          <Segment
            wide
            label="Единица солёности"
            value={s.salinityUnit}
            onChange={(salinityUnit) => set({ salinityUnit })}
            options={[
              { value: 'permille', label: '‰' },
              { value: 'psu', label: 'PSU' },
              { value: 'ppt', label: 'ppt' },
            ]}
          />
        </Setting>
        <Setting title="Плотность">
          <Segment
            wide
            label="Единица плотности"
            value={s.densityUnit}
            onChange={(densityUnit) => set({ densityUnit })}
            options={[
              { value: 'gcm3', label: 'г/см³' },
              { value: 'kgm3', label: 'кг/м³' },
            ]}
          />
        </Setting>
        <Setting title="Температура">
          <Segment
            wide
            label="Единица температуры"
            value={s.tempUnit}
            onChange={(tempUnit) => set({ tempUnit })}
            options={[
              { value: 'c', label: '°C' },
              { value: 'f', label: '°F' },
            ]}
          />
        </Setting>
      </section>

      <section class="card glass">
        <h2>Вид</h2>
        <Setting title="Тема">
          <Segment
            wide
            label="Тема"
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'fog', label: 'Туман' },
              { value: 'depth', label: 'Глубина' },
              { value: 'auto', label: 'Авто' },
            ]}
          />
        </Setting>
        <Setting title="Акцентный цвет">
          <Swatches
            label="Акцент"
            value={s.accent}
            onChange={(v) => set({ accent: v })}
            options={[
              { value: 'wine', color: ACCENTS.wine, name: 'Винный' },
              { value: 'coral', color: ACCENTS.coral, name: 'Коралловый' },
              { value: 'teal', color: ACCENTS.teal, name: 'Бирюза' },
              { value: 'lime', color: ACCENTS.lime, name: 'Лайм' },
            ]}
            custom={{
              color: s.accentCustom,
              active: s.accent === 'custom',
              onChange: (hex) => set({ accent: 'custom', accentCustom: hex.toUpperCase() }),
            }}
          />
        </Setting>
        <Setting title="Название в шапке" desc="Точка в названии станет акцентом">
          <input
            class="input"
            type="text"
            maxLength={24}
            value={s.appName}
            aria-label="Название приложения"
            onInput={(e) => {
              const v = e.currentTarget.value;
              if (v.trim()) set({ appName: v });
            }}
          />
        </Setting>
      </section>

      <section class="card glass">
        <h2>Обитатели</h2>
        <Setting title="Кто плавает">
          <div class="chips" role="group" aria-label="Виды">
            {ALL_SPECIES.map((sp) => {
              const on = s.species.includes(sp);
              return (
                <button
                  key={sp}
                  type="button"
                  class="chip"
                  aria-pressed={on}
                  onClick={() => {
                    tick();
                    set({ species: on ? s.species.filter((x) => x !== sp) : [...s.species, sp] });
                  }}
                >
                  {SPECIES_NAME[sp]}
                </button>
              );
            })}
          </div>
        </Setting>
        <Setting title="Количество">
          <Slider label="Количество обитателей" min={0} max={6} step={1} value={s.creatureCount} onChange={(v) => set({ creatureCount: v })} />
        </Setting>
        <Setting title="Скорость">
          <Slider label="Скорость" min={0.25} max={3} step={0.25} value={s.creatureSpeed} format={(v) => `${v}×`} onChange={(v) => set({ creatureSpeed: v })} />
        </Setting>
        <Setting title="Размер пикселя">
          <Slider label="Размер пикселя" min={4} max={10} step={1} value={s.pixelSize} format={(v) => `${v} px`} onChange={(v) => set({ pixelSize: v })} />
        </Setting>
        <Setting title="Цвет пикселей">
          <Segment
            wide
            label="Цвет пикселей"
            value={s.pixelPalette}
            onChange={(pixelPalette) => set({ pixelPalette })}
            options={[
              { value: 'mono', label: 'Монохром' },
              { value: 'warm', label: 'Тёплый' },
              { value: 'natural', label: 'Натуральные' },
            ]}
          />
        </Setting>
      </section>

      <section class="card glass">
        <h2>Отдача</h2>
        <Setting title="Тактильная отдача" desc="Вибрация при нажатии клавиш (Android)" control={<Toggle label="Тактильная отдача" checked={s.haptics} onChange={(v) => set({ haptics: v })} />} />
        <Setting title="Звук нажатий" control={<Toggle label="Звук нажатий" checked={s.sound} onChange={(v) => set({ sound: v })} />} />
      </section>

      <section class="card glass">
        <h2>Данные</h2>
        <Setting title="История замеров" desc={`${measurements.value.length} записей в IndexedDB на этом устройстве`}>
          <div class="btn-row">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  class="btn btn-ghost btn-danger"
                  onClick={() => {
                    void clearMeasurements().then(() => {
                      setConfirmClear(false);
                      showToast('История очищена');
                    });
                  }}
                >
                  Да, удалить всё
                </button>
                <button type="button" class="btn btn-ghost" onClick={() => setConfirmClear(false)}>
                  Отмена
                </button>
              </>
            ) : (
              <button type="button" class="btn btn-ghost btn-danger" onClick={() => setConfirmClear(true)} disabled={measurements.value.length === 0}>
                Очистить историю
              </button>
            )}
          </div>
        </Setting>
        <Setting title="Сбросить настройки">
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => {
                tick();
                resetSettings();
                setBetaText((DEFAULT_SETTINGS.beta * 1e5).toFixed(2));
                setKind('soda');
                showToast('Настройки сброшены');
              }}
            >
              По умолчанию
            </button>
          </div>
        </Setting>
        <p class="version">Солемер {__APP_VERSION__} · EOS-80 (UNESCO 1981) · PSS-78 · работает офлайн</p>
      </section>
    </main>
  );
}
