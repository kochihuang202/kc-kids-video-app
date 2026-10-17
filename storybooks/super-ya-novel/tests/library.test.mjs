import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=n=>JSON.parse(readFileSync(new URL('../'+n,import.meta.url)));
test('library preserves SUPER YA and adds the complete Kiki manuscript as an independent book',()=>{
 const library=read('dist/library.json');
 assert.deepEqual(library.books.map(b=>b.id),['super-ya','kiki','tata','karate','super-ya-revisit']);
 assert.notEqual(library.books[0].storageKey,library.books[1].storageKey);
 assert.equal(library.books[0].storageKey,'shimajiro-novel:v2');
 const story=read('dist/books/kiki/story.json');assert.equal(story.chapters.length,9);
 const source=readFileSync(new URL('../content/books/kiki/source.md',import.meta.url));
 assert.equal(story.source.sha256,createHash('sha256').update(source).digest('hex'));
 const rebuilt=story.source.preamble+'\n\n'+story.chapters.map(c=>c.source.heading+'\n\n'+c.blocks.map(b=>b.type==='heading'?'## '+b.text:b.text).join('\n\n')).join('\n\n---\n\n');
 assert.equal(rebuilt,source.toString('utf8').replace(/\r\n/g,'\n').trim());
 const old=read('dist/story.json');assert.equal(old.chapters.length,5);
 assert.ok(old.chapters[4].paragraphs.some(p=>p.includes('你自己有沒有發現什麼')));
});
test('Kiki contextual phonetics preserve modal dei, teaching jiao and classifier zhi',()=>{
 const r=read('dist/readings.json');
 for(const [phrase,index,sound]of [['當然得',2,'ㄉㄟˇ'],['總得',1,'ㄉㄟˇ'],['就得',1,'ㄉㄟˇ'],['得第一名',0,'ㄉㄜˊ'],['教她',0,'ㄐㄧㄠ'],['教琪琪',0,'ㄐㄧㄠ'],['那只花瓶',1,'ㄓ'],['著急',0,'ㄓㄠˊ'],['珍藏',1,'ㄘㄤˊ']]){
  const found=Object.entries(r).filter(([text])=>text.includes(phrase));assert.ok(found.length,phrase);
  for(const [text,sounds]of found){let at=text.indexOf(phrase);while(at>=0){assert.equal(sounds[at+index],sound,phrase+' in '+text);at=text.indexOf(phrase,at+1);}}
 }
});
