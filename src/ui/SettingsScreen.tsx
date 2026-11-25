/** Настройки: расчёт, цель, единицы, вид, обитатели, отдача, категории, данные. */
import { useState } from 'preact/hooks';
import { BETA_BOROSILICATE, BETA_SODA_LIME, fixed, parseDecimal } from '../calc';
import { addCategory, categories, removeCategory, renameCategory } from '../store/categories';
import { clearMeasurements, detachCategory, measurements } from '../store/measurements';
import { ACCENTS, ALL_SPECIES, DEFAULT_SETTINGS, resetSettings, settings, updateSettings, type Settings } from '../store/settings';
import { NumInput, Segment, Setting, Slider, Swatches, Toggle } from './components';
import { tick } from './haptics';
import { IconTrash } from './icons';
import { PALETTE_NAME, SPECIES_NAME } from './strings';
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

function CategoryRow({ id, name }: { id: string; name: string }) {
  const [text, setText] = useState(name);
  const commit = async (): Promise<void> => {
    if (text.trim() === name) return;
    try {
      await renameCategory(id, text);
    } catch (e) {
      setText(name);
      showToast(e instanceof Error ? e.message : 'Не удалось переименовать');
    }
  };
  const remove = async (): Promise<void> => {
    tick();
    await detachCategory(id);
    await removeCategory(id);
    showToast(`Категория «${name}» удалена, замеры остались`);
  };
  return (
    <div class="cat-item">
      <input class="input" type="text" maxLength={32} value={text} aria-label={`Категория ${name}`} onInput={(e) => setText(e.currentTarget.value)} onBlur={() => void commit()} onKeyDown={(e) => { if (e.key === 'Enter') void commit(); }} />
      <button type="button" class="icon-btn btn-danger" aria-label={`Удалить категорию ${name}`} onClick={() => void remove()}>
        <IconTrash />
      </button>
    </div>
  );
}

function CategoriesSetting() {
  const list = categories.value;
  const [text, setText] = useState('');
  const create = async (): Promise<void> => {
    try {
      await addCategory(text);
      setText('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось создать категорию');
    }
  };
  return (
    <Setting title="Категории замеров" desc="Аквариум или система: при сохранении выбираете категорию, в истории — отдельный график">
      <div class="cat-list">
        {list.map((c) => (
          <CategoryRow key={c.id} id={c.id} name={c.name} />
        ))}
        <div class="cat-item">
          <input class="input" type="text" maxLength={32} placeholder="Новая категория" aria-label="Новая категория" value={text} onInput={(e) => setText(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} />
          <button type="button" class="btn btn-ghost" disabled={!text.trim()} onClick={() => void create()}>
            Создать
          </button>
        </div>
      </div>
    </Setting>
  );
}

export function SettingsScreen() {
  const s = settings.value;
  const set = (patch: Partial<Settings>): void => updateSettings(patch);
  const [confirmClear, setConfirmClear] = useState(false);
  const [betaText, setBetaText] = useState((s.beta * 1e5).toFixed(2));
  const [kind, setKind] = useState(betaKind(s.beta));

  const toggleTilt = async (on: boolean): Promise<void> => {
    if (on) {
      const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          const res = await DOE.requestPermission();
          if (res !== 'granted') {
            showToast('Доступ к наклону не разрешён');
            return;
          }
        } catch {
          showToast('Доступ к наклону не разрешён');
          return;
        }
      }
    }
    set({ tilt: on });
  };

  return (
    <main class="screen" aria-label="Настройки">
      <section class="card">
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

      <section class="card">
        <h2>Цель</h2>
        <div class="grid-2">
          <NumberSetting id="target" label="целевая" unit="‰" value={s.target} digits={1} min={0} max={60} onChange={(v) => set({ target: v })} />
          <div />
          <NumberSetting id="target-min" label="диапазон от" unit="‰" value={s.targetMin} digits={1} min={0} max={60} onChange={(v) => set({ targetMin: v })} />
          <NumberSetting id="target-max" label="до" unit="‰" value={s.targetMax} digits={1} min={0} max={60} onChange={(v) => set({ targetMax: v })} />
        </div>
        <Setting title="Цвет подсветки диапазона">
          <Swatches label="Цвет диапазона" options={TARGET_COLORS} value={s.targetColor} onChange={(v) => set({ targetColor: v })} />
        </Setting>
      </section>

      <section class="card">
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

      <section class="card">
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

      <section class="card">
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
          <Slider label="Количество обитателей" min={0} max={5} step={1} value={s.creatureCount} onChange={(v) => set({ creatureCount: v })} />
        </Setting>
        <Setting title="Скорость">
          <Slider label="Скорость" min={0.25} max={3} step={0.25} value={s.creatureSpeed} format={(v) => `${v}×`} onChange={(v) => set({ creatureSpeed: v })} />
        </Setting>
        <Setting title="Шаг сетки мозаики">
          <Segment
            wide
            label="Шаг сетки"
            value={String(s.gridStep)}
            onChange={(v) => set({ gridStep: Number(v) as Settings['gridStep'] })}
            options={[
              { value: '10', label: '10 px' },
              { value: '12', label: '12 px' },
              { value: '14', label: '14 px' },
            ]}
          />
        </Setting>
        <Setting title="Палитра мозаики">
          <Segment
            wide
            label="Палитра мозаики"
            value={s.mosaicPalette}
            onChange={(mosaicPalette) => set({ mosaicPalette })}
            options={[
              { value: 'slate', label: PALETTE_NAME.slate },
              { value: 'warm', label: PALETTE_NAME.warm },
              { value: 'mixed', label: PALETTE_NAME.mixed },
            ]}
          />
        </Setting>
        <Setting title="Моно-подписи" desc="Название вида рядом с обитателем" control={<Toggle label="Моно-подписи" checked={s.monoLabels} onChange={(v) => set({ monoLabels: v })} />} />
        <Setting title="Наклон телефона" desc="Течение чуть смещается при наклоне (нужно разрешение на датчики)" control={<Toggle label="Наклон телефона" checked={s.tilt} onChange={(v) => void toggleTilt(v)} />} />
      </section>

      <section class="card">
        <h2>Отдача</h2>
        <Setting title="Тактильная отдача" desc="Вибрация при нажатии клавиш (Android)" control={<Toggle label="Тактильная отдача" checked={s.haptics} onChange={(v) => set({ haptics: v })} />} />
        <Setting title="Звук нажатий" control={<Toggle label="Звук нажатий" checked={s.sound} onChange={(v) => set({ sound: v })} />} />
      </section>

      <section class="card">
        <h2>Данные</h2>
        <CategoriesSetting />
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
        <p class="version">солемер {__APP_VERSION__} · EOS-80 (UNESCO 1981) · PSS-78 · работает офлайн</p>
      </section>
    </main>
  );
}
