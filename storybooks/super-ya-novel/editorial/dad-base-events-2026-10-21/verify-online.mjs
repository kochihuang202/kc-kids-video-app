import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(here,'../..'),dist=path.join(project,'output/drafts/dad-base-events-2026-10-21/dist');
const trial='https://shimajiro-reading-trial.ji3cp31p4.workers.dev',formal='https://shimajiro-reading.ji3cp31p4.workers.dev';
const local=async file=>JSON.parse(await readFile(path.join(dist,file),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function get(base,file,kind='json'){const r=await fetch(base+'/'+file,{cache:'no-store'});assert.equal(r.status,200,file);return kind==='json'?r.json():kind==='text'?r.text():Buffer.from(await r.arrayBuffer());}
const [release,formalRelease,library,practice,html]=await Promise.all([get(trial,'release.json'),get(formal,'release.json'),get(trial,'library.json'),get(trial,'practice.json'),get(trial,'index.html','text')]);
assert.equal(release.id,(await local('release.json')).id);assert.equal(formalRelease.id,'0fc51c77b6c1');
assert.deepEqual(library,await local('library.json'));assert.deepEqual(practice,await local('practice.json'));assert.match(html,/name="reading-preview" content="true"/);
assert.equal(library.books.filter(b=>!b.hidden).length,6);
const books=[];
for(const [id,whisper,units,questions]of [['dad-shampoo',26,6,24],['secret-base',30,7,29]]){
 const book=library.books.find(b=>b.id===id),story=await get(trial,book.data);assert.deepEqual(story,await local(book.data));assert.equal(story.chapters.length,whisper);assert.equal(practice[id].scenes.length,units);assert.equal(practice[id].scenes.reduce((n,s)=>n+s.questions.story.length,0),questions);
 books.push({id,whisper,units,questions,url:trial+'/?book='+id+'&preview=1'});
}
for(const [id,count]of [['tata',28],['karate',32]]){const book=library.books.find(b=>b.id===id),story=await get(trial,book.whisper.data);assert.equal(story.chapters.length,count);assert.deepEqual(story,await local(book.whisper.data));}
const asset='assets/secret-base-2026-10-21.jpg';assert.equal(sha(await get(trial,asset,'bytes')),sha(await readFile(path.join(dist,asset))));
const evidence={checkedAt:new Date().toISOString(),worker:'shimajiro-reading-trial',workerVersion:process.argv[2]||null,release:release.id,formalRelease:formalRelease.id,formalUnchanged:true,preview:true,retainedTrial:{tata:28,karate:32},books};
await writeFile(path.join(here,'deployment.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
