import { expect, test } from '@playwright/test';

async function mockSpeech(page) {
  await page.addInitScript(() => {
    const calls = []; let current = null;
    class Utterance { text; rate = 1; lang = ''; voice = null; onstart; onend; onerror; constructor(text) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: {
      getVoices: () => [{ name: 'French', lang: 'fr-FR' }, { name: 'US English', lang: 'en-US' }],
      addEventListener() {}, resume() {},
      cancel() { calls.push({ type: 'cancel' }); const old = current; current = null; old?.onerror?.({ error: 'canceled' }); },
      speak(utterance) { current = utterance; calls.push({ type: 'speak', text: utterance.text, rate: utterance.rate, lang: utterance.lang, voice: utterance.voice?.lang }); utterance.onstart?.(); },
    }, configurable: true });
    window.__speechCalls = calls;
    window.__failSpeech = () => current?.onerror?.({ error: 'synthesis-failed' });
  });
}
async function openGuide(page, number = 4, loaded = true) {
  await page.goto(`/#book/001-i-took-them-all?page=${number}`);
  await page.getByRole('button', { name: '媽媽陪讀指南', exact: true }).click();
  await expect(page.locator('#guide')).toBeVisible();
  if (loaded) await expect(page.locator('.english-phrase').first()).toBeVisible();
}

test('guide can browse independently and returns to the original reading page', async ({ page }) => {
  await openGuide(page);
  await expect(page.locator('#guide-page-count')).toHaveText('4 / 22');
  await expect(page.locator('#guide-content')).toContainText('毛衣');
  await page.getByRole('button', { name: '指南下一頁', exact: true }).click();
  await expect(page.locator('#guide-page-count')).toHaveText('5 / 22');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mother-daughter-books:v1')));
  expect(stored['001-i-took-them-all'].page).toBe(3);
  await page.getByRole('button', { name: '回到繪本', exact: true }).click();
  await expect(page.locator('#page-count')).toHaveText('4 / 22');
});

test('tap English speaks one sentence, restart and switch cancel old speech, Chinese stays silent', async ({ page }) => {
  await mockSpeech(page); await openGuide(page);
  const phrases = page.locator('.english-phrase');
  await phrases.first().click(); await phrases.first().click(); await phrases.nth(1).click();
  const calls = await page.evaluate(() => window.__speechCalls);
  expect(calls.filter(call => call.type === 'speak')).toHaveLength(3);
  expect(calls.filter(call => call.type === 'cancel').length).toBeGreaterThanOrEqual(3);
  expect(calls.filter(call => call.type === 'speak').every(call => call.voice === 'en-US')).toBe(true);
  await expect(phrases.nth(1)).toHaveClass(/is-speaking/);
  await page.locator('.phrase-translation').first().click();
  expect(await page.evaluate(() => window.__speechCalls.filter(call => call.type === 'speak').length)).toBe(3);
  await page.getByRole('button', { name: '慢速', exact: true }).click();
  await phrases.first().click();
  expect(await page.evaluate(() => window.__speechCalls.filter(call => call.type === 'speak').at(-1).rate)).toBe(0.6);
  await page.getByRole('button', { name: '指南下一頁', exact: true }).click();
  await expect(page.locator('.is-speaking')).toHaveCount(0);
});

test('favorites persist and filtering shows only selected sentences', async ({ page }) => {
  await openGuide(page);
  const text = await page.locator('.english-phrase').first().textContent();
  await page.locator('.favorite-sentence').first().click();
  await page.getByRole('button', { name: '只看收藏', exact: true }).click();
  await expect(page.locator('.english-phrase')).toHaveCount(1);
  await expect(page.locator('.english-phrase')).toHaveText(text);
  await page.getByRole('button', { name: '回到繪本', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '媽媽陪讀指南', exact: true }).click();
  await page.getByRole('button', { name: '只看收藏', exact: true }).click();
  await expect(page.locator('.english-phrase')).toHaveText(text);
});

test('guide scroll position survives closing and page navigation', async ({ page }) => {
  await openGuide(page);
  const viewport = page.viewportSize();
  const bounds = await page.locator('#guide-scroll').boundingBox();
  expect(bounds.height).toBeLessThan(viewport.height);
  expect(bounds.y + bounds.height).toBeLessThan(viewport.height);
  await expect(page.locator('#guide-next')).toBeInViewport();
  await page.locator('#guide-scroll').evaluate(node => { node.scrollTop = 420; });
  await page.getByRole('button', { name: '回到繪本', exact: true }).click();
  await page.getByRole('button', { name: '媽媽陪讀指南', exact: true }).click();
  await expect.poll(() => page.locator('#guide-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(350);
  await page.getByRole('button', { name: '指南下一頁', exact: true }).click();
  await page.getByRole('button', { name: '指南上一頁', exact: true }).click();
  await expect.poll(() => page.locator('#guide-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(350);
});

test('failed guide load can retry and never prevents returning to the picture', async ({ page }) => {
  let fail = true;
  await page.route('**/guides/001-i-took-them-all.json', route => fail ? route.fulfill({ status: 503, body: 'temporary' }) : route.continue());
  await openGuide(page, 4, false);
  await expect(page.getByRole('button', { name: '重新載入指南' })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '重新載入指南' }).click();
  await expect(page.locator('.english-phrase').first()).toBeVisible();
  await page.getByRole('button', { name: '回到繪本', exact: true }).click();
  await expect(page.locator('#page-count')).toHaveText('4 / 22');
});

test('speech error offers retry, and exit or background stops speaking', async ({ page }) => {
  await mockSpeech(page); await openGuide(page);
  await page.locator('.english-phrase').first().click();
  await page.evaluate(() => window.__failSpeech());
  await expect(page.getByRole('button', { name: '重新朗讀' })).toBeVisible();
  await page.getByRole('button', { name: '重新朗讀' }).click();
  await expect(page.locator('.is-speaking')).toHaveCount(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.is-speaking')).toHaveCount(0);
  await page.getByRole('button', { name: '回到繪本', exact: true }).click();
  expect(await page.evaluate(() => window.__speechCalls.at(-1).type)).toBe('cancel');
});

test('slow speed persists after reopening and malformed guide preferences do not block reading', async ({ page }) => {
  await mockSpeech(page);
  await page.addInitScript(() => localStorage.setItem('mother-daughter-guide:v1', '{"favorites":"broken","scroll":3}'));
  await openGuide(page);
  await page.getByRole('button', { name: '慢速', exact: true }).click();
  await page.getByRole('button', { name: '回到繪本', exact: true }).click();
  await page.getByRole('button', { name: '媽媽陪讀指南', exact: true }).click();
  await expect(page.getByRole('button', { name: '慢速', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.english-phrase').first().click();
  expect(await page.evaluate(() => window.__speechCalls.filter(call => call.type === 'speak').at(-1).rate)).toBe(0.6);
});

test('every published book opens its matching guide and wrong guide data stays recoverable', async ({ page }) => {
  const catalog = await (await page.request.get('/catalog.json')).json();
  for (const book of catalog.books) {
    await page.goto(`/#book/${book.id}?page=${book.pages.length}`);
    await page.locator('#open-guide').click();
    await expect(page.locator('.english-phrase').first()).toBeVisible();
    await expect(page.locator('#guide-page-count')).toHaveText(`${book.pages.length} / ${book.pages.length}`);
    await expect(page.locator('#guide-title')).toHaveText(book.title);
    await expect(page.locator('#guide-preview')).toHaveAttribute('src', book.pages.at(-1));
    await expect(page.locator('#guide-next')).toBeDisabled();
  }
  await page.reload();
  await page.route('**/guides/001-i-took-them-all.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":1,"bookId":"wrong","pages":[]}' }));
  await openGuide(page, 4, false);
  await expect(page.locator('#guide-retry')).toBeVisible();
  await page.locator('#guide-return').click();
  await page.locator('#next-page').click();
  await expect(page.locator('#page-count')).toHaveText('5 / 22');
});

test('legacy preference migrates to a clearly slower rate and the same sentence can be compared', async ({ page }) => {
  await mockSpeech(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('mother-daughter-guide:v1')) localStorage.setItem('mother-daughter-guide:v1', JSON.stringify({ rate: 0.8, favorites: { keep: true }, scroll: {} }));
  });
  await openGuide(page);
  await expect(page.locator('#speech-slow')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.english-phrase').first().click();
  expect(await page.evaluate(() => window.__speechCalls.filter(c => c.type === 'speak').at(-1).rate)).toBe(0.6);
  await page.locator('#speech-normal').click();
  await expect(page.locator('.is-speaking')).toHaveCount(0);
  await page.locator('.english-phrase').first().click();
  const calls = await page.evaluate(() => window.__speechCalls.filter(c => c.type === 'speak'));
  expect(calls[1].rate).toBe(1);
  expect(calls[1].text).toBe(calls[0].text);
  expect(calls[1].voice).toBe(calls[0].voice);
  await page.locator('#speech-slow').click();
  await page.reload();
  await page.locator('#open-guide').click();
  await page.locator('.english-phrase').first().click();
  expect(await page.evaluate(() => window.__speechCalls.filter(c => c.type === 'speak').at(-1).rate)).toBe(0.6);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mother-daughter-guide:v1')).favorites.keep)).toBe(true);
});
