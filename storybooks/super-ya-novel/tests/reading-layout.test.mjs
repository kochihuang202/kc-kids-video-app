import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL('../'+n,import.meta.url)));
test('new edition removes extra chats and supplies audited guide ranges and distinct episode images',()=>{
  const story=read('dist/story.json');
  assert.ok(story.chapters.every(c=>!c.chat),'extra conversations removed');
  assert.equal(new Set(story.chapters.map(c=>c.presentation.hero)).size,5);
  for(const c of story.chapters){
    const p=c.presentation;
    assert.ok(p.guideRanges.length>=4);
    let end=-1;
    for(const [start,stop] of p.guideRanges){assert.ok(start>end&&stop>=start&&stop<c.blocks.length);end=stop;}
    assert.ok(p.events.length>=3);
    for(const e of p.events){
      assert.ok(e.block>=0&&e.block<c.blocks.length);
      assert.ok(existsSync(new URL('../dist/assets/episode/'+e.image+'.jpg',import.meta.url)));
    }
    assert.deepEqual(p.events.map(e=>e.block),p.events.map(e=>e.block).sort((a,b)=>a-b));
    for(const [i,phrases] of Object.entries(p.emphasis))for(const phrase of phrases)assert.ok(c.blocks[i].text.includes(phrase));
  }
  const js=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/🐯|<svg|function chatMarkup/);
  assert.match(js,/guide-passage/);
  assert.match(js,/readThrough/);
  assert.match(js,/anchors/);
});
