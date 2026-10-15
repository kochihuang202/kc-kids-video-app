import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url);
const story=JSON.parse(readFileSync(new URL('content/story.json',root)));
test('five supplied Markdown documents replace the previous eight chapter edition without dropping text',()=>{
  const files=readdirSync(new URL('content/source/',root)).filter(f=>f.endsWith('.md')).sort();
  assert.equal(files.length,5);assert.equal(story.chapters.length,5);
  for(let i=0;i<files.length;i++){
    const bytes=readFileSync(new URL(`content/source/${files[i]}`,root));
    const c=story.chapters[i];
    assert.equal(c.source.file,files[i]);
    assert.equal(c.source.sha256,createHash('sha256').update(bytes).digest('hex'));
    const rebuilt=c.source.bookHeading+'\n'+c.source.chapterHeading+'\n\n'+c.blocks.map(b=>b.type==='heading'?'### '+b.text:b.text).join('\n\n');
    assert.equal(rebuilt,bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim(),files[i]);
  }
  assert.ok(story.chapters[0].paragraphs.some(p=>p.includes('珊珊和美美')));
  assert.ok(story.chapters[4].paragraphs.some(p=>p.includes('你自己有沒有發現什麼')));
});
test('cover uses the supplied character image and dynamic five-chapter navigation',()=>{
  const app=readFileSync(new URL('dist/app.js',root),'utf8');
  assert.match(app,/assets\/shimajiro-friends\.png/);
  assert.match(app,/story\.chapters\.length/);
  assert.doesNotMatch(app,/index===7|chapter < 8|\/ 08/);
  assert.equal(readFileSync(new URL('dist/assets/shimajiro-friends.png',root)).subarray(1,4).toString(),'PNG');
});
