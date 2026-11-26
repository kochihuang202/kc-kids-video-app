import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
const source = readFileSync(input, 'utf8');
const newline = source.includes('\r\n') ? '\r\n' : '\n';
const edits = new Map();
let active;
for (const line of readFileSync(new URL('./notes_011_020.txt', import.meta.url), 'utf8').split(/\r?\n/)) {
  if (!line) continue;
  if (line.startsWith('[')) {
    active = new Map();
    edits.set(line.slice(1, -1), active);
    continue;
  }
  const space = line.indexOf(' ');
  assert.ok(space > 0);
  const term = line.slice(0, space);
  assert.ok(!active.has(term), term);
  active.set(term, line.slice(space + 1));
}

const row = /^(\| (\d+) \| ([^|]+?) \| ([^|]+?) \| )([^|]+?)( \|)[^\S\r\n]*$/gm;
const splitEpisodes = (document) => document.split(/(?=^# 第 \d{3} 回)/m);
const [preface, ...episodes] = splitEpisodes(source);
assert.equal(episodes.length, 10);
const revised = episodes.map((episode, index) => {
  const id = String(index + 11).padStart(3, '0');
  assert.ok(episode.startsWith(`# 第 ${id} 回`));
  const tableStart = episode.indexOf('| 序號 |');
  assert.ok(tableStart > 0);
  const reading = episode.slice(0, tableStart);
  const story = reading.split(/^## .*註解/m)[0];
  const originalRows = [...episode.matchAll(row)];
  assert.ok(originalRows.length >= 175);
  const terms = new Set(originalRows.map((match) => match[3]));
  const local = edits.get(id);
  const shared = edits.get('all');
  let changed = 0;
  let last = 0;
  let tail = 0;
  const revisedEpisode = episode.replace(row, (line, prefix, number, term, category, definition, suffix, offset) => {
    last = Number(number);
    tail = offset + line.length;
    const replacement = local.get(term) ?? shared.get(term);
    if (!replacement || replacement === definition) return line;
    changed++;
    return prefix + replacement + suffix;
  });

  const additions = [];
  const skipped = [];
  for (const [term, definition] of new Map([...shared, ...local])) {
    if (terms.has(term)) continue;
    if (!story.includes(term)) {
      if (local.has(term)) skipped.push(term);
      continue;
    }
    additions.push(`| ${++last} | ${term} | 詞語解釋 | ${definition} |`);
  }
  const originalTail = episode.slice(tail);
  assert.ok(revisedEpisode.endsWith(originalTail));
  const result = revisedEpisode.slice(0, revisedEpisode.length - originalTail.length)
    + newline + additions.join(newline) + originalTail;
  assert.equal(result.slice(0, result.indexOf('| 序號 |')), reading);
  const newRows = [...result.matchAll(row)];
  assert.deepEqual(newRows.slice(0, originalRows.length).map((match) => match.slice(2, 5)),
    originalRows.map((match) => match.slice(2, 5)));
  assert.equal(newRows.length, originalRows.length + additions.length);
  console.log(`${id}: ${originalRows.length} existing, ${changed} revised, ${additions.length} added. Absent: ${skipped.join('、')}`);
  return result;
});
writeFileSync(output, preface + revised.join(''), 'utf8');
