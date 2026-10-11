import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const publicDir = new URL('../public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', publicDir)));
test('every published image has a complete, translated guide with stable unique sentence IDs', async () => {
  const ids = new Set(); let total = 0;
  for (const book of catalog.books) {
    const guide = JSON.parse(await readFile(new URL(`guides/${book.id}.json`, publicDir)));
    assert.equal(guide.bookId, book.id); assert.equal(guide.version, 1);
    assert.equal(guide.pages.length, book.pages.length);
    for (const [i, page] of guide.pages.entries()) {
      total++; assert.equal(page.page, i + 1); assert.equal(page.image, book.pages[i]);
      assert.equal(page.reviewedAgainstImage, true);
      assert.equal(page.sections.length, 7);
      const dialogue = page.sections.find(s => s.title === '問一句，接一句');
      assert.equal(dialogue.phrases.length, 3); assert.match(dialogue.note, /孩子沒回答/);
      assert.match(page.sections.at(-1).title, /想像延伸/);
      assert.ok(page.sections[0].phrases.length || /沒有故事英文/.test(page.sections[0].note));
      for (const section of page.sections) for (const phrase of section.phrases) {
        assert.ok(phrase.en.trim()); assert.ok(phrase.zh.trim());
        assert.match(phrase.id, new RegExp(`^${book.id}:${i + 1}:`));
        assert.ok(!ids.has(phrase.id)); ids.add(phrase.id);
        assert.doesNotMatch(phrase.en + phrase.zh, /TODO|placeholder|待補/);
      }
    }
  }
  assert.equal(total, catalog.books.reduce((sum, book) => sum + book.pages.length, 0));
});
test('new books preserve image facts and explain figurative wording without inventing outcomes', async () => {
  const get = async number => {
    const book = catalog.books.find(b => Number(b.number) === number);
    assert.ok(book, `Published book ${number}`);
    return JSON.parse(await readFile(new URL(`guides/${book.id}.json`, publicDir)));
  };
  assert.equal(catalog.books.length, 18);
  assert.equal(catalog.books.reduce((sum, b) => sum + b.pages.length, 0), 244);
  const fly = await get(8);
  assert.match(fly.pages[11].sections[1].note, /假裝|想像/);
  const worms = await get(10);
  assert.match(worms.pages[3].sections[1].note, /鼻頭外面/);
  assert.match(worms.pages[10].sections[1].note, /倒影/);
  const clothes = await get(12);
  assert.match(clothes.pages[13].sections[1].note, /仍沒有找到/);
  const tidy = await get(13);
  assert.match(tidy.pages[12].sections[1].note, /不是食物灑出/);
  const pack = await get(14);
  for (const index of [9, 18]) assert.match(pack.pages[index].sections[1].note, /貓布偶/);
  const bathroom = await get(18);
  assert.match(bathroom.pages[2].sections[1].note, /number one.*尿尿.*number two.*便便/);
  assert.match(bathroom.pages[7].sections[1].note, /不是.*壞事/);
});
test('image-specific original wording and known visual nuances remain intact', async () => {
  const get = async id => JSON.parse(await readFile(new URL(`guides/${id}.json`, publicDir)));
  const first = await get('001-i-took-them-all');
  assert.equal(first.pages[0].sections[0].phrases.length, 0);
  assert.equal(first.pages[21].sections[0].phrases.length, 0);
  assert.equal(first.pages[3].sections[0].phrases[0].en, 'Did you take your sweater?');
  assert.equal(first.pages[12].sections[0].phrases[1].en, 'Yes, I took them!');
  const tidy = await get('002-no-not-there');
  assert.match(tidy.pages[9].sections[1].note, /掛鉤/);
  assert.match(tidy.pages[16].sections[1].note, /兩個收納動作/);
  const bird = await get('006-look-at-the-little-birdy');
  assert.equal(bird.pages[5].sections[0].phrases[1].en, 'Watch it fly In the sky!');
  const mine = await get('007-its-mine');
  assert.match(mine.pages[0].sections[1].note, /不猜是姊妹/);
});
