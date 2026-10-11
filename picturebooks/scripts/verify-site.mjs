import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = process.argv[2] || 'http://127.0.0.1:5186';
const catalogResponse = await fetch(`${baseURL}/catalog.json`);
if (!catalogResponse.ok) throw new Error(`Catalog: ${catalogResponse.status}`);
const { books } = await catalogResponse.json();
const images = [...new Set(books.flatMap(book => [...book.pages, book.cover]))];
let verified = 0;
const pending = [...images];
async function checkImages() {
  while (pending.length) {
    const url = pending.shift();
    const response = await fetch(`${baseURL}${url}`);
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) throw new Error(`Image failed: ${url} (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP') throw new Error(`Invalid image bytes: ${url}`);
    verified++;
  }
}
await Promise.all([checkImages(), checkImages(), checkImages(), checkImages()]);
console.log(`Verified ${books.length} books and all ${verified} WebP images.`);
for (const book of books) {
  const response = await fetch(`${baseURL}/guides/${book.id}.json`);
  if (!response.ok) throw new Error(`Guide unavailable: ${book.id}`);
  const guide = await response.json();
  if (guide.bookId !== book.id || guide.pages.length !== book.pages.length || guide.pages.some((p, i) => p.image !== book.pages[i] || p.page !== i + 1)) throw new Error(`Guide mapping mismatch: ${book.id}`);
}
console.log(`Verified guides for all ${books.reduce((n, b) => n + b.pages.length, 0)} pages.`);
const outputDir = path.join(root, '../artifacts/picturebooks');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await page.locator('.book-card').first().waitFor();
  await page.locator('#welcome-image').evaluate(async image => { await image.decode(); });
  await page.locator('.book-cover img').evaluateAll(async images => {
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map(image => image.decode()));
  });
  await page.screenshot({ path: path.join(outputDir, 'bookshelf-ipad.png'), fullPage: true });
  await page.getByRole('button', { name: '閱讀 I Took Them All', exact: true }).click();
  for (let index = 0; index < 3; index++) await page.getByRole('button', { name: '下一頁', exact: true }).click();
  await page.locator('#page-image').evaluate(async image => { await image.decode(); });
  await page.screenshot({ path: path.join(outputDir, 'reader-ipad.png') });
  await page.getByRole('button', { name: '專心閱讀' }).click();
  await page.screenshot({ path: path.join(outputDir, 'reader-focused-ipad.png') });
  await page.getByRole('button', { name: '顯示閱讀按鈕' }).click();
  await page.locator('#open-guide').click();
  await page.locator('.english-phrase').first().waitFor();
  await page.locator('#guide-preview').evaluate(image => image.decode());
  await page.screenshot({ path: path.join(outputDir, 'guide-landscape-ipad.png') });
  await page.locator('.favorite-sentence').first().click();
  await page.locator('#guide-filter').click();
  if (await page.locator('.english-phrase').count() !== 1) throw new Error('Favorite filtering failed');
  await page.locator('#guide-filter').click();
  await page.locator('#guide-next').click();
  if (await page.locator('#guide-page-count').textContent() !== '5 / 22') throw new Error('Guide navigation failed');
  await page.locator('#guide-return').click();
  if (await page.locator('#page-count').textContent() !== '4 / 22') throw new Error('Guide altered reader position');
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.screenshot({ path: path.join(outputDir, 'reader-portrait-ipad.png') });
  await page.locator('#open-guide').click();
  await page.screenshot({ path: path.join(outputDir, 'guide-portrait-ipad.png') });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`iPad screenshots and live smoke flow passed: ${outputDir}`);
} finally { await browser.close(); }
