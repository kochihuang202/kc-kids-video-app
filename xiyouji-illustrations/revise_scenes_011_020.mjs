import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
const source = readFileSync(input, 'utf8');
const edits = new Map();
let section;
for (const line of readFileSync(new URL('./notes_011_020_scene.txt', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  if (line.startsWith('[')) {
    section = new Map();
    edits.set(line.slice(1, -1), section);
  } else if (section === edits.get('remove')) {
    for (const word of line.split(/\s+/)) section.set(word, true);
  } else {
    const space = line.indexOf(' ');
    assert.ok(space > 0);
    section.set(line.slice(0, space), line.slice(space + 1));
  }
}

const row = /^(\| )(\d+)( \| ([^|]+?) \| [^|]+? \| )([^|]+?)( \|)(\r?\n|$)/gm;
const [preface, ...episodes] = source.split(/(?=^# 第 \d{3} 回)/m);
assert.equal(episodes.length, 10);
const revised = episodes.map((episode, index) => {
  const id = String(index + 11).padStart(3, '0');
  const tableStart = episode.indexOf('| 序號 |');
  assert.ok(tableStart > 0 && episode.startsWith(`# 第 ${id} 回`));
  const reading = episode.slice(0, tableStart);
  const table = episode.slice(tableStart);
  const original = [...table.matchAll(row)];
  const local = edits.get(id);
  const common = edits.get('all');
  const removed = edits.get('remove');
  let count = 0;
  let changed = 0;
  let result = table.replace(row, (_line, start, _number, columns, term, definition, end, newline) => {
    if (removed.has(term)) return '';
    const revision = local.get(term) ?? common.get(term) ?? definition;
    if (revision !== definition) changed++;
    return start + ++count + columns + revision + end + newline;
  });
  const kept = [...result.matchAll(row)];
  assert.deepEqual(kept.map(match => match[3]),
    original.filter(match => !removed.has(match[4])).map(match => match[3]));
  assert.equal(result.replace(row, ''), table.replace(row, ''));
  const present = new Set(kept.map(match => match[4]));
  const additions = [...local].filter(([term]) => !present.has(term) && !removed.has(term) && reading.includes(term));
  if (additions.length) {
    const last = kept.at(-1);
    const insertion = last.index + last[0].length;
    const newline = last[7] || (source.includes('\r\n') ? '\r\n' : '\n');
    const added = additions.map(([term, definition]) => `| ${++count} | ${term} | 詞語解釋 | ${definition} |`);
    result = result.slice(0, insertion) + (last[7] ? '' : newline) + added.join(newline) + newline + result.slice(insertion);
  }
  console.log(`${id}: rewritten=${changed} removed=${original.length - kept.length} added=${additions.length}`);
  return reading + result;
});
writeFileSync(output, preface + revised.join(''), 'utf8');
