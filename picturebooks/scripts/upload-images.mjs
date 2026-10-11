import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, '../node_modules/wrangler/wrangler-dist/cli.js');
const catalog = JSON.parse(await readFile(path.join(root, 'public/catalog.json'), 'utf8'));
const urls = [...new Set(catalog.books.flatMap(book => [...book.pages, book.cover]))];
const stateFile = path.join(root, '.wrangler/image-uploads.json');
await mkdir(path.dirname(stateFile), { recursive: true });
let complete = [];
try { complete = JSON.parse(await readFile(stateFile, 'utf8')); } catch {}
const finished = new Set(complete), pending = urls.filter(url => !finished.has(url));
for (const url of urls) { if (!/^\/media\/books\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(url)) throw new Error('Invalid image path'); await stat(path.join(root, 'public', url)); }
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(output.slice(-2000))));
  });
}
// Serialise progress writes while allowing three independent uploads at a time.
let writes = Promise.resolve();
let done = urls.length - pending.length;
console.log(`Images: ${done}/${urls.length} already uploaded.`);
async function uploadNext() {
  while (pending.length) {
    const url = pending.shift();
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await run(['r2', 'object', 'put', `mother-daughter-picturebooks-assets/${url.slice('/media/'.length)}`, '--remote', '--file', path.join(root, 'public', url), '--content-type', 'image/webp', '--cache-control', 'public, max-age=31536000, immutable']); lastError = null; break; }
      catch (error) { lastError = error; }
    }
    if (lastError) throw lastError;
    finished.add(url); done++;
    const snapshot = JSON.stringify([...finished], null, 2);
    writes = writes.then(() => writeFile(stateFile, snapshot)); await writes;
    if (done % 5 === 0 || done === urls.length) console.log(`Uploaded ${done}/${urls.length}`);
  }
}
await Promise.all([uploadNext(), uploadNext(), uploadNext()]);
console.log('All referenced images uploaded. Catalog can now be deployed.');
