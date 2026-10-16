import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL('../'+n,import.meta.url)));
test('both episodes have independent comprehension passages, evidence, hints and complete whispers',()=>{
 const practice=read('content/practice.json'),legacy=read('content/legacy-practice.json');
 assert.deepEqual(Object.keys(practice).sort(),['kiki','super-ya']);
 let tasks=0;
 for(const [id,data]of Object.entries(practice)){
  const story=read(id==='kiki'?'content/books/kiki/story.json':'content/story.json');
  assert.ok(data.scenes.length>0&&story.chapters.length>0);
  for(const [i,s]of data.scenes.entries()){
   const source=story.chapters[i].paragraphs.map(p=>p.replace(/\*\*/g,''));
   for(const level of ['story']){
    for(const p of s[level])assert.ok(source.includes(p),'practice excerpts retain source paragraphs');
    for(const q of s.questions[level]){
     tasks++;assert.ok(q.why&&q.hints.length===2&&q.evidence.length);
     for(const e of q.evidence)assert.ok(Number.isInteger(e)&&e>=0&&e<s[level].length);
     assert.ok(q.correct>=0&&q.correct<(q.type==='choice'?q.options.length:s[level].length));
    }
   }
  }
 }
 assert.equal(tasks,42);assert.equal(Object.values(legacy.kiki).reduce((n,s)=>n+s.questions.length,0),18);
 const words=read('content/glossary.json');
 for(const w of ['責備','委屈','重視','自動駕駛','和解'])assert.ok(words[w]?.bopo&&words[w]?.meaning);
});
