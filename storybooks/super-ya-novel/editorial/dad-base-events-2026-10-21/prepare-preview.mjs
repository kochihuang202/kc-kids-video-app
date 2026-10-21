import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSubmission} from '../../scripts/validate-content.mjs';
import {readingCharacterCount} from '../../public/text-stats.js';
import {dad,base} from './practice.mjs';
import {dadEvidence,baseEvidence} from './evidence.mjs';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(here,'../..');
const stage=path.join(root,'output/drafts/dad-base-events-2026-10-21'),content=path.join(stage,'content'),dist=path.join(stage,'dist');
const read=p=>JSON.parse(readFileSync(p,'utf8')),save=(p,v)=>writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function hashTree(dir){return Object.fromEntries(readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?Object.entries(hashTree(p)):[[path.relative(root,p),sha(readFileSync(p))]];}));}
const protectedFiles={...hashTree(path.join(root,'content')),...Object.fromEntries(['worker/generated.mjs','dist/release.json'].map(p=>[p,sha(readFileSync(path.join(root,p)))]))};
function run(args,env={}){const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,...env}});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status)throw Error('Command failed: '+args.join(' '));}
// Retain the already delivered Tata / karate trial editions rather than rebuilding
// the trial shelf from formal content and silently reverting those manuscripts.
run(['editorial/tata-karate-events-2026-10-21/prepare-preview.mjs']);
mkdirSync(stage,{recursive:true});cpSync(path.join(root,'output/drafts/tata-karate-events-2026-10-21/content'),content,{recursive:true});
const library=read(path.join(content,'library.json')),practice=read(path.join(content,'practice.json')),overrides=read(path.join(content,'readings-overrides.json')),glossary=read(path.join(content,'glossary.json'));
const fixes=read(path.join(here,'readings.json')).phrases,bundles=[],reports=[];
function parse(manuscript,id){return manuscript.split(/^## /m).slice(1).map((section,i)=>{
 const [title,...parts]=section.trim().split(/\r?\n\r?\n/),blocks=[],guideRanges=[];let start=null;
 for(const raw of parts){const guide=raw.startsWith('>');if(guide&&start===null)start=blocks.length;if(!guide&&start!==null){guideRanges.push([start,blocks.length-1]);start=null;}for(const p of raw.split(/\r?\n>\s*\r?\n/))blocks.push({type:'paragraph',text:p.replace(/^> ?/gm,'').trim()});}
 if(start!==null)guideRanges.push([start,blocks.length-1]);
 return {id:id+'-event-'+String(i+1).padStart(2,'0'),title:title.trim(),blocks,presentation:{guideRanges,pictures:[],emphasis:{},events:[]}};
});}
function strings(value,out=[]){if(typeof value==='string')out.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(v=>strings(v,out));return out;}
for(const [id,title,number,count,data,evidence,welcome]of [
 ['dad-shampoo','小花為什麼說不要','05',26,dad,dadEvidence,'她說不要的時候，我們是不是猜得太快了？'],
 ['secret-base','男生最棒：我們的祕密基地','06',30,base,baseEvidence,'那個好玩的基地，也有讓我的朋友為難的時候。']
]){
 const dir=path.join(here,id),target=path.join(content,'books',id);mkdirSync(dir,{recursive:true});mkdirSync(target,{recursive:true});
 const originalPath=path.join(dir,'original.md');if(!existsSync(originalPath))cpSync(path.join('C:/Users/ji3cp/Documents/巧虎故事書',evidence.originalFile),originalPath);
 const original=readFileSync(originalPath),manuscript=readFileSync(path.join(here,id+'.md'),'utf8'),chapters=parse(manuscript,id);
 if(chapters.length!==count||evidence.chapterTimes.length!==count)throw Error(id+' chapter count / evidence mismatch');
 const image=id==='secret-base'?'assets/secret-base-2026-10-21.jpg':'assets/shimajiro-friends.png';
 const book={id,title,number,subtitle:welcome,detail:count+'篇時光悄悄話・'+data.scenes.length+'單元閱讀理解',data:`books/${id}/story.json`,ui:`books/${id}/ui.json`,image,coverImage:image,imageAlt:id==='secret-base'?'巧虎、桃樂比、小可和多比在祕密基地裡':'巧虎與朋友的陪讀插圖',storageKey:`shimajiro-novel:${id}:v1`,practice:`practice.json#${id}`,practiceSource:`books/${id}`};
 const story={title,subtitle:'巧虎的時光悄悄話',edition:'event-reflections-2026-10-21',welcome,note:'',chapters};
 const ui={...read(path.join(content,'books/tata-events/ui.json')),bookLabel:count+'件小事，聽巧虎慢慢說',storyTag:'那一天的事，和我後來想到的事。',guideHint:''};
 const counts=chapters.map((c,i)=>({id:c.id,title:c.title,sourceTime:evidence.chapterTimes[i],characters:readingCharacterCount(c.blocks.map(b=>b.text))}));
 const editorial={sourceReview:'原文逐字稿優先；事件與逐篇時點見evidence.json。'+(evidence.videoReview||evidence.titleStatus)+'。正文心理分享用如果／可能等區分，不補定不明動作或角色內心。',phoneticReview:'逐字產生並輸出校對檔，重點檢查洗髮、看守、重建、得、當成與專名；不宣稱外部逐字認證。',glossaryReview:'繁體、臺灣用語及兒童詞義；不覆寫既有作品同名詞條。洗髮精依教育部字音ㄒㄧˇ ㄈㄚˇ ㄐㄧㄥ。',unresolvedCritical:[]};
 const bundle={book,source:{...evidence,original:id+'/original.md',sha256:sha(original)},editorial,manuscript,story,practice:data,ui,glossary:read(path.join(here,'glossary.json')),readings:{characters:{},phrases:{}}};
 validateSubmission(bundle);
 for(const [name,value]of [['story.json',story],['ui.json',ui],['evidence.json',{...bundle.source,original:'original.md',editorial}],['practice-passages.json',{title:data.title,scenes:data.scenes.map(({questions,...s})=>s)}],['practice-questions.json',Object.fromEntries(data.scenes.map(s=>[s.id,s.questions.story.map(({correct,evidence,hints,why,...q})=>q)]))],['practice-answers.json',Object.fromEntries(data.scenes.map(s=>[s.id,s.questions.story.map(({correct,evidence,hints,why})=>({correct,evidence,hints,why}))]))]]){save(path.join(dir,name),value);save(path.join(target,name),value);}
 cpSync(originalPath,path.join(target,'original.md'));writeFileSync(path.join(target,'source.md'),manuscript);
 library.books.push(book);practice[id]=data;bundles.push(bundle);
 reports.push({id,title,parts:count,characters:counts.reduce((n,c)=>n+c.characters,0),practiceUnits:data.scenes.length,practiceQuestions:data.scenes.reduce((n,s)=>n+s.questions.story.length,0),sourceSha256:sha(original),counts});
 const texts=strings([story,ui,book,data]);
 for(const text of texts){const changes={};for(const [phrase,values]of Object.entries(fixes).sort((a,b)=>a[0].length-b[0].length))for(let at=text.indexOf(phrase);at>=0;at=text.indexOf(phrase,at+1))for(const [offset,sound]of Object.entries(values))changes[at+Number(offset)]=sound;if(Object.keys(changes).length){overrides.phrases[text]={...overrides.phrases[text],...changes};bundle.readings.phrases[text]=changes;}}
 save(path.join(here,id+'-submission.json'),bundle);
}
for(const [word,item]of Object.entries(read(path.join(here,'glossary.json'))))if(!glossary[word])glossary[word]=item;
for(const [name,data]of [['library.json',library],['practice.json',practice],['glossary.json',glossary],['readings-overrides.json',overrides]])save(path.join(content,name),data);
run(['scripts/build.mjs'],{READER_CONTENT:content,READER_DIST:dist,READER_PREVIEW:'1'});
const assets=path.join(here,'assets');if(existsSync(assets))cpSync(assets,path.join(dist,'assets'),{recursive:true});
const annotations=read(path.join(dist,'readings.json'));
for(const bundle of bundles){const lines=[];for(const text of strings([bundle.story,bundle.practice,bundle.book,bundle.ui])){if(!/\p{Script=Han}/u.test(text))continue;const chars=Array.from(text),sounds=annotations[text];if(!sounds||sounds.length!==chars.length||chars.some((ch,i)=>/\p{Script=Han}/u.test(ch)&&!sounds[i]))throw Error('Missing aligned phonetics: '+text);lines.push(chars.map((ch,i)=>sounds[i]?`${ch}(${sounds[i]})`:ch).join(''));}writeFileSync(path.join(here,bundle.book.id,'注音校對.txt'),lines.join('\n\n')+'\n');}
for(const [file,digest]of Object.entries(protectedFiles))if(sha(readFileSync(path.join(root,file)))!==digest)throw Error('Formal file changed: '+file);
const previous=path.join(root,'output/drafts/tata-karate-events-2026-10-21/dist');for(const id of ['tata','karate']){const file=`books/${id}-events/story.json`;if(sha(readFileSync(path.join(dist,file)))!==sha(readFileSync(path.join(previous,file))))throw Error('Previous trial edition changed: '+id);}
writeFileSync(path.join(dist,'_redirects'),'/read /?book=super-ya&mode=whisper&preview=1 302\n');
save(path.join(here,'review.json'),{date:'2026-10-21',status:'兩份完整新作，試讀專用，未加入正式書架。',reports,protectedFiles,retainedTrial:{tata:28,karate:32},limits:['小花這集未確認相應影片，依原逐字稿，不補未核對畫面。','祕密基地影片抽格核對，不是逐字聽打。','沒有實體iPad或孩子接受度測試。']});
console.log(JSON.stringify(reports.map(({id,parts,characters,practiceUnits,practiceQuestions})=>({id,parts,characters,practiceUnits,practiceQuestions})),null,2));
