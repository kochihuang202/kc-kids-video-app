import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url))),stage='output/drafts/tata-karate-events-2026-10-21/dist/',editorial='editorial/tata-karate-events-2026-10-21/';
test('both complete event editions are isolated previews and preserve original comprehension and published files',()=>{
 const library=read(stage+'library.json'),original=read('dist/practice.json'),practice=read(stage+'practice.json');
 for(const [id,count]of [['tata',28],['karate',32]]){
  const book=library.books.find(b=>b.id===id),story=read(stage+book.whisper.data);
  assert.equal(story.chapters.length,count);assert.equal(book.modes.whisper,count);assert.equal(book.modes.practice,7);
  assert.equal(book.whisper.progressId,id+'-events');assert.notEqual(book.storageKey,book.whisper.storageKey);
  assert.equal(new Set(story.chapters.map(c=>c.id)).size,count);assert.ok(story.chapters.every(c=>c.id.startsWith(id+'-event-')));
  assert.deepEqual(practice[id],original[id]);assert.equal(read('content/'+book.data).chapters.length,6);
  for(const c of story.chapters){assert.ok(!c.chat&&c.presentation.guideRanges.length>=2);let previous=-1;for(const [a,b]of c.presentation.guideRanges){assert.ok(a>previous&&b>=a&&b<c.blocks.length);previous=b;}}
 }
 const review=read(editorial+'review.json');for(const [file,digest]of Object.entries(review.protectedFiles))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),digest,file);
 assert.match(readFileSync(new URL('../'+stage+'index.html',import.meta.url),'utf8'),/name="reading-preview"/);
 assert.deepEqual(read(stage+'books/super-ya-events/story.json'),read('dist/books/super-ya-events/story.json'));
});
test('all new Han characters have aligned readings and reviewed contextual sounds',()=>{
 const sounds=read(stage+'readings.json'),paragraphs=[];
 for(const id of ['tata','karate'])for(const c of read(editorial+id+'/story.json').chapters)for(const text of [c.title,...c.blocks.map(b=>b.text)]){paragraphs.push(text);assert.equal(sounds[text].length,Array.from(text).length);Array.from(text).forEach((ch,i)=>{if(/\p{Script=Han}/u.test(ch))assert.ok(sounds[text][i],text);});}
 for(const [phrase,index,sound]of [['仍得',1,'ㄉㄟˇ'],['得讓',0,'ㄉㄟˇ'],['我得趕快',1,'ㄉㄟˇ'],['也許得',2,'ㄉㄟˇ'],['還是得',2,'ㄉㄟˇ'],['找得到',1,'˙ㄉㄜ'],['接得到',1,'˙ㄉㄜ'],['有空',1,'ㄎㄨㄥˋ'],['沒空',1,'ㄎㄨㄥˋ'],['興奮',0,'ㄒㄧㄥ'],['園長',1,'ㄓㄤˇ'],['擅長',1,'ㄔㄤˊ']]){
  const matches=paragraphs.filter(p=>p.includes(phrase));assert.ok(matches.length,phrase);for(const text of matches)for(let at=text.indexOf(phrase);at>=0;at=text.indexOf(phrase,at+1))assert.equal(sounds[text][at+index],sound,text);
 }
});
