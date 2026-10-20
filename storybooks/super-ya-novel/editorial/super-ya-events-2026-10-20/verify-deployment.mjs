import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(here,'../..'),production='https://shimajiro-reading.ji3cp31p4.workers.dev',trial='https://shimajiro-reading-trial.ji3cp31p4.workers.dev';
const baseline=path.join(root,'output/events-production-before.json'),hash=v=>createHash('sha256').update(v).digest('hex');
const get=async url=>{const r=await fetch(url,{cache:'no-store'});assert.equal(r.status,200,url);return Buffer.from(await r.arrayBuffer());};
const json=async url=>JSON.parse(await get(url));
if(process.argv.includes('--capture-before')){
 const progress=await json(production+'/api/progress');mkdirSync(path.dirname(baseline),{recursive:true});
 writeFileSync(baseline,JSON.stringify({release:await json(production+'/release.json'),practice:hash(await get(production+'/practice.json')),documents:Object.fromEntries(Object.entries(progress.documents).map(([id,doc])=>[id,hash(JSON.stringify(doc))]))},null,2));
 console.log('已保存正式版本、理解內容與紀錄雜湊；未寫入正式進度。');
}else{
 const [mainVersion,trialVersion]=process.argv.slice(2);for(const v of [mainVersion,trialVersion])assert.match(v||'',/^[a-f0-9-]{36}$/);
 const before=JSON.parse(readFileSync(baseline,'utf8')),reports=[];
 for(const [origin,dist]of [[production,path.join(root,'dist')],[trial,path.join(root,'output/drafts/super-ya-events-2026-10-20/dist')]]){
  const files=['app.js','parent.js','library.json','practice.json','readings.json','glossary.json','books/super-ya-events/story.json','books/super-ya-events/ui.json','release.json','index.html'];
  for(const name of files)assert.equal(hash(await get(origin+'/'+name)),hash(readFileSync(path.join(dist,name))),origin+'/'+name);
  const library=await json(origin+'/library.json'),first=library.books[0],story=await json(origin+'/'+first.whisper.data);
  assert.equal(first.id,'super-ya');assert.equal(library.books.filter(b=>!b.hidden).length,4);assert.equal(story.chapters.length,40);assert.equal(story.edition,'event-reflections-2026-10-20');
  reports.push({origin,release:await json(origin+'/release.json'),verifiedAssets:files.length,chapters:40});
 }
 const health=await json(production+'/api/health');assert.equal(health.version,reports[0].release.id);assert.equal(health.cloud,true);
 assert.equal(hash(await get(production+'/practice.json')),before.practice,'既有閱讀理解不得變更');
 const redirect=await fetch(trial+'/read',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(new URL(redirect.headers.get('location'),trial).searchParams.get('book'),'super-ya');
 const documents=(await json(production+'/api/progress')).documents;
 const legacyDocumentsUnchanged=Object.entries(before.documents).every(([id,digest])=>documents[id]&&hash(JSON.stringify(documents[id]))===digest);
 assert.ok(legacyDocumentsUnchanged,'發布過程原有進度不得變更');
 const report={publishedAt:new Date().toISOString(),mainVersion,trialVersion,reports,previousRelease:before.release.id,practiceUnchanged:true,legacyDocumentsUnchanged,checks:{node:23,chromiumFlows:22,webkitTouchChecks:8,newManuscriptChecks:103,cloudWrites:'isolated local D1 only'},limits:['未做實體 iPad 與孩子接受度測試。']};
 writeFileSync(path.join(here,'deployment.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
