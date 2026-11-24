// Скриншоты главных экранов в светлой/тёмной теме на разных ширинах. Запуск: node scripts/shots.mjs [base]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const widths = (process.env.WIDTHS ?? '360,390,430').split(',').map(Number);
mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.SALIMETER_CHROME ?? '/opt/browser/chrome', args: ['--no-sandbox'] });

async function key(page, k) {
  await page.locator(`[data-key="${k}"]`).click();
}

for (const w of widths) {
  const h = w === 360 ? 740 : w === 390 ? 844 : 932;
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto(base);
  await page.waitForSelector('.main-card');
  await page.waitForTimeout(400);
  for (const theme of ['fog', 'depth']) {
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page.getByRole('button', { name: theme === 'fog' ? 'Туман' : 'Глубина' }).click();
    await page.getByRole('button', { name: 'Закрыть' }).click();
    await page.waitForSelector('.main-card');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `.shots/${w}-${theme}-measure.png` });
    // обратный режим
    await page.getByRole('button', { name: 'Обратный' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-reverse.png` });
    await page.getByRole('button', { name: 'Замер' }).click();
    if (theme === 'fog') {
      // пара замеров в историю
      for (const [r, t] of [['10230', '250'], ['10235', '245'], ['10240', '260']]) {
        await page.locator('[data-field="reading"] [role="spinbutton"]').click();
        for (const ch of r) await key(page, ch);
        await page.locator('[data-field="temp"] [role="spinbutton"]').click();
        for (const ch of t) await key(page, ch);
        await page.getByRole('button', { name: /Сохранить замер/ }).click();
        await page.waitForTimeout(150);
      }
    }
    await page.getByRole('button', { name: 'История' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-history.png` });
    await page.getByRole('button', { name: 'Закрыть' }).click();
    await page.getByRole('button', { name: 'Подмена воды' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-water.png` });
    await page.getByRole('button', { name: 'Закрыть' }).click();
    await page.getByRole('button', { name: 'Настройки' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.shots/${w}-${theme}-settings.png`, fullPage: true });
    await page.getByRole('button', { name: 'Закрыть' }).click();
  }
  await context.close();
}
await browser.close();
console.log('shots ok');
