// Проверка страницы «code rotted»: ошибки консоли, скриншоты телефон/ПК, SW основного приложения не перехватывает /rot/.
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
mkdirSync('.shots', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.SALIMETER_CHROME ?? '/opt/browser/chrome', args: ['--no-sandbox'] });
const errors = [];
async function run(name, ctxOpts) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  if (process.env.ROT_DIRECT) {
    await page.goto(base);
  } else {
    // сначала основное приложение, чтобы его SW был активен
    await page.goto(base);
    await page.waitForSelector('.cmd');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 }).catch(() => null);
    await page.goto(base + 'rot/');
  }
  await page.waitForSelector('#cookie');
  const title = await page.title();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `.shots/rot-${name}-cookie.png` });
  await page.getByRole('button', { name: 'Я посмотрел на печеньку' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `.shots/rot-${name}-desk.png` });
  const sw = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope));
  const manifest = await page.evaluate(async () => (await (await fetch('./manifest.webmanifest')).json()).name);
  console.log(JSON.stringify({ name, title, sw, manifest, size: page.viewportSize() }));
  await context.close();
}
await run('phone', { ...devices['Pixel 7'], browserName: 'chromium' });
await run('desktop', { viewport: { width: 1280, height: 800 } });
await browser.close();
console.log(JSON.stringify({ errors }));
