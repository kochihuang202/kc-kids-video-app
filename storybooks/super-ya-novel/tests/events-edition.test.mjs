import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sanitizePatch} from '../worker/progress.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
test('forty event reflections replace the first shelf entry and preserve approved opening, archives and practice',()=>{
 const library=read('dist/library.json'),first=library.books[0],story=read('dist/'+first.whisper.data);
 assert.equal(first.id,'super-ya');assert.equal(story.chapters.length,40);assert.equal(first.modes.whisper,40);
 assert.deepEqual(story.chapters.slice(0,5),read('editorial/child-trial-2026-10-20/story.json').chapters);
 assert.equal(new Set(story.chapters.map(c=>c.id)).size,40);
 assert.equal(library.books.filter(b=>!b.hidden&&b.title===story.title).length,1);
 assert.equal(library.books.find(b=>b.id==='super-ya-revisit').redirectTo,'super-ya');
 assert.notEqual(first.whisper.storageKey,first.storageKey);assert.notEqual(first.whisper.progressId,first.id);
 assert.equal(read('dist/'+first.data).chapters.length,5);assert.equal(read('dist/books/super-ya-revisit/story.json').chapters.length,7);
 assert.deepEqual(read('dist/practice.json')['super-ya'],read('content/practice.json')['super-ya']);
 assert.deepEqual(sanitizePatch({chapter:39,readThrough:{39:2}},first.whisper.progressId,'whisper'),{chapter:39,readThrough:{39:2}});
 assert.throws(()=>sanitizePatch({chapter:40},first.whisper.progressId,'whisper'));
 assert.throws(()=>sanitizePatch({chapter:39},'super-ya','whisper'));
});
test('new text and titles have aligned annotations, contextual modal dei and valid interleaved guide ranges',()=>{
 const story=read('dist/books/super-ya-events/story.json'),sounds=read('dist/readings.json');
 for(const c of story.chapters){
  assert.ok(c.presentation.guideRanges.length>=2);
  let previous=-1;for(const [a,b]of c.presentation.guideRanges){assert.ok(a>previous&&a<=b&&b<c.blocks.length);previous=b;}
  for(const text of [c.title,...c.blocks.map(b=>b.text)]){const chars=Array.from(text);assert.equal(sounds[text].length,chars.length);chars.forEach((ch,i)=>{if(/\p{Script=Han}/u.test(ch))assert.ok(sounds[text][i],text);});}
 }
 for(const [phrase,index,sound]of [['我得先',1,'ㄉㄟˇ'],['可能得忍',2,'ㄉㄟˇ'],['可能得到',2,'ㄉㄜˊ'],['重說',0,'ㄔㄨㄥˊ'],['有空',1,'ㄎㄨㄥˋ'],['來得及',1,'˙ㄉㄜ'],['做得到',1,'˙ㄉㄜ'],['車子',0,'ㄔㄜ']]){
  const strings=Object.keys(sounds).filter(s=>s.includes(phrase));assert.ok(strings.length,phrase);
  for(const text of strings)for(let at=text.indexOf(phrase);at>=0;at=text.indexOf(phrase,at+1))assert.equal(sounds[text][at+index],sound,text);
 }
});
