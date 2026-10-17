import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateBook,validateSubmission} from '../scripts/validate-content.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
export function fixture(){
 const story=read('content/books/kiki/story.json'),practice=read('content/practice.json').kiki;
 story.chapters=story.chapters.slice(0,2);practice.scenes=practice.scenes.slice(0,3);practice.scenes.forEach(s=>s.evidenceReview='測試資料：逐題依段落索引驗證');
 return {book:{id:'test-different-counts',number:'99',title:'測試作品',subtitle:'只供測試',detail:'兩篇悄悄話、三單元理解',image:'assets/shimajiro-friends.png',imageAlt:'測試封面',data:'books/test-different-counts/story.json'},story,practice,source:{original:'../../content/books/kiki/original.md',events:[{event:'測試事件'}],uncertainties:[]},editorial:{sourceReview:'結構測試，非新稿人工校對',phoneticReview:'沿用核定字音測試資料',glossaryReview:'沿用核定詞語',unresolvedCritical:[]},manuscript:'# 測試完整稿',glossary:{}};
}
test('independent mode counts and malformed answers / evidence / source are checked',()=>{
 const f=fixture();assert.deepEqual(validateSubmission(f),{whisper:2,practice:3});
 for(const mutate of [b=>b.practice.scenes[0].questions.story[0].evidence=[999],b=>b.practice.scenes[0].questions.story[0].correct=99,b=>b.story.chapters[0].presentation.guideRanges=[[0,999]],b=>delete b.source,b=>b.book.data='../outside.json']){const b=structuredClone(f);mutate(b);assert.throws(()=>validateSubmission(b));}
});
test('question counts follow each unit and additional answers still require valid evidence',()=>{
 const f=fixture();
 f.practice.scenes[1].questions.story.push(structuredClone(f.practice.scenes[1].questions.story[0]));
 f.practice.scenes[2].questions.story.push(...[0,2].map(i=>structuredClone(f.practice.scenes[2].questions.story[i])));
 assert.deepEqual(f.practice.scenes.map(s=>s.questions.story.length),[3,4,5]);
 assert.deepEqual(validateSubmission(f),{whisper:2,practice:3});
 f.practice.scenes[2].questions.story.at(-1).evidence=[999];
 assert.throws(()=>validateSubmission(f),/答案根據/);
});
test('preview importer builds a separate catalog and never changes production registry or manuscript',()=>{
 const file=new URL('../output/fixture-submission.json',import.meta.url);mkdirSync(new URL('../output/',import.meta.url),{recursive:true});
 const f=fixture();f.source.original='../content/books/kiki/original.md';writeFileSync(file,JSON.stringify(f));
 const paths=['content/library.json','worker/generated.mjs','content/books/kiki/source.md'],before=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const result=spawnSync(process.execPath,['scripts/import-episode.mjs',fileURLToPath(file),'--preview'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 paths.forEach((p,i)=>assert.equal(readFileSync(new URL('../'+p,import.meta.url),'utf8'),before[i]));
 const preview=read('output/drafts/test-different-counts/dist/library.json').books.find(b=>b.id===f.book.id);assert.deepEqual(preview.modes,{whisper:2,practice:3});
 assert.match(readFileSync(new URL('../output/drafts/test-different-counts/dist/index.html',import.meta.url),'utf8'),/name="reading-preview"/);
 assert.ok(existsSync(new URL('../output/drafts/test-different-counts/content/books/test-different-counts/original.md',import.meta.url)));
});
