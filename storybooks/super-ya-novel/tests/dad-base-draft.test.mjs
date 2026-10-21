import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateSubmission} from '../scripts/validate-content.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const editorial='editorial/dad-base-events-2026-10-21/',stage='output/drafts/dad-base-events-2026-10-21/dist/';
const digest=p=>createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex');
test('two new complete works preserve formal books and the previously delivered trial editions',()=>{
 const library=read(stage+'library.json'),practice=read(stage+'practice.json');
 assert.equal(library.books.filter(b=>!b.hidden).length,6);
 for(const [id,count,units,questions]of [['dad-shampoo',26,6,24],['secret-base',30,7,29]]){
  const bundle=read(editorial+id+'-submission.json'),book=library.books.find(b=>b.id===id),story=read(stage+book.data);
  assert.deepEqual(validateSubmission(bundle),{whisper:count,practice:units});
  assert.deepEqual(book.modes,{whisper:count,practice:units});
  assert.deepEqual(story,bundle.story);assert.deepEqual(practice[id],bundle.practice);
  assert.equal(practice[id].scenes.reduce((n,s)=>n+s.questions.story.length,0),questions);
  assert.equal(digest(editorial+id+'/original.md'),bundle.source.sha256);
  for(const c of story.chapters){assert.ok(c.presentation.guideRanges.length>=2);assert.ok(!c.chat);assert.ok(c.id.startsWith(id+'-event-'));}
  for(const s of practice[id].scenes){assert.ok(s.questions.story.length>=4);assert.equal(s.questions.story[1].type,'evidence');for(const q of s.questions.story)assert.ok(q.evidence.every(i=>s.story[i]));}
 }
 for(const [id,count]of [['tata',28],['karate',32]]){const file=`books/${id}-events/story.json`;assert.equal(digest(stage+file),digest('output/drafts/tata-karate-events-2026-10-21/dist/'+file));assert.equal(read(stage+file).chapters.length,count);}
 for(const [file,hash]of Object.entries(read(editorial+'review.json').protectedFiles))assert.equal(digest(file),hash,file);
 assert.match(readFileSync(new URL('../'+stage+'index.html',import.meta.url),'utf8'),/name="reading-preview" content="true"/);
});
test('new text, questions and explanations have aligned readings with contextual corrections',()=>{
 const readings=read(stage+'readings.json'),texts=[];
 function collect(v){if(typeof v==='string'&&/\p{Script=Han}/u.test(v))texts.push(v);else if(v&&typeof v==='object')Object.values(v).forEach(collect);}
 for(const id of ['dad-shampoo','secret-base']){const b=read(editorial+id+'-submission.json');collect([b.story,b.practice,b.ui,b.book]);}
 for(const text of texts){assert.equal(readings[text]?.length,Array.from(text).length,text);Array.from(text).forEach((ch,i)=>{if(/\p{Script=Han}/u.test(ch))assert.ok(readings[text][i],text);});}
 for(const [phrase,index,sound]of [['洗髮',1,'ㄈㄚˇ'],['音樂',1,'ㄩㄝˋ'],['興奮',0,'ㄒㄧㄥ'],['看守',0,'ㄎㄢ'],['重建',0,'ㄔㄨㄥˊ'],['我得暫時',1,'ㄉㄟˇ'],['找得到',1,'˙ㄉㄜ'],['得到',0,'ㄉㄜˊ']]){
  const matches=texts.filter(t=>t.includes(phrase));assert.ok(matches.length,phrase);
  for(const t of matches)for(let at=t.indexOf(phrase);at>=0;at=t.indexOf(phrase,at+1)){
   if(phrase==='得到'&&['找','做','聽','接','看'].includes(t[at-1]))continue;
   assert.equal(readings[t][at+index],sound,t);
  }
 }
});
