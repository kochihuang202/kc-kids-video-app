import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(here,'../..');
const trial='https://shimajiro-reading-trial.ji3cp31p4.workers.dev';
const formal='https://shimajiro-reading.ji3cp31p4.workers.dev';
async function get(base,file,json=true){
  const response=await fetch(base+'/'+file,{cache:'no-store'});
  assert.equal(response.status,200,file+' HTTP status');
  return json?response.json():response.text();
}
const [release,formalRelease,library,html,practice]=await Promise.all([
  get(trial,'release.json'),get(formal,'release.json'),get(trial,'library.json'),
  get(trial,'index.html',false),get(trial,'practice.json')
]);
const expected=JSON.parse(await readFile(path.join(project,'output/drafts/tata-karate-events-2026-10-21/dist/release.json'),'utf8'));
assert.equal(release.id,expected.id);
assert.equal(formalRelease.id,'0fc51c77b6c1','formal release remains unchanged');
assert.match(html,/<meta[^>]+name="reading-preview"[^>]+content="true"/);
assert.deepEqual(practice,JSON.parse(await readFile(path.join(project,'dist/practice.json'),'utf8')));
const books=[];
for(const [id,count]of [['tata',28],['karate',32]]){
  const book=library.books.find(book=>book.id===id);
  assert.equal(book.modes.whisper,count);
  const story=await get(trial,book.whisper.data);
  assert.equal(story.chapters.length,count);
  assert.deepEqual(story,JSON.parse(await readFile(path.join(here,id,'story.json'),'utf8')));
  books.push({id,chapters:count,url:trial+'/?book='+id+'&mode=whisper&preview=1'});
}
const evidence={checkedAt:new Date().toISOString(),worker:'shimajiro-reading-trial',workerVersion:'2e0ed7fb-fb04-443c-9847-ece8cf6dddbd',release:release.id,formalRelease:formalRelease.id,formalUnchanged:true,preview:true,practiceUnchanged:true,books};
await writeFile(path.join(here,'deployment.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
