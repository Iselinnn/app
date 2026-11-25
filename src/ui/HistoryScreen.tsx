/** История: фильтр по категориям, график, список замеров (удаление свайпом), экспорт и импорт CSV. */
import { useRef, useState } from 'preact/hooks';
import { SCALE_LABEL, fixed } from '../calc';
import { addCategory, categories, categoryName } from '../store/categories';
import { parseCsv, toCsv } from '../store/csv';
import {
  importMeasurements,
  measurements,
  measurementsError,
  removeMeasurement,
  restoreMeasurement,
  type Measurement,
} from '../store/measurements';
import { settings } from '../store/settings';
import { Chart } from './Chart';
import { tick } from './haptics';
import { IconImport, IconShare, IconTrash } from './icons';
import { SAL_UNIT } from './strings';
import { showToast } from './toast';

const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const OPEN_PX = 88;

function HistoryItem({ m }: { m: Measurement }) {
  const s = settings.value;
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; start: number; id: number } | null>(null);
  const inRange = m.salinity >= s.targetMin && m.salinity <= s.targetMax;
  const cat = categoryName(m.categoryId);

  const del = async (): Promise<void> => {
    tick();
    const removed = await removeMeasurement(m.id);
    if (removed) {
      showToast('Замер удалён', {
        label: 'Отменить',
        run: () => void restoreMeasurement(removed),
      });
    }
  };

  return (
    <li class={dx < 0 || dragging ? 'hist-item is-open' : 'hist-item'} data-testid="hist-item">
      <button type="button" class="hist-delete" aria-label="Удалить замер" onClick={() => void del()} tabIndex={dx < 0 ? 0 : -1}>
        <IconTrash />
        Удалить
      </button>
      <div
        class={dragging ? 'hist-row is-dragging' : 'hist-row'}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          drag.current = { x: e.clientX, start: dx, id: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d?.id !== e.pointerId) return;
          setDx(Math.max(-OPEN_PX - 20, Math.min(0, d.start + e.clientX - d.x)));
        }}
        onPointerUp={(e) => {
          drag.current = null;
          setDragging(false);
          setDx(dx < -OPEN_PX / 2 ? -OPEN_PX : 0);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
          setDx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') void del();
        }}
        tabIndex={0}
        aria-label={`${fixed(m.salinity, 1)} ${SAL_UNIT[s.salinityUnit]}, ${fmt.format(m.at)}${cat ? `, ${cat}` : ''}. Delete — удалить`}
      >
        <span class="hist-dot" style={{ background: inRange ? 'var(--ok)' : 'var(--warn)' }} aria-hidden="true" />
        <span class="hist-sal">
          {fixed(m.salinity, 1)}
          <small>{SAL_UNIT[s.salinityUnit]}</small>
        </span>
        <span class="hist-meta">
          <b>{fmt.format(m.at)}</b>
          {cat && <span class="tag">{cat}</span>}
          {m.scale !== 'density' ? ` · ${SCALE_LABEL[m.scale]}` : ''}
          {m.glassCorrection ? '' : ' · без поправки'}
          <br />
          {fixed(m.reading, 4)} · {fixed(m.temperature, 1)} °C
        </span>
      </div>
    </li>
  );
}

async function exportCsv(list: Measurement[]): Promise<void> {
  tick();
  const csv = toCsv(list, categoryName);
  const name = `salimeter-${new Date().toISOString().slice(0, 10)}.csv`;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    const file = new File([blob], name, { type: 'text/csv' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Замеры солёности' });
        return;
      } catch {
        /* отмена — падаем на скачивание */
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function HistoryScreen() {
  const all = measurements.value;
  const cats = categories.value;
  const [filter, setFilter] = useState<string>('all');
  const list = filter === 'all' ? all : filter === 'none' ? all.filter((m) => !m.categoryId) : all.filter((m) => m.categoryId === filter);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasUncategorized = all.some((m) => !m.categoryId);

  const onFile = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Файл больше 2 МБ');
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.error) {
      showToast(`Импорт не удался: ${parsed.error}`);
      return;
    }
    try {
      const rows: Measurement[] = [];
      for (const row of parsed.rows) {
        const categoryId = row.categoryName ? (await addCategory(row.categoryName)).id : null;
        rows.push({ ...row.measurement, categoryId });
      }
      const r = await importMeasurements(rows);
      const skipped = r.skipped + parsed.skipped;
      showToast(`Импортировано ${r.added}${skipped ? `, пропущено ${skipped}` : ''}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Импорт не удался');
    }
  };

  return (
    <main class="screen" aria-label="История">
      {cats.length > 0 && (
        <div class="filter-row" role="group" aria-label="Категория">
          <button type="button" class="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            все
          </button>
          {cats.map((c) => (
            <button key={c.id} type="button" class="chip" aria-pressed={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.name}
            </button>
          ))}
          {hasUncategorized && (
            <button type="button" class="chip chip-muted" aria-pressed={filter === 'none'} onClick={() => setFilter('none')}>
              без категории
            </button>
          )}
        </div>
      )}
      <section class="card">
        <h2>
          Солёность по времени
          {filter !== 'all' && <span class="count">{filter === 'none' ? 'без категории' : categoryName(filter)}</span>}
        </h2>
        <Chart data={list} />
      </section>
      <section class="card">
        <div class="row-between">
          <h2>
            Замеры<span class="count">{list.length}</span>
          </h2>
          <div class="btn-row">
            <button type="button" class="btn btn-ghost" onClick={() => void exportCsv(list)} disabled={list.length === 0}>
              <IconShare />
              CSV
            </button>
            <button type="button" class="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <IconImport />
              Импорт
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              class="visually-hidden"
              aria-label="Файл CSV для импорта"
              onChange={(e) => void onFile(e.currentTarget)}
            />
          </div>
        </div>
        {measurementsError.value && <p class="hint hint-danger">Хранилище недоступно: {measurementsError.value}</p>}
        {list.length === 0 ? (
          <p class="empty">Пока нет замеров. Сохраните первый на главном экране.</p>
        ) : (
          <ul class="hist">
            {list.map((m) => (
              <HistoryItem key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
