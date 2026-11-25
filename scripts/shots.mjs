// Скриншоты главных экранов в светлой/тёмной теме на разных ширинах. Запуск: node scripts/shots.mjs [base]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const widths = (process.env.WIDTHS ?? '360,390,430').split(',').map(Number);
mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.SALIMETER_CHROME ?? '/opt/browser/chrome', args: ['--no-sandbox'] });

const key = (page, k) => page.locator(`[data-key="${k}"]`).click();
const nav = (page, name) => page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name }).click();
async function enter(page, field, digits) {
  await page.locator(`[data-field="${field}"]`).click();
  for (const d of digits) await key(page, d);
  await page.getByRole('button', { name: 'готово' }).click();
}

for (const w of widths) {
  const h = w === 360 ? 740 : w === 390 ? 844 : 932;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(base);
  await page.waitForSelector('.cmd');
  // онбординг: создать категорию из примера и закрыть
  const onboard = page.getByRole('dialog', { name: 'Категории замеров' });
  if (await onboard.isVisible().catch(() => false)) {
    await onboard.getByRole('button', { name: /Коллектор 6-17/ }).click();
    await onboard.getByRole('button', { name: /Готово|Позже/ }).click();
  }
  await page.waitForTimeout(400);
  for (const theme of ['fog', 'depth']) {
    await nav(page, 'настройки');
    await page.getByRole('button', { name: theme === 'fog' ? 'Туман' : 'Глубина' }).click();
    await nav(page, 'замер');
    await page.waitForSelector('.cmd');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.shots/${w}-${theme}-measure.png` });
    await page.locator('[data-field="reading"]').click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `.shots/${w}-${theme}-keypad.png` });
    await page.getByRole('button', { name: 'готово' }).click();
    await page.getByRole('button', { name: 'обратный' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-reverse.png` });
    await page.getByRole('button', { name: 'замер', exact: true }).first().click();
    if (theme === 'fog') {
      for (const [r, t] of [['10230', '250'], ['10235', '245'], ['10240', '260'], ['10225', '255']]) {
        await enter(page, 'reading', r);
        await enter(page, 'temp', t);
        await page.getByRole('button', { name: 'Сохранить замер' }).click();
        const dlg = page.getByRole('dialog', { name: 'Куда сохранить замер' });
        if (await dlg.isVisible().catch(() => false)) {
          await dlg.getByRole('button', { name: /Коллектор/ }).click();
          await dlg.getByRole('button', { name: 'Сохранить', exact: true }).click();
        }
        await page.waitForTimeout(150);
      }
    }
    await nav(page, 'история');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.shots/${w}-${theme}-history.png` });
    await nav(page, 'долив');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-water.png` });
    await nav(page, 'настройки');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-settings.png`, fullPage: true });
    await nav(page, 'замер');
  }
  await context.close();
}
await browser.close();
console.log('shots ok');
