import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8'));

async function openFirst(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '閱讀 I Took Them All', exact: true }).click();
  await expect(page.locator('#page-image')).toBeVisible();
  await expect(page.locator('#page-image')).toHaveJSProperty('complete', true);
}

test('mother and daughter can choose, turn pages and resume after reopening', async ({ page }) => {
  await openFirst(page);
  await expect(page.locator('#page-count')).toHaveText('1 / 22');
  await page.getByRole('button', { name: '下一頁', exact: true }).click();
  await expect(page.locator('#page-count')).toHaveText('2 / 22');
  await page.reload();
  await expect(page.locator('#page-count')).toHaveText('2 / 22');
  await page.getByRole('button', { name: '書櫃', exact: true }).click();
  await expect(page.locator('#continue-section')).toBeVisible();
  await page.locator('#continue-button').click();
  await expect(page.locator('#page-count')).toHaveText('2 / 22');
});

test('full page stays inside the iPad viewport in normal and focused reading', async ({ page }) => {
  await openFirst(page);
  await expect(page.locator('#page-image')).toHaveCSS('object-fit', 'contain');
  const assertFit = async () => {
    const box = await page.locator('#page-image').boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  };
  await assertFit();
  await page.getByRole('button', { name: '專心閱讀' }).click();
  await expect(page.locator('.reader-header')).toBeHidden();
  await assertFit();
  await page.getByRole('button', { name: '顯示閱讀按鈕' }).click();
  await expect(page.locator('.reader-header')).toBeVisible();
});

test('swipe turns exactly one page and vertical or multi-touch gestures do not turn pages', async ({ page }) => {
  await openFirst(page);
  async function swipe(dx: number, dy = 0, fingers = 1) {
    await page.locator('#reading-stage').evaluate((stage, { dx, dy, fingers }) => {
      const makeTouch = (id, x, y) => ({ identifier: id, target: stage, clientX: x, clientY: y });
      // WebKit does not expose constructible Touch/TouchEvent objects. Dispatch
      // the same touch-list payload through DOM events in both engines.
      const dispatch = (type, touches, changedTouches) => {
        const event = new Event(type, { bubbles: true });
        Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changedTouches } });
        stage.dispatchEvent(event);
      };
      const touches = Array.from({ length: fingers }, (_, id) => makeTouch(id, 400 + id * 50, 350));
      dispatch('touchstart', touches, touches);
      dispatch('touchend', [], [makeTouch(0, 400 + dx, 350 + dy)]);
    }, { dx, dy, fingers });
  }
  await swipe(-170);
  await expect(page.locator('#page-count')).toHaveText('2 / 22');
  await swipe(12, 170);
  await swipe(-170, 0, 2);
  await expect(page.locator('#page-count')).toHaveText('2 / 22');
  await swipe(170);
  await expect(page.locator('#page-count')).toHaveText('1 / 22');
});

test('last page stays put until mother chooses finish, reread or bookshelf', async ({ page }) => {
  await page.goto('/#book/004-hurry-up?page=14');
  await expect(page.locator('#page-count')).toHaveText('14 / 14');
  await expect(page.locator('#finished-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '讀完了', exact: true }).click();
  await expect(page.locator('#finished-dialog')).toBeVisible();
  await page.getByRole('button', { name: '留在這一頁' }).click();
  await expect(page.locator('#page-count')).toHaveText('14 / 14');
  await page.getByRole('button', { name: '讀完了', exact: true }).click();
  await page.getByRole('button', { name: '再讀一次', exact: true }).click();
  await expect(page.locator('#page-count')).toHaveText('1 / 14');
});

test('search finds books by name or number and handles no matches', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(catalog.books.length);
  await page.getByRole('searchbox').fill('04');
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Hurry Up!');
  await page.getByRole('searchbox').fill('unknown');
  await expect(page.locator('#empty-result')).toBeVisible();
});

test('network failure can be retried without losing the current page', async ({ page }) => {
  let failing = true;
  await page.route('**/media/books/004-hurry-up/002-*.webp', async route => failing ? route.abort() : route.continue());
  await page.goto('/#book/004-hurry-up?page=2');
  await expect(page.locator('#retry-image')).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: '再試一次', exact: true }).click();
  await expect(page.locator('#image-status')).toBeHidden();
  await expect(page.locator('#page-count')).toHaveText('2 / 14');
});

test('corrupted or unavailable local storage still permits reading', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mother-daughter-books:v1', 'invalid-json');
    Storage.prototype.setItem = () => { throw new Error('storage unavailable'); };
  });
  await openFirst(page);
  await page.getByRole('button', { name: '下一頁', exact: true }).click();
  await expect(page.locator('#page-count')).toHaveText('2 / 22');
});
