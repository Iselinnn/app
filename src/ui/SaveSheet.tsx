/** Листы: выбор категории при сохранении замера и предложение создать категории при первом запуске. */
import { useState } from 'preact/hooks';
import { addCategory, categories } from '../store/categories';
import { addMeasurement } from '../store/measurements';
import { settings, updateSettings } from '../store/settings';
import { tick } from './haptics';
import { reading, sheet, tempC } from './state';
import { CATEGORY_EXAMPLES } from './strings';
import { showToast } from './toast';

function NewCategoryRow({ onCreated }: { onCreated: (id: string) => void }) {
  const [text, setText] = useState('');
  const create = async (): Promise<void> => {
    try {
      const c = await addCategory(text);
      setText('');
      onCreated(c.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось создать категорию');
    }
  };
  return (
    <div class="sheet-row">
      <input
        class="input"
        type="text"
        maxLength={32}
        placeholder="Новая категория, например Коллектор 6-17"
        aria-label="Название новой категории"
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void create();
        }}
      />
      <button type="button" class="btn btn-ghost" disabled={!text.trim()} onClick={() => void create()}>
        Создать
      </button>
    </div>
  );
}

export function SaveSheet() {
  const s = settings.value;
  const list = categories.value;
  const initial = list.some((c) => c.id === s.lastCategoryId) ? s.lastCategoryId : null;
  const [picked, setPicked] = useState<string | null>(initial);
  const close = (): void => {
    sheet.value = null;
  };
  const save = async (): Promise<void> => {
    tick();
    try {
      await addMeasurement({
        reading: reading.value,
        temperature: tempC.value,
        scale: s.scale,
        glassCorrection: s.glassCorrection,
        beta: s.beta,
        categoryId: picked,
      });
      updateSettings({ lastCategoryId: picked });
      const name = list.find((c) => c.id === picked)?.name;
      showToast(name ? `Сохранено в «${name}»` : 'Замер сохранён');
      close();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  };
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet glass" role="dialog" aria-modal="true" aria-label="Куда сохранить замер">
        <h2>Куда сохранить</h2>
        <div class="chips" role="group" aria-label="Категория">
          <button type="button" class="chip" aria-pressed={picked === null} onClick={() => setPicked(null)}>
            без категории
          </button>
          {list.map((c) => (
            <button key={c.id} type="button" class="chip" aria-pressed={picked === c.id} onClick={() => setPicked(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <NewCategoryRow onCreated={setPicked} />
        <div class="btn-row">
          <button type="button" class="btn btn-primary" onClick={() => void save()}>
            Сохранить
          </button>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" onClick={close}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

/** Первый запуск: предложить завести категории под аквариумы или системы. */
export function OnboardSheet() {
  const list = categories.value;
  const done = (): void => {
    updateSettings({ categoriesOffered: true });
    sheet.value = null;
  };
  const addExample = async (name: string): Promise<void> => {
    tick();
    try {
      await addCategory(name);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось создать категорию');
    }
  };
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && done()}>
      <div class="sheet glass" role="dialog" aria-modal="true" aria-label="Категории замеров">
        <h2>Разложить замеры по категориям?</h2>
        <p>
          Категория — это аквариум или система: при сохранении выбираете её, а в истории смотрите отдельный график. Создать можно и
          позже, в настройках.
        </p>
        <div class="chips" role="group" aria-label="Примеры">
          {CATEGORY_EXAMPLES.map((name) => {
            const exists = list.some((c) => c.name.toLowerCase() === name.toLowerCase());
            return (
              <button key={name} type="button" class="chip" aria-pressed={exists} disabled={exists} onClick={() => void addExample(name)}>
                {exists ? '✓ ' : '+ '}
                {name}
              </button>
            );
          })}
        </div>
        <NewCategoryRow onCreated={() => undefined} />
        <div class="btn-row">
          <button type="button" class="btn btn-primary" onClick={done}>
            {list.length > 0 ? 'Готово' : 'Позже'}
          </button>
        </div>
      </div>
    </div>
  );
}
