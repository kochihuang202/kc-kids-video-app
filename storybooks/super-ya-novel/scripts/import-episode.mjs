import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSubmission} from './validate-content.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [file,flag]=process.argv.slice(2);
if(!file||!['--preview','--publish'].includes(flag))throw Error('用法：node scripts/import-episode.mjs 交稿.json --preview（確認後才用 --publish）');
const bundle=JSON.parse(readFileSync(file,'utf8')),counts=validateSubmission(bundle),id=bundle.book.id;
const original=readFileSync(path.resolve(path.dirname(file),bundle.source.original));
const official=flag==='--publish',stage=path.join(root,'output/drafts',id),content=path.join(stage,'content');
const library=JSON.parse(readFileSync(path.join(root,'content/library.json')));
if(library.books.some(b=>b.id===id))throw Error('識別碼已存在，不允許覆寫既有作品');
if(official&&bundle.editorial.unresolvedCritical?.length)throw Error('關鍵情節尚待確認，不能正式上架');
mkdirSync(stage,{recursive:true});cpSync(path.join(root,'content'),content,{recursive:true});
const book={...bundle.book,data:`books/${id}/story.json`,ui:`books/${id}/ui.json`,storageKey:`shimajiro-novel:${id}:v1`,practice:`practice.json#${id}`,practiceSource:`books/${id}`};
const directory=path.join(content,'books',id);mkdirSync(directory,{recursive:true});
const save=(name,v)=>writeFileSync(path.join(content,name),JSON.stringify(v,null,2)+'\n');
writeFileSync(path.join(directory,'original.md'),original);writeFileSync(path.join(directory,'source.md'),bundle.manuscript);
save(`books/${id}/evidence.json`,{...bundle.source,original:'original.md',sha256:createHash('sha256').update(original).digest('hex'),editorial:bundle.editorial});
save(`books/${id}/story.json`,bundle.story);save(`books/${id}/ui.json`,bundle.ui||{});
const passages={...bundle.practice,scenes:bundle.practice.scenes.map(({questions,...scene})=>scene)},questions={},answers={};
for(const scene of bundle.practice.scenes){questions[scene.id]=scene.questions.story.map(({correct,evidence,hints,why,...q})=>q);answers[scene.id]=scene.questions.story.map(({correct,evidence,hints,why})=>({correct,evidence,hints,why}));}
save(`books/${id}/practice-passages.json`,passages);save(`books/${id}/practice-questions.json`,questions);save(`books/${id}/practice-answers.json`,answers);
const practice=JSON.parse(readFileSync(path.join(content,'practice.json')));practice[id]=bundle.practice;save('practice.json',practice);
const glossary=JSON.parse(readFileSync(path.join(content,'glossary.json')));for(const [word,item]of Object.entries(bundle.glossary||{})){if(glossary[word]&&JSON.stringify(glossary[word])!==JSON.stringify(item))throw Error('詞義衝突，先校訂：'+word);glossary[word]=item;}save('glossary.json',glossary);
library.books.push(book);save('library.json',library);
const overrides=JSON.parse(readFileSync(path.join(content,'readings-overrides.json')));for(const kind of ['characters','phrases'])Object.assign(overrides[kind],bundle.readings?.[kind]||{});save('readings-overrides.json',overrides);
const dist=path.join(stage,'dist');
const run=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,READER_CONTENT:content,READER_DIST:dist,READER_PREVIEW:'1'}});if(run.status)process.exit(run.status);
writeFileSync(path.join(directory,'delivery.md'),`# ${book.title}\n\n悄悄話 ${counts.whisper} 篇；理解 ${counts.practice} 單元。\n\n${bundle.editorial.sourceReview}\n\n${bundle.editorial.phoneticReview}\n\n${bundle.editorial.glossaryReview}\n`);
if(official){
 for(const file of ['library.json','practice.json','glossary.json','readings-overrides.json'])cpSync(path.join(content,file),path.join(root,'content',file));
 cpSync(directory,path.join(root,'content/books',id),{recursive:true});
 const result=spawnSync(process.execPath,[path.join(root,'scripts/build.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,READER_CONTENT:path.join(root,'content'),READER_DIST:path.join(root,'dist'),READER_PREVIEW:''}});if(result.status)process.exit(result.status);
}
console.log(official?'已加入本機正式書架，尚未部署。':`預覽已建立：${dist}\nPowerShell：$env:READER_DIST='${dist}'; $env:PORT=4179; node scripts/serve.mjs\n開啟 http://127.0.0.1:4179/?book=${id}&preview=1\n預覽不會寫入正式進度。`);
