import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app';
import { expectedReading, fixed, measure } from '../../src/calc';
import { addCategory, categories } from '../../src/store/categories';
import { closeDb } from '../../src/store/db';
import { loadMeasurements, measurements } from '../../src/store/measurements';
import { DEFAULT_SETTINGS, flushSettings, loadSettings, settings } from '../../src/store/settings';
import { resetUiState, sheet, tempC } from '../../src/ui/state';
import { hideToast } from '../../src/ui/toast';

async function fresh(): Promise<void> {
  cleanup();
  hideToast();
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  measurements.value = [];
  categories.value = [];
  settings.value = { ...DEFAULT_SETTINGS, species: [...DEFAULT_SETTINGS.species], categoriesOffered: true };
  resetUiState();
  history.replaceState(null, '');
}

const text = (el: HTMLElement): string => el.textContent;
const key = (k: string): void => {
  fireEvent.click(screen.getByRole('button', { name: k === '.' ? 'Точка' : k === 'backspace' ? 'Стереть' : k }));
};
const field = (label: string): HTMLElement => screen.getByRole('spinbutton', { name: label });
/** Тап по полю открывает клавиатуру и начинает ввод заново. */
const tapField = (label: string): void => {
  const f = field(label);
  f.setPointerCapture = () => undefined;
  f.releasePointerCapture = () => undefined;
  fireEvent.pointerDown(f, { clientX: 10, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(f, { clientX: 10, pointerId: 1 });
};
const typeInto = (label: string, digits: string): void => {
  tapField(label);
  for (const ch of digits) key(ch);
};
const done = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'готово' }));
};
const resultText = (): string => text(screen.getByTestId('result'));
const nav = (name: string): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Разделы' })).getByRole('button', { name }));
};
const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить замер' }));
};

describe('Главный экран', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('клавиатура скрыта, открывается тапом по полю и считает мгновенно', async () => {
    render(<App />);
    expect(screen.queryByTestId('keypad')).toBeNull();
    expect(resultText()).toContain(fixed(measure(1.023, 25).salinity, 1));
    typeInto('показание', '10235');
    expect(screen.getByTestId('keypad')).toBeTruthy();
    expect(text(field('показание'))).toContain('1.0235');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.0235, 25).salinity, 1)));
    typeInto('температура', '245');
    expect(text(field('температура'))).toContain('24.5');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.0235, 24.5).salinity, 1)));
    expect(resultText()).toContain('ρ25 ' + fixed(measure(1.0235, 24.5).density25 / 1000, 4));
    expect(resultText()).toContain('± ' + fixed(measure(1.0235, 24.5).uncertainty, 1));
    done();
    expect(screen.queryByTestId('keypad')).toBeNull();
  });

  it('точка, стирание, запятая с физической клавиатуры, стрелки, ± на клавиатуре', () => {
    render(<App />);
    typeInto('показание', '1');
    key('.');
    key('.');
    key('0');
    key('2');
    expect(text(field('показание'))).toContain('1.02');
    key('backspace');
    expect(text(field('показание'))).toContain('1.0');
    fireEvent.keyDown(field('показание'), { key: 'ArrowUp' });
    expect(text(field('показание'))).toContain('1.0005');
    fireEvent.click(screen.getByRole('button', { name: 'Минус 0.0005' }));
    fireEvent.click(screen.getByRole('button', { name: 'Минус 0.0005' }));
    expect(text(field('показание'))).toContain('0.9995');
    fireEvent.keyDown(field('температура'), { key: '2' });
    fireEvent.keyDown(field('температура'), { key: ',' });
    fireEvent.keyDown(field('температура'), { key: '5' });
    expect(text(field('температура'))).toContain('2.5');
    fireEvent.keyDown(field('температура'), { key: 'Backspace' });
    expect(text(field('температура'))).toContain('2.');
    fireEvent.keyDown(field('температура'), { key: 'Enter' });
    expect(screen.queryByTestId('keypad')).toBeNull();
    fireEvent.keyDown(field('температура'), { key: 'Tab' });
  });

  it('свайп по полю меняет значение, чипы задают температуру', async () => {
    render(<App />);
    const f = field('показание');
    f.setPointerCapture = () => undefined;
    f.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(f, { clientX: 100, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(f, { clientX: 130, pointerId: 1 });
    fireEvent.pointerUp(f, { clientX: 130, pointerId: 1 });
    expect(text(f)).toContain('1.0240');
    expect(screen.queryByTestId('keypad')).toBeNull();
    fireEvent.pointerDown(f, { clientX: 100, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(f, { clientX: 100 - 14 * 3, pointerId: 2 });
    fireEvent.pointerCancel(f, { pointerId: 2 });
    expect(text(f)).toContain('1.0225');
    fireEvent.click(screen.getByRole('button', { name: '22 °C' }));
    expect(tempC.value).toBe(22);
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.0225, 22).salinity, 1)));
  });

  it('предупреждения о диапазоне', async () => {
    render(<App />);
    typeInto('температура', '150');
    await waitFor(() => expect(resultText()).toContain('зелёной зоны'));
    typeInto('температура', '450');
    await waitFor(() => expect(resultText()).toContain('вне диапазона расчёта'));
    typeInto('показание', '10450');
    await waitFor(() => expect(resultText()).toContain('вне шкалы'));
  });

  it('обратный режим: 32 ‰ при 13.1 °C → 1.0237; общая температура', async () => {
    render(<App />);
    typeInto('температура', '131');
    done();
    fireEvent.click(screen.getByRole('button', { name: 'обратный' }));
    expect(screen.getByTestId('reverse-result')).toBeTruthy();
    typeInto('солёность', '320');
    await waitFor(() => expect(text(screen.getByTestId('reverse-result'))).toContain('1.0237'));
    expect(text(screen.getByTestId('reverse-result'))).toContain(fixed(expectedReading(32, 13.1).densityAtT, 2));
    expect(text(screen.getByTestId('reverse-result'))).toContain('1021.08');
    fireEvent.click(within(screen.getByRole('group', { name: 'Режим' })).getByRole('button', { name: 'замер' }));
    expect(text(field('температура'))).toContain('13.1');
    expect(screen.queryByTestId('reverse-result')).toBeNull();
  });

  it('переключатель ‰ / SG / ρ меняет hero и шкалу', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'SG' }));
    expect(settings.value.heroUnit).toBe('sg');
    expect(resultText()).toContain('удельный вес');
    expect(resultText()).toContain(fixed(measure(1.023, 25).density25 / 997.047, 4));
    fireEvent.click(screen.getByRole('button', { name: 'ρ' }));
    expect(resultText()).toContain('плотность при 25');
    expect(resultText()).toContain('1.0230');
    expect(screen.getByRole('img', { name: /Текущее 1.0230/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '‰' }));
    expect(settings.value.heroUnit).toBe('permille');
  });

  it('сохранение без категорий, чип последнего показания, удаление с отменой', async () => {
    render(<App />);
    save();
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    await screen.findByText('Замер сохранён');
    expect(screen.getByRole('button', { name: 'Последнее показание 1.0230' })).toBeTruthy();
    nav('история');
    const items = await screen.findAllByTestId('hist-item');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain(fixed(measure(1.023, 25).salinity, 1));
    fireEvent.click(within(items[0]!).getByRole('button', { name: 'Удалить замер' }));
    await waitFor(() => expect(measurements.value).toHaveLength(0));
    fireEvent.click(await screen.findByRole('button', { name: 'Отменить' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    const rowEl = screen.getAllByTestId('hist-item')[0]!.querySelector<HTMLElement>('.hist-row')!;
    rowEl.setPointerCapture = () => undefined;
    rowEl.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(rowEl, { clientX: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(rowEl, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(rowEl, { clientX: 200, pointerId: 1 });
    await waitFor(() => expect(rowEl.style.transform).toBe('translateX(-88px)'));
    fireEvent.keyDown(rowEl, { key: 'Delete' });
    await waitFor(() => expect(measurements.value).toHaveLength(0));
    await loadMeasurements();
    expect(measurements.value).toHaveLength(0);
  });

  it('категории: лист при сохранении, тег в истории, фильтр, онбординг', async () => {
    render(<App />);
    const cat = await addCategory('Коллектор 6-17');
    save();
    const dialog = await screen.findByRole('dialog', { name: 'Куда сохранить замер' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Коллектор 6-17' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    expect(measurements.value[0]?.categoryId).toBe(cat.id);
    expect(settings.value.lastCategoryId).toBe(cat.id);
    expect(await screen.findByText(/Сохранено в «Коллектор 6-17»/)).toBeTruthy();
    // новая категория прямо из листа
    typeInto('показание', '10240');
    done();
    save();
    const d2 = await screen.findByRole('dialog', { name: 'Куда сохранить замер' });
    fireEvent.input(within(d2).getByLabelText('Название новой категории'), { target: { value: 'Дисплей' } });
    fireEvent.click(within(d2).getByRole('button', { name: 'Создать' }));
    await waitFor(() => expect(categories.value).toHaveLength(2));
    fireEvent.click(within(d2).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(measurements.value).toHaveLength(2));
    nav('история');
    expect(screen.getAllByTestId('hist-item')).toHaveLength(2);
    expect(screen.getAllByText('Коллектор 6-17').length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getByRole('group', { name: 'Категория' })).getByRole('button', { name: 'Дисплей' }));
    expect(screen.getAllByTestId('hist-item')).toHaveLength(1);
    fireEvent.click(within(screen.getByRole('group', { name: 'Категория' })).getByRole('button', { name: 'все' }));
    expect(screen.getAllByTestId('hist-item')).toHaveLength(2);
    // онбординг
    sheet.value = 'onboard';
    const ob = await screen.findByRole('dialog', { name: 'Категории замеров' });
    fireEvent.click(within(ob).getByRole('button', { name: /Карантин/ }));
    await waitFor(() => expect(categories.value).toHaveLength(3));
    fireEvent.click(within(ob).getByRole('button', { name: 'Готово' }));
    expect(settings.value.categoriesOffered).toBe(true);
    expect(sheet.value).toBeNull();
  });

  it('экспорт и импорт CSV с категориями', async () => {
    render(<App />);
    await addCategory('Коллектор 6-17');
    save();
    const dialog = await screen.findByRole('dialog', { name: 'Куда сохранить замер' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Коллектор 6-17' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    nav('история');
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:test';
    });
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const csvText = await (blob as unknown as Blob).text();
    expect(csvText).toContain('date,reading,temperature_c');
    expect(csvText).toContain(',Коллектор 6-17');
    click.mockRestore();

    const csv =
      'date,reading,temperature_c,scale,glass_correction,beta,note,category\n' +
      '2026-11-20T10:00:00Z,1.0240,26.0,density,true,2.5e-5,после подмены,Новый сампа\n' +
      '2026-11-21T10:00:00Z,abc,26.0,density,true,2.5e-5,,\n';
    const input = screen.getByLabelText('Файл CSV для импорта');
    Object.defineProperty(input, 'files', { value: [new File([csv], 'import.csv', { type: 'text/csv' })], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(measurements.value).toHaveLength(2));
    expect(categories.value.map((c) => c.name)).toContain('Новый сампа');
    expect(await screen.findByText(/Импортировано 1, пропущено 1/)).toBeTruthy();
    const bad = new File(['nope'], 'bad.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [bad], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByText(/Импорт не удался/)).toBeTruthy();
  });

  it('график: кривая, периоды, подсказка по точке', async () => {
    render(<App />);
    nav('история');
    expect(screen.getByText(/График появится/)).toBeTruthy();
    nav('замер');
    save();
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    typeInto('показание', '10240');
    done();
    save();
    await waitFor(() => expect(measurements.value).toHaveLength(2));
    nav('история');
    const svg = await screen.findByRole('img', { name: /Солёность по времени/ });
    expect(svg.querySelector('path.line')?.getAttribute('d')).toMatch(/^M.*C/);
    expect(svg.querySelector('path.area')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '7д' }));
    fireEvent.click(screen.getByRole('button', { name: 'всё' }));
    const hit = svg.querySelector<SVGElement>('.pt-hit')!;
    fireEvent.click(hit);
    expect(svg.querySelector('.tip-text')?.textContent).toContain('‰');
    fireEvent.click(hit);
    expect(svg.querySelector('.tip-text')).toBeNull();
  });
});

describe('Настройки', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('тип шкалы, поправка, β и цель влияют на результат и сохраняются', async () => {
    render(<App />);
    nav('настройки');
    fireEvent.click(screen.getByRole('button', { name: 'SG 25/25' }));
    expect(settings.value.scale).toBe('sg2525');
    fireEvent.click(screen.getByRole('switch', { name: 'Поправка на стекло' }));
    expect(settings.value.glassCorrection).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '1.0·10⁻⁵' }));
    expect(settings.value.beta).toBe(1e-5);
    fireEvent.click(screen.getByRole('button', { name: 'Своё' }));
    fireEvent.input(screen.getByLabelText('β, ×10⁻⁵ 1/°C'), { target: { value: '3' } });
    expect(settings.value.beta).toBeCloseTo(3e-5, 12);
    fireEvent.input(screen.getByLabelText('целевая'), { target: { value: '34,5' } });
    expect(settings.value.target).toBe(34.5);
    fireEvent.input(screen.getByLabelText('диапазон от'), { target: { value: 'abc' } });
    expect(settings.value.targetMin).toBe(34);
    fireEvent.click(screen.getByRole('switch', { name: 'Показывать S_A и проводимость' }));
    nav('замер');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.023, 25, { scale: 'sg2525', glassCorrection: false, beta: 3e-5 }).salinity, 1)));
    expect(resultText()).toContain('SG 25/25');
    expect(resultText()).toContain('цель 34.5');
    expect(resultText()).toContain('мС/см');
    await flushSettings();
    settings.value = { ...DEFAULT_SETTINGS };
    await loadSettings();
    expect(settings.value.scale).toBe('sg2525');
    expect(settings.value.glassCorrection).toBe(false);
    expect(settings.value.target).toBe(34.5);
  });

  it('единицы: PSU, кг/м³, °F', async () => {
    render(<App />);
    nav('настройки');
    fireEvent.click(screen.getByRole('button', { name: 'PSU' }));
    fireEvent.click(screen.getByRole('button', { name: 'кг/м³' }));
    fireEvent.click(screen.getByRole('button', { name: '°F' }));
    nav('замер');
    expect(resultText()).toContain('PSU');
    expect(resultText()).toContain('ρ25 1023.00');
    expect(text(field('температура'))).toContain('77.0');
    expect(screen.getByRole('button', { name: '72 °F' })).toBeTruthy();
    typeInto('температура', '68');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.023, 20).salinity, 1)));
  });

  it('тема, акцент, название, обитатели, отдача, сброс', async () => {
    render(<App />);
    nav('настройки');
    fireEvent.click(screen.getByRole('button', { name: 'Глубина' }));
    expect(document.documentElement.classList.contains('theme-depth')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Авто' }));
    expect(document.documentElement.classList.contains('theme-fog')).toBe(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'Акцент' })).getByRole('button', { name: 'Бирюза' }));
    expect(settings.value.accent).toBe('teal');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#157F86');
    fireEvent.input(screen.getByLabelText('Название приложения'), { target: { value: 'риф.лаб' } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('риф.лаб');
    fireEvent.click(screen.getByRole('button', { name: /^акула$/ }));
    expect(settings.value.species).not.toContain('shark');
    fireEvent.click(screen.getByRole('button', { name: /^акула$/ }));
    expect(settings.value.species).toContain('shark');
    fireEvent.input(screen.getByLabelText('Количество обитателей'), { target: { value: '5' } });
    expect(settings.value.creatureCount).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: '14 px' }));
    expect(settings.value.gridStep).toBe(14);
    fireEvent.click(screen.getByRole('button', { name: 'сланец' }));
    expect(settings.value.mosaicPalette).toBe('slate');
    fireEvent.click(screen.getByRole('switch', { name: 'Моно-подписи' }));
    expect(settings.value.monoLabels).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Наклон телефона' }));
    await waitFor(() => expect(settings.value.tilt).toBe(true));
    fireEvent.click(screen.getByRole('switch', { name: 'Звук нажатий' }));
    expect(settings.value.sound).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Тактильная отдача' }));
    expect(settings.value.haptics).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'По умолчанию' }));
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it('категории: создание, переименование, удаление снимает категорию с замеров', async () => {
    render(<App />);
    nav('настройки');
    fireEvent.input(screen.getByLabelText('Новая категория'), { target: { value: 'Коллектор' } });
    fireEvent.keyDown(screen.getByLabelText('Новая категория'), { key: 'Enter' });
    await waitFor(() => expect(categories.value).toHaveLength(1));
    const id = categories.value[0]!.id;
    measurements.value = [];
    nav('замер');
    save();
    const dialog = await screen.findByRole('dialog', { name: 'Куда сохранить замер' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Коллектор' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(measurements.value[0]?.categoryId).toBe(id));
    nav('настройки');
    const input = screen.getByLabelText('Категория Коллектор');
    fireEvent.input(input, { target: { value: 'Коллектор 6-17' } });
    fireEvent.blur(input);
    await waitFor(() => expect(categories.value[0]?.name).toBe('Коллектор 6-17'));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить категорию Коллектор 6-17' }));
    await waitFor(() => expect(categories.value).toHaveLength(0));
    expect(measurements.value[0]?.categoryId).toBeNull();
  });

  it('очистка истории с подтверждением', async () => {
    render(<App />);
    save();
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    nav('настройки');
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(measurements.value).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, удалить всё' }));
    await waitFor(() => expect(measurements.value).toHaveLength(0));
  });
});

describe('Подмена воды и навигация', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('считает долив, подмену и соль', () => {
    render(<App />);
    nav('долив');
    fireEvent.input(screen.getByLabelText('Объём'), { target: { value: '200' } });
    expect(settings.value.tankVolume).toBe(200);
    fireEvent.input(screen.getByLabelText('Сейчас'), { target: { value: '36' } });
    expect(screen.getByText('Долить осмоса (есть место)')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Сейчас'), { target: { value: '34' } });
    expect(screen.getByText('Добавить сухой соли')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Новая вода'), { target: { value: '40' } });
    expect(screen.getByText(/Или подменить на воду 40.0/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Сейчас'), { target: { value: '35' } });
    expect(screen.getByText(/уже равна цели/)).toBeTruthy();
  });

  it('кнопка «назад» возвращает на главный экран', async () => {
    render(<App />);
    nav('история');
    expect(screen.getByRole('main', { name: 'История' })).toBeTruthy();
    history.replaceState(null, '');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('main', { name: 'История' })).toBeNull());
    nav('настройки');
    nav('история');
    expect(screen.getByRole('main', { name: 'История' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /на главный экран/ }));
    await waitFor(() => expect(screen.queryByRole('main', { name: 'История' })).toBeNull());
  });
});
