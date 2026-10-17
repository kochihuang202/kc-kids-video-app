import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const story = JSON.parse(readFileSync(new URL('../content/story.json', import.meta.url)));
test('five complete source chapters without added conversational branches', () => {
  assert.equal(story.chapters.length, 5);
  const count = story.chapters.flatMap(c => c.paragraphs).join('').match(/\p{Script=Han}/gu).length;
  assert.ok(count >= 14000 && count <= 16000, `actual length ${count}`);
  assert.equal(new Set(story.chapters.map(c => c.id)).size, 5);
  for (const c of story.chapters) {
    assert.ok(c.paragraphs.length >= 6);
    assert.equal(c.chat,undefined);
  }
});
test('reader delivers complete local app and accessible reading controls', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /lang="zh-Hant"/);
  assert.match(html, /app\.js/);
  assert.ok(existsSync(new URL('../dist/readings.json', import.meta.url)));
  const js = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.match(js, /aria-pressed/);
  assert.match(readFileSync(new URL('../dist/storage.js',import.meta.url),'utf8'), /localStorage/);
  assert.equal(JSON.parse(readFileSync(new URL('../dist/ui.json',import.meta.url))).mapTitle,'一起回想這一章');
});
test('every Chinese character in delivered reading text has an aligned phonetic reading',()=>{
  const readings=JSON.parse(readFileSync(new URL('../dist/readings.json',import.meta.url)));
  for(const [text,sounds] of Object.entries(readings)){
    assert.equal(Array.from(text).length,sounds.length);
    Array.from(text).forEach((ch,i)=>{
      if(/\p{Script=Han}/u.test(ch))assert.match(sounds[i],/^[˙]?[ㄅ-ㄩ]+[ˊˇˋ]?$/,`${ch} in ${text}`);
    });
  }
});
test('contextual readings distinguish rereading, grammatical particles, destinations and responsibility',()=>{
  const readings=JSON.parse(readFileSync(new URL('../dist/readings.json',import.meta.url)));
  for(const [word,index,expected] of [['重新',0,'ㄔㄨㄥˊ'],['看著',1,'˙ㄓㄜ'],['地方',0,'ㄉㄧˋ'],['得等',0,'ㄉㄟˇ'],['覺得',1,'˙ㄉㄜ'],['處理',0,'ㄔㄨˇ'],['突然',0,'ㄊㄨˊ'],['危險',0,'ㄨㄟˊ'],['還在',0,'ㄏㄞˊ'],['彈跳',0,'ㄊㄢˊ'],['仔細',0,'ㄗˇ'],['心血',1,'ㄒㄧㄝˇ'],['幾乎',0,'ㄐㄧ'],['幾次',0,'ㄐㄧˇ'],['為什麼',0,'ㄨㄟˋ'],['美麗',1,'ㄌㄧˋ'],['擅長',1,'ㄔㄤˊ'],['教過',0,'ㄐㄧㄠ'],['舞蹈',1,'ㄉㄠˋ'],['研究',1,'ㄐㄧㄡˋ'],['得由',0,'ㄉㄟˇ']]){
    const entries=Object.entries(readings).filter(([s])=>s.includes(word));assert.ok(entries.length,word);
    for(const [text,sounds] of entries){let at=text.indexOf(word);while(at!==-1){assert.equal(sounds[at+index],expected,`${word} in ${text}`);at=text.indexOf(word,at+1);}}
  }
});
