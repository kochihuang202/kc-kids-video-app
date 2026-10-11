import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-books.mjs <source-folder>');
const folders = (await readdir(source, { withFileTypes: true })).filter(item => item.isDirectory() && /^\d+_/.test(item.name));
folders.sort((a, b) => Number(a.name.split('_')[0]) - Number(b.name.split('_')[0]));
const seen = new Set(), books = [];
function encode(input, output, width) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', `scale=min(${width}\\,iw):-1`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', output], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Image conversion failed: ${result.stderr}`);
}
for (const folder of folders) {
  const [number, ...words] = folder.name.split('_');
  const id = `${String(Number(number)).padStart(3, '0')}-${words.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'book'}`;
  if (seen.has(id)) throw new Error(`Duplicate book: ${id}`);
  seen.add(id);
  const files = (await readdir(path.join(source, folder.name))).filter(name => /\.(png|jpe?g|webp)$/i.test(name));
  const numbered = files.map(name => { const match = name.match(/^(\d+)(?:[_. -]|\.)/); if (!match) throw new Error(`Page needs a numeric prefix: ${name}`); return { name, index: Number(match[1]) }; }).sort((a, b) => a.index - b.index);
  if (!numbered.length) throw new Error(`No pictures: ${folder.name}`);
  numbered.forEach((file, index) => { if (file.index !== index + 1) throw new Error(`Missing or duplicate page in ${folder.name}: expected ${index + 1}, found ${file.index}`); });
  const outputDir = path.join(root, 'public', 'media', 'books', id);
  await mkdir(outputDir, { recursive: true });
  const pages = [];
  let cover;
  for (const file of numbered) {
    const input = path.join(source, folder.name, file.name);
    const fingerprint = createHash('sha256').update(await readFile(input)).update('webp-q88-w1800-v1').digest('hex').slice(0, 12);
    const name = `${String(file.index).padStart(3, '0')}-${fingerprint}.webp`;
    encode(input, path.join(outputDir, name), 1800);
    pages.push(`/media/books/${id}/${name}`);
    if (file.index === 1) {
      const coverName = `cover-${fingerprint}.webp`;
      encode(input, path.join(outputDir, coverName), 800);
      cover = `/media/books/${id}/${coverName}`;
    }
  }
  books.push({ id, number: String(Number(number)).padStart(2, '0'), title: words.join(' ').replace(/^No Not There$/, 'No, Not There').replace(/^Hurry Up$/, 'Hurry Up!'), cover, pages });
  console.log(`Imported ${books.at(-1).title}: ${pages.length} pages`);
}
if (!books.length) throw new Error('No book folders found');
await writeFile(path.join(root, 'public', 'catalog.json'), `${JSON.stringify({ version: 1, books }, null, 2)}\n`);
let bytes = 0;
for (const book of books) for (const url of [...book.pages, book.cover]) bytes += (await stat(path.join(root, 'public', url))).size;
console.log(`${books.length} books, ${books.reduce((sum, book) => sum + book.pages.length, 0)} pages, ${(bytes / 1048576).toFixed(1)} MB including covers.`);
