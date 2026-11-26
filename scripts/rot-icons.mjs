// PNG-иконки страницы «code rotted» из icon.svg. Запуск: node scripts/rot-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const svg = readFileSync('public/rot/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.SALIMETER_CHROME ?? '/opt/browser/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 60], ['icon-180.png', 180, 0]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#0b1a2e"><div style="width:${size}px;height:${size}px;display:grid;place-items:center"><div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${svg}</div></div></body></html>`);
  writeFileSync(`public/rot/${name}`, await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();
console.log('rot icons ok');
