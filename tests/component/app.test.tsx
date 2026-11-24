import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app';
import { expectedReading, fixed, measure } from '../../src/calc';
import { closeDb } from '../../src/store/db';
import { loadMeasurements, measurements } from '../../src/store/measurements';
import { DEFAULT_SETTINGS, flushSettings, loadSettings, settings } from '../../src/store/settings';
import { resetUiState } from '../../src/ui/state';
import { hideToast } from '../../src/ui/toast';

async function fresh(): Promise<void> {
  cleanup();
  hideToast();
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  measurements.value = [];
  settings.value = { ...DEFAULT_SETTINGS, species: [...DEFAULT_SETTINGS.species] };
  resetUiState();
  history.replaceState(null, '');
}

const key = (k: string): void => {
  fireEvent.click(screen.getByRole('button', { name: k === '.' ? 'Точка' : k === 'backspace' ? 'Стереть' : k }));
};
const field = (label: string): HTMLElement => screen.getByRole('spinbutton', { name: label });
const typeInto = (label: string, text: string): void => {
  fireEvent.focus(field(label));
  for (const ch of text) key(ch);
};
const text = (el: HTMLElement): string => el.textContent;
const resultText = (): string => text(screen.getByTestId('result'));
const nav = (name: string): void => {
  fireEvent.click(screen.getByRole('button', { name }));
};

describe('Главный экран', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('считает мгновенно при вводе показания и температуры', async () => {
    render(<App />);
    expect(resultText()).toContain(fixed(measure(1.023, 25).salinity, 1));
    typeInto('Показание', '10235');
    expect(text(field('Показание'))).toContain('1.0235');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.0235, 25).salinity, 1)));
    typeInto('Температура', '245');
    expect(text(field('Температура'))).toContain('24.5');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.0235, 24.5).salinity, 1)));
    expect(resultText()).toContain('Плотность при 25 °C: ' + fixed(measure(1.0235, 24.5).density25 / 1000, 4));
    expect(resultText()).toContain('± ' + fixed(measure(1.0235, 24.5).uncertainty, 1));
  });

  it('точка, стирание, запятая с клавиатуры, стрелки', () => {
    render(<App />);
    typeInto('Показание', '1');
    key('.');
    key('.');
    key('0');
    key('2');
    expect(text(field('Показание'))).toContain('1.02');
    key('backspace');
    expect(text(field('Показание'))).toContain('1.0');
    fireEvent.keyDown(field('Показание'), { key: 'ArrowUp' });
    expect(text(field('Показание'))).toContain('1.0005');
    fireEvent.keyDown(field('Показание'), { key: 'ArrowDown' });
    fireEvent.keyDown(field('Показание'), { key: 'ArrowDown' });
    expect(text(field('Показание'))).toContain('0.9995');
    fireEvent.keyDown(field('Температура'), { key: '2' });
    fireEvent.keyDown(field('Температура'), { key: ',' });
    fireEvent.keyDown(field('Температура'), { key: '5' });
    expect(text(field('Температура'))).toContain('2.5');
    fireEvent.keyDown(field('Температура'), { key: 'Backspace' });
    expect(text(field('Температура'))).toContain('2.');
    fireEvent.keyDown(field('Температура'), { key: 'Tab' });
  });

  it('степперы и свайп меняют значение', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Температура: плюс 0.1' }));
    expect(text(field('Температура'))).toContain('25.1');
    fireEvent.click(screen.getByRole('button', { name: 'Показание: минус 0.0005' }));
    expect(text(field('Показание'))).toContain('1.0225');
    const f = field('Показание');
    f.setPointerCapture = () => undefined;
    f.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(f, { clientX: 100, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(f, { clientX: 130, pointerId: 1 });
    fireEvent.pointerUp(f, { clientX: 130, pointerId: 1 });
    expect(text(field('Показание'))).toContain('1.0235');
    fireEvent.pointerDown(f, { clientX: 100, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(f, { clientX: 100 - 14 * 3, pointerId: 2 });
    fireEvent.pointerCancel(f, { pointerId: 2 });
    expect(text(field('Показание'))).toContain('1.0220');
  });

  it('предупреждения о диапазоне', async () => {
    render(<App />);
    typeInto('Температура', '150');
    await waitFor(() => expect(resultText()).toContain('зелёной зоны'));
    typeInto('Температура', '450');
    await waitFor(() => expect(resultText()).toContain('вне диапазона расчёта'));
    typeInto('Показание', '10450');
    await waitFor(() => expect(resultText()).toContain('вне шкалы'));
  });

  it('обратный режим: 32 ‰ при 13.1 °C → 1.0237; общая температура', async () => {
    render(<App />);
    typeInto('Температура', '131');
    nav('Обратный');
    expect(screen.getByTestId('reverse-result')).toBeTruthy();
    typeInto('Солёность', '320');
    await waitFor(() => expect(screen.getByTestId('reverse-result').textContent).toContain('1.0237'));
    expect(screen.getByTestId('reverse-result').textContent).toContain(fixed(expectedReading(32, 13.1).densityAtT, 2));
    expect(screen.getByTestId('reverse-result').textContent).toContain('1021.08');
    nav('Замер');
    expect(text(field('Температура'))).toContain('13.1');
    expect(screen.queryByTestId('reverse-result')).toBeNull();
  });

  it('сохранение замера попадает в историю, удаление с отменой', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить замер' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    await screen.findByText('Замер сохранён');
    nav('История');
    const items = await screen.findAllByTestId('hist-item');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent).toContain(fixed(measure(1.023, 25).salinity, 1));
    const row = within(items[0]!).getByRole('button', { name: 'Удалить замер' });
    fireEvent.click(row);
    await waitFor(() => expect(measurements.value).toHaveLength(0));
    expect(screen.queryAllByTestId('hist-item')).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Отменить' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    expect(await screen.findAllByTestId('hist-item')).toHaveLength(1);
    // свайп по строке открывает кнопку удаления
    const rowEl = screen.getAllByTestId('hist-item')[0]!.querySelector<HTMLElement>('.hist-row')!;
    rowEl.setPointerCapture = () => undefined;
    rowEl.releasePointerCapture = () => undefined;
    fireEvent.pointerDown(rowEl, { clientX: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(rowEl, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(rowEl, { clientX: 200, pointerId: 1 });
    await waitFor(() => expect(rowEl.style.transform).toBe('translateX(-88px)'));
    fireEvent.keyDown(rowEl, { key: 'Delete' });
    await waitFor(() => expect(measurements.value).toHaveLength(0));
    // перезапуск: данные в IndexedDB
    await loadMeasurements();
    expect(measurements.value).toHaveLength(0);
  });

  it('переживает перезапуск: замер остаётся в IndexedDB', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить замер' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    measurements.value = [];
    await loadMeasurements();
    expect(measurements.value).toHaveLength(1);
  });

  it('экспорт и импорт CSV', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить замер' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    nav('История');
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:test';
    });
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(click).toHaveBeenCalled();
    const text = await (blob as unknown as Blob).text();
    expect(text).toContain('date,reading,temperature_c');
    expect(text).toContain('1.0230,25.0,density,true');
    click.mockRestore();

    const csv =
      'date,reading,temperature_c,scale,glass_correction,beta,note\n' +
      '2026-11-20T10:00:00Z,1.0240,26.0,density,true,2.5e-5,после подмены\n' +
      '2026-11-21T10:00:00Z,abc,26.0,density,true,2.5e-5,\n';
    const input = screen.getByLabelText('Файл CSV для импорта');
    const file = new File([csv], 'import.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => expect(measurements.value).toHaveLength(2));
    expect(await screen.findByText(/Импортировано 1, пропущено 1/)).toBeTruthy();
    expect(screen.getAllByTestId('hist-item')).toHaveLength(2);

    const bad = new File(['nope'], 'bad.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [bad], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByText(/Импорт не удался/)).toBeTruthy();
  });

  it('график строится по замерам', async () => {
    render(<App />);
    nav('История');
    expect(screen.getByText(/График появится/)).toBeTruthy();
    nav('Закрыть');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить замер' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    nav('История');
    const svg = await screen.findByRole('img', { name: /Солёность по времени/ });
    expect(svg.querySelector('path.line')?.getAttribute('d')).toMatch(/^M/);
    const hit = svg.querySelector<SVGElement>('.pt-hit')!;
    fireEvent.click(hit);
    expect(svg.querySelector('.tip-text')?.textContent).toContain(fixed(measure(1.023, 25).salinity, 1));
    fireEvent.click(hit);
    expect(svg.querySelector('.tip-text')).toBeNull();
  });
});

describe('Настройки', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('тип шкалы, поправка, β и цель влияют на результат и сохраняются', async () => {
    render(<App />);
    nav('Настройки');
    fireEvent.click(screen.getByRole('button', { name: 'SG 25/25' }));
    expect(settings.value.scale).toBe('sg2525');
    fireEvent.click(screen.getByRole('switch', { name: 'Поправка на стекло' }));
    expect(settings.value.glassCorrection).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '1.0·10⁻⁵' }));
    expect(settings.value.beta).toBe(1e-5);
    fireEvent.click(screen.getByRole('button', { name: 'Своё' }));
    fireEvent.input(screen.getByLabelText('β, ×10⁻⁵ 1/°C'), { target: { value: '3' } });
    expect(settings.value.beta).toBeCloseTo(3e-5, 12);
    fireEvent.input(screen.getByLabelText('Целевая'), { target: { value: '34,5' } });
    expect(settings.value.target).toBe(34.5);
    fireEvent.input(screen.getByLabelText('Диапазон от'), { target: { value: 'abc' } });
    expect(settings.value.targetMin).toBe(34);
    fireEvent.click(screen.getByRole('switch', { name: 'Показывать S_A и проводимость' }));
    nav('Закрыть');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.023, 25, { scale: 'sg2525', glassCorrection: false, beta: 3e-5 }).salinity, 1)));
    expect(resultText()).toContain('SG 25/25');
    expect(resultText()).toContain('к цели 34.5');
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
    nav('Настройки');
    fireEvent.click(screen.getByRole('button', { name: 'PSU' }));
    fireEvent.click(screen.getByRole('button', { name: 'кг/м³' }));
    fireEvent.click(screen.getByRole('button', { name: '°F' }));
    nav('Закрыть');
    expect(resultText()).toContain('PSU');
    expect(resultText()).toContain('1023.00 кг/м³');
    expect(text(field('Температура'))).toContain('77.0');
    fireEvent.click(screen.getByRole('button', { name: 'Температура: плюс 0.1' }));
    expect(text(field('Температура'))).toContain('77.1');
    typeInto('Температура', '68');
    await waitFor(() => expect(resultText()).toContain(fixed(measure(1.023, 20).salinity, 1)));
  });

  it('тема, акцент, название, обитатели, отдача', async () => {
    render(<App />);
    nav('Настройки');
    fireEvent.click(screen.getByRole('button', { name: 'Глубина' }));
    expect(document.documentElement.classList.contains('theme-depth')).toBe(true);
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? '#0B0F14').toBe('#0B0F14');
    fireEvent.click(screen.getByRole('button', { name: 'Авто' }));
    expect(document.documentElement.classList.contains('theme-fog')).toBe(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'Акцент' })).getByRole('button', { name: 'Бирюза' }));
    expect(settings.value.accent).toBe('teal');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#157F86');
    fireEvent.input(screen.getByLabelText('Название приложения'), { target: { value: 'риф.лаб' } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('риф.лаб');
    fireEvent.click(screen.getByRole('button', { name: /^Акула$/ }));
    expect(settings.value.species).not.toContain('shark');
    fireEvent.click(screen.getByRole('button', { name: /^Акула$/ }));
    expect(settings.value.species).toContain('shark');
    fireEvent.input(screen.getByLabelText('Количество обитателей'), { target: { value: '5' } });
    expect(settings.value.creatureCount).toBe(5);
    fireEvent.input(screen.getByLabelText('Размер пикселя'), { target: { value: '8' } });
    expect(settings.value.pixelSize).toBe(8);
    fireEvent.click(screen.getByRole('button', { name: 'Натуральные' }));
    expect(settings.value.pixelPalette).toBe('natural');
    fireEvent.click(screen.getByRole('switch', { name: 'Звук нажатий' }));
    expect(settings.value.sound).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Тактильная отдача' }));
    expect(settings.value.haptics).toBe(false);
    fireEvent.click(within(screen.getByRole('group', { name: 'Акцент' })).getByRole('button', { name: 'Лайм' }));
    fireEvent.click(screen.getByRole('button', { name: 'По умолчанию' }));
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
    await flushSettings();
    settings.value = { ...DEFAULT_SETTINGS, theme: 'depth' };
    await loadSettings();
    expect(settings.value.theme).toBe('fog');
  });

  it('очистка истории с подтверждением', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить замер' }));
    await waitFor(() => expect(measurements.value).toHaveLength(1));
    nav('Настройки');
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(measurements.value).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить историю' }));
    fireEvent.click(screen.getByRole('button', { name: 'Да, удалить всё' }));
    await waitFor(() => expect(measurements.value).toHaveLength(0));
  });
});

describe('Подмена воды', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('считает долив, подмену и соль', () => {
    render(<App />);
    nav('Подмена воды');
    fireEvent.input(screen.getByLabelText('Объём'), { target: { value: '200' } });
    expect(settings.value.tankVolume).toBe(200);
    fireEvent.input(screen.getByLabelText('Сейчас'), { target: { value: '36' } });
    expect(screen.getByText('Долить осмоса (есть место)')).toBeTruthy();
    expect(screen.getByText('Или подменить на осмос')).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Сейчас'), { target: { value: '34' } });
    expect(screen.getByText('Добавить сухой соли')).toBeTruthy();
    expect(screen.getByText(/Или долить рассола 70/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Новая вода'), { target: { value: '40' } });
    expect(screen.getByText(/Или подменить на воду 40.0/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Сейчас'), { target: { value: '35' } });
    expect(screen.getByText(/уже равна цели/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Объём'), { target: { value: 'x' } });
    expect(screen.getByText(/Введите объём/)).toBeTruthy();
  });
});

describe('Навигация', () => {
  beforeEach(fresh);
  afterEach(cleanup);

  it('кнопка «назад» возвращает на главный экран', async () => {
    render(<App />);
    nav('История');
    expect(screen.getByRole('main', { name: 'История' })).toBeTruthy();
    history.replaceState(null, '');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.queryByRole('main', { name: 'История' })).toBeNull());
    nav('Настройки');
    nav('Закрыть');
    await waitFor(() => expect(screen.queryByRole('main', { name: 'Настройки' })).toBeNull());
    nav('История');
    expect(screen.getByRole('main', { name: 'История' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /на главный экран/ }));
    await waitFor(() => expect(screen.queryByRole('main', { name: 'История' })).toBeNull());
  });
});
