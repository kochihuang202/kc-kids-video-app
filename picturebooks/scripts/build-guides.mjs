import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pairs } from '../content/helpers.mjs';
const publicDir = new URL('../public/', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('catalog.json', publicDir), 'utf8'));
await mkdir(new URL('guides/', publicDir), { recursive: true });
for (const book of catalog.books) {
  if (book.guide === false) continue;
  const { default: rows } = await import(`../content/${String(Number(book.number)).padStart(3, '0')}.mjs`);
  if (rows.length !== book.pages.length) throw new Error(`Page mismatch: ${book.id}`);
  const pages = rows.map((r, i) => {
    const section = (title, text, note, labels) => ({ title, ...(note ? { note } : {}), phrases: pairs(text).map((p, n) => ({ ...p, id: `${book.id}:${i + 1}:${createHash('sha256').update(`${title}:${n}:${p.en}`).digest('hex').slice(0, 12)}`, ...(labels?.[n] ? { label: labels[n] } : {}) })) });
    return { page: i + 1, image: book.pages[i], reviewedAgainstImage: true, sections: [
      section('原文與翻譯', r.original, r.original ? undefined : '這一頁沒有故事英文，下面的英文是陪讀建議。'),
      section('媽媽先看懂', '', r.explanation),
      section('一起看看畫面', r.look, r.scene),
      section('可以這樣聊', r.extension, '以下是媽媽可以加上的簡單說法，並非繪本原文；疑問或猜測不代表畫面已發生。'),
      section('問一句，接一句', `${r.question};${r.answer};${r.follow}`, `孩子沒回答時：${r.prompt}`, ['媽媽問', '孩子可能回答', '媽媽接話']),
      section('連到我們的生活', r.life, '把故事連到妳們的日常，依實際生活選用。'),
      section('一起玩一下 · 想像延伸', r.game, '這是延伸小活動，不是畫面中的事實。想玩就玩，不必每頁都做。'),
    ] };
  });
  await writeFile(new URL(`guides/${book.id}.json`, publicDir), JSON.stringify({ version: 1, bookId: book.id, title: book.title, reviewedAt: '2026-10-11', pages }, null, 2) + '\n');
  console.log(`${book.id}: ${pages.length} reviewed pages`);
}
