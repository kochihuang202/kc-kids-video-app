import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
test('five-book catalog adds all three approved works without reusing original progress identities',()=>{
 const library=read('dist/library.json');assert.deepEqual(library.books.map(b=>b.id),['super-ya','kiki','tata','karate','super-ya-revisit']);
 assert.equal(new Set(library.books.map(b=>b.storageKey)).size,5);
 const p=read('dist/practice.json');let questions=0;
 for(const [id,parts,units,total]of [['tata',6,7,27],['karate',6,7,27],['super-ya-revisit',7,8,31]]){
  const book=library.books.find(b=>b.id===id);assert.equal(read('dist/'+book.data).chapters.length,parts);assert.equal(p[id].scenes.length,units);assert.equal(p[id].scenes.reduce((n,s)=>n+s.questions.story.length,0),total);assert.ok(existsSync(new URL('../dist/'+book.coverImage,import.meta.url)));questions+=total;
 }
 assert.equal(questions,85);assert.doesNotMatch(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),/name="reading-preview"/);
});
test('new stories resolve polyphones by the actual sentence rather than single-character defaults',()=>{
 const r=read('dist/readings.json');
 for(const [phrase,index,sound]of [['園長',1,'ㄓㄤˇ'],['擅長',1,'ㄔㄤˊ'],['答應',1,'ㄧㄥˋ'],['反應',1,'ㄧㄥˋ'],['接應',1,'ㄧㄥˋ'],['倒地',1,'ㄉㄧˋ'],['我倒覺得',1,'ㄉㄠˋ'],['空手道',0,'ㄎㄨㄥ'],['背包',0,'ㄅㄟ'],['捨不得',2,'˙ㄉㄜ'],['還得',1,'ㄉㄟˇ'],['非得',1,'ㄉㄟˇ'],['贏得',1,'ㄉㄜˊ'],['當成',0,'ㄉㄤˋ'],['妥當',1,'ㄉㄤˋ'],['睡著',1,'ㄓㄠˊ'],['同行的',1,'ㄒㄧㄥˊ'],['便當',1,'ㄉㄤ'],['教朋友',0,'ㄐㄧㄠ']]){
  const found=Object.entries(r).filter(([s])=>s.includes(phrase));assert.ok(found.length,phrase);
  for(const [s,a]of found)for(let at=s.indexOf(phrase);at>=0;at=s.indexOf(phrase,at+1))assert.equal(a[at+index],sound,phrase+' in '+s);
 }
});
