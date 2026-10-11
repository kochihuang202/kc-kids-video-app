import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const svg = await readFile(path.join(root, 'icon.svg'), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const [size, name] of [[512, 'app-icon.png'], [180, 'apple-touch-icon.png']]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    await page.locator('svg').screenshot({ path: path.join(root, name) });
  }
} finally { await browser.close(); }
