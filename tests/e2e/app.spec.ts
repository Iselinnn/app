import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const ORIGIN = 'http://127.0.0.1:4173';

async function key(page: Page, k: string): Promise<void> {
  await page.locator(`[data-key="${k}"]`).click();
}
/** Тап по полю → клавиатура → цифры → «готово». */
async function enter(page: Page, field: 'reading' | 'temp' | 'target', digits: string): Promise<void> {
  await page.locator(`[data-field="${field}"]`).click();
  await expect(page.getByTestId('keypad')).toBeVisible();
  for (const d of digits) await key(page, d);
  await page.getByRole('button', { name: 'готово' }).click();
}
function nav(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name });
}
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.cmd');
  const onboard = page.getByRole('dialog', { name: 'Категории замеров' });
  if (await onboard.isVisible().catch(() => false)) await onboard.getByRole('button', { name: /Позже|Готово/ }).click();
}
async function waitForSw(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 });
}
async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Сохранить замер' }).click();
  const dlg = page.getByRole('dialog', { name: 'Куда сохранить замер' });
  if (await dlg.isVisible().catch(() => false)) await dlg.getByRole('button', { name: 'Сохранить', exact: true }).click();
}

test('полный сценарий: замер → категория → история → график → настройки → тема', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.cmd');
  // онбординг категорий при первом запуске
  const onboard = page.getByRole('dialog', { name: 'Категории замеров' });
  await expect(onboard).toBeVisible();
  await onboard.getByRole('button', { name: /Коллектор 6-17/ }).click();
  await onboard.getByRole('button', { name: 'Готово' }).click();

  await enter(page, 'reading', '10230');
  await enter(page, 'temp', '250');
  const result = page.getByTestId('result');
  await expect(result).toContainText('34.5');
  await expect(result).toContainText('ρ25 1.0230');
  await expect(result).toContainText('± 0.7');
  await expect(page.getByTestId('keypad')).toBeHidden();

  await page.getByRole('button', { name: 'Сохранить замер' }).click();
  const dlg = page.getByRole('dialog', { name: 'Куда сохранить замер' });
  await dlg.getByRole('button', { name: 'Коллектор 6-17' }).click();
  await dlg.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText(/Сохранено в «Коллектор 6-17»/)).toBeVisible();

  await nav(page, 'история').click();
  await expect(page.getByTestId('hist-item')).toHaveCount(1);
  await expect(page.getByTestId('hist-item').first()).toContainText('Коллектор 6-17');
  await expect(page.locator('svg.chart path.line')).toHaveAttribute('d', /^M/);
  await expect(page.locator('svg.chart rect.band')).toBeVisible();
  await page.getByRole('group', { name: 'Категория' }).getByRole('button', { name: 'Коллектор 6-17' }).click();
  await expect(page.getByTestId('hist-item')).toHaveCount(1);

  await nav(page, 'настройки').click();
  await page.getByRole('button', { name: 'Глубина' }).click();
  await expect(page.locator('html')).toHaveClass(/theme-depth/);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#0B0F14');
  await page.getByRole('button', { name: 'SG 25/25' }).click();
  await nav(page, 'замер').click();
  await expect(result).toContainText('30.5');
  await expect(result).toContainText('SG 25/25');

  await page.reload();
  await page.waitForSelector('.cmd');
  await expect(page.locator('html')).toHaveClass(/theme-depth/);
  await expect(result).toContainText('SG 25/25');
  await nav(page, 'история').click();
  await expect(page.getByTestId('hist-item')).toHaveCount(1);
});

test('обратный режим: 32 ‰ при 13.1 °C → 1.0237, без поправки → 1024.05 кг/м³', async ({ page }) => {
  await open(page);
  await enter(page, 'temp', '131');
  await page.getByRole('button', { name: 'обратный' }).click();
  await enter(page, 'target', '320');
  const r = page.getByTestId('reverse-result');
  await expect(r).toContainText('1.0237');
  await expect(r).toContainText('1021.08');
  await nav(page, 'настройки').click();
  await page.getByRole('switch', { name: 'Поправка на стекло' }).click();
  await nav(page, 'замер').click();
  await expect(r).toContainText('1024.05');
  await expect(r).toContainText('1.0241');
});

test('офлайн: после установки service worker приложение работает без сети', async ({ page, context }) => {
  await open(page);
  await waitForSw(page);
  // второй визит онлайн — как у пользователя: кэш уже прогрет и SW управляет страницей
  await page.reload();
  await page.waitForSelector('.cmd');
  await waitForSw(page);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.cmd');
  await enter(page, 'reading', '10240');
  await expect(page.getByTestId('result')).toContainText('35.9');
  await save(page);
  await expect(page.getByText('Замер сохранён')).toBeVisible();
  await nav(page, 'настройки').click();
  await expect(page.getByText(/EOS-80/)).toBeVisible();
  await context.setOffline(false);
});

test('PWA: manifest, иконки и service worker готовы к установке', async ({ page }) => {
  await open(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('./manifest.webmanifest');
  const res = await page.request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { display: string; start_url: string; icons: { src: string; sizes: string; purpose?: string }[]; name: string };
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('./');
  expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const r = await page.request.get('/' + icon.src);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  await waitForSw(page);
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, active: !!r.active })));
  expect(regs).toHaveLength(1);
  expect(regs[0]?.active).toBe(true);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('salimeter-')) ?? '');
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain('/index.html');
  expect(cached.some((p) => p.endsWith('.js'))).toBe(true);
  expect(cached.filter((p) => p.endsWith('.woff2'))).toHaveLength(4);
  const sw = await page.request.get('/sw.js');
  expect((await sw.text()).includes('__PRECACHE__')).toBe(false);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
});

test('нет сетевых запросов к другим хостам', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(ORIGIN)) external.push(r.url());
  });
  await open(page);
  await enter(page, 'reading', '10235');
  await save(page);
  for (const name of ['история', 'долив', 'настройки', 'замер']) {
    await nav(page, name).click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(1000);
  expect(external).toEqual([]);
});

test('поворот экрана: нет горизонтальной прокрутки, элементы доступны', async ({ page }) => {
  await open(page);
  const size = page.viewportSize();
  if (!size) throw new Error('viewport');
  await page.setViewportSize({ width: size.height, height: size.width });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await expect(page.getByTestId('result')).toBeVisible();
  await page.locator('[data-field="reading"]').scrollIntoViewIfNeeded();
  await page.locator('[data-field="reading"]').click();
  await expect(page.getByTestId('keypad')).toBeVisible();
  await page.locator('[data-key="5"]').scrollIntoViewIfNeeded();
  await page.locator('[data-key="5"]').click();
  await page.getByRole('button', { name: 'готово' }).click();
  await expect(page.getByRole('button', { name: 'Сохранить замер' })).toBeVisible();
  await page.setViewportSize(size);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('CSV: экспорт скачивает файл, импорт добавляет замеры и категории', async ({ page }) => {
  await open(page);
  await save(page);
  await nav(page, 'история').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV', exact: true }).click()]);
  const path = await download.path();
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  expect(text.split('\r\n')[0]).toBe('date,reading,temperature_c,scale,glass_correction,beta,salinity_permille,density25_kg_m3,note,category');
  expect(text).toContain('1.0230,25.0,density,true');

  const csv =
    'date,reading,temperature_c,scale,glass_correction,beta,note,category\n' +
    '2026-11-20T10:00:00Z,1.0240,26.0,density,true,2.5e-5,=HYPERLINK("x"),Коллектор 6-17\n' +
    '2026-11-21T10:00:00Z,1.0250,24.0,sg2525,false,1e-5,,\n';
  await page.locator('input[type="file"]').setInputFiles({ name: 'import.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText(/Импортировано 2/)).toBeVisible();
  await expect(page.getByTestId('hist-item')).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'Категория' }).getByRole('button', { name: 'Коллектор 6-17' })).toBeVisible();
});

test('удаление замера свайпом с отменой', async ({ page }) => {
  await open(page);
  await save(page);
  await nav(page, 'история').click();
  const row = page.locator('.hist-row').first();
  const box = await row.boundingBox();
  if (!box) throw new Error('row');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 140, y, { steps: 10 });
  await page.mouse.up();
  await expect(row).toHaveCSS('transform', /matrix\(1, 0, 0, 1, -88, 0\)/);
  await page.getByRole('button', { name: 'Удалить замер' }).click();
  await expect(page.getByTestId('hist-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByTestId('hist-item')).toHaveCount(1);
});

test('график: зум по периодам и перетаскивание', async ({ page }) => {
  await open(page);
  await save(page);
  await enter(page, 'reading', '10240');
  await save(page);
  await nav(page, 'история').click();
  const chart = page.locator('svg.chart');
  await expect(chart.locator('path.line')).toHaveAttribute('d', /C/);
  await page.getByRole('button', { name: '7д' }).click();
  await expect(page.getByText(/2 из 2/)).toBeVisible();
  const box = await chart.boundingBox();
  if (!box) throw new Error('chart');
  const before = await chart.locator('text').first().textContent();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const labels = await chart.locator('text').allTextContents();
  expect(labels.length).toBeGreaterThan(2);
  expect(before).not.toBeNull();
});

test('подмена воды считает долив и соль', async ({ page }) => {
  await open(page);
  await nav(page, 'долив').click();
  await page.getByLabel('Объём').fill('100');
  await page.getByLabel('Сейчас').fill('36');
  await expect(page.getByText('Долить осмоса (есть место)')).toBeVisible();
  await expect(page.locator('.water-item').first()).toContainText(/2\.[89]|3\.[0-2]/);
  await page.getByLabel('Сейчас').fill('34');
  await expect(page.getByText('Добавить сухой соли')).toBeVisible();
  await expect(page.locator('.water-item').first()).toContainText(/10[0-9]/);
});

test('анимация: FPS при CPU throttling ×4 не ниже 50, обитатели плавают, рябь от касания', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(500);
  const stats = await page.evaluate(() => window.__salimeterBg?.stats());
  expect(stats?.creatures ?? 0).toBeGreaterThanOrEqual(1);
  expect(stats?.cells ?? 0).toBeGreaterThan(20);
  // касание по фону (вне карточек) — рябь не должна ломать кадр
  await page.mouse.click(30, 300);
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tickFrame = (): void => {
          n++;
          const dt = performance.now() - t0;
          if (dt < 3000) requestAnimationFrame(tickFrame);
          else resolve(n / (dt / 1000));
        };
        requestAnimationFrame(tickFrame);
      }),
  );
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(`fps@cpu4x=${fps.toFixed(1)}`);
  expect(fps).toBeGreaterThanOrEqual(50);
});

test('память: нет роста кучи при длительной работе', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel7', 'достаточно одного устройства');
  const seconds = Number(process.env.SALIMETER_SOAK_SECONDS ?? 60);
  test.setTimeout(seconds * 1000 + 180_000);
  await open(page);
  const heap = async (): Promise<number> => {
    await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
    await page.waitForTimeout(300);
    return page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
  };
  await page.waitForTimeout(10_000);
  const start = await heap();
  const samples: number[] = [];
  const steps = Math.max(1, Math.floor((seconds - 10) / 10));
  for (let i = 0; i < steps; i++) {
    await page.waitForTimeout(10_000);
    await enter(page, 'reading', i % 2 ? '10235' : '10245');
    if (i % 3 === 2) {
      await nav(page, 'история').click();
      await nav(page, 'замер').click();
    }
    samples.push(await heap());
  }
  const end = await heap();
  console.log(`heap start=${(start / 1e6).toFixed(1)}MB end=${(end / 1e6).toFixed(1)}MB samples=${samples.map((s) => (s / 1e6).toFixed(1)).join(',')}`);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeLessThan(start * 1.5 + 5e6);
});
