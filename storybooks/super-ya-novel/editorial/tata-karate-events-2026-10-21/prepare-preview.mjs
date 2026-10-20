import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readingCharacterCount} from '../../public/text-stats.js';
const here=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(here,'../..'),stage=path.join(root,'output/drafts/tata-karate-events-2026-10-21'),content=path.join(stage,'content'),dist=path.join(stage,'dist');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const protectedFiles=['content/library.json','content/practice.json','content/books/tata/story.json','content/books/tata/source.md','content/books/tata/practice-passages.json','content/books/tata/practice-questions.json','content/books/tata/practice-answers.json','content/books/karate/story.json','content/books/karate/source.md','content/books/karate/practice-passages.json','content/books/karate/practice-questions.json','content/books/karate/practice-answers.json','worker/generated.mjs','dist/release.json'];
const digest=file=>createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex'),before=Object.fromEntries(protectedFiles.map(file=>[file,digest(file)]));
mkdirSync(stage,{recursive:true});cpSync(path.join(root,'content'),content,{recursive:true});
const library=read(path.join(content,'library.json')),overrides=read(path.join(content,'readings-overrides.json')),glossary=read(path.join(content,'glossary.json')),reports=[];
const drafts=[];
for(const [id,count,welcome]of [['tata',28,'那次去海邊，有些事我後來才想明白。'],['karate',32,'那一天，我們想幫小雅，也有幫得太急的時候。']]){
 const manuscript=readFileSync(path.join(here,id+'.md'),'utf8'),book=library.books.find(b=>b.id===id);
 const chapters=manuscript.split(/^## /m).slice(1).map((section,i)=>{
  const [title,...parts]=section.trim().split(/\r?\n\r?\n/),blocks=[],guideRanges=[];let start=null;
  for(const raw of parts){const guide=raw.startsWith('>');if(guide&&start===null)start=blocks.length;if(!guide&&start!==null){guideRanges.push([start,blocks.length-1]);start=null;}for(const part of raw.split(/\r?\n>\s*\r?\n/))blocks.push({type:'paragraph',text:part.replace(/^> ?/gm,'').trim()});}
  if(start!==null)guideRanges.push([start,blocks.length-1]);
  return {id:`${id}-event-${String(i+1).padStart(2,'0')}`,title:title.trim(),blocks,presentation:{guideRanges,pictures:[],emphasis:{},events:[]}};
 });
 if(chapters.length!==count)throw Error('事件篇數不符：'+id);
 const story={title:book.title,subtitle:'巧虎的時光悄悄話',edition:'event-reflections-2026-10-21',welcome,note:'',chapters};
 const ui={...read(path.join(content,book.ui)),bookLabel:`${count}件小事，聽巧虎慢慢說`,storyTag:'那一天的事，和我後來想到的事。',guideHint:''};
 const draft=path.join(here,id),target=path.join(content,'books',id+'-events');mkdirSync(draft,{recursive:true});mkdirSync(target,{recursive:true});
 for(const dir of [draft,target]){writeFileSync(path.join(dir,'story.json'),JSON.stringify(story,null,2)+'\n');writeFileSync(path.join(dir,'ui.json'),JSON.stringify(ui,null,2)+'\n');}
 writeFileSync(path.join(target,'source.md'),manuscript);
 book.whisper={data:`books/${id}-events/story.json`,ui:`books/${id}-events/ui.json`,storageKey:`shimajiro-novel:${id}-events:v1`,progressId:`${id}-events`};
 book.subtitle=welcome;book.detail=`${count}篇時光悄悄話，從一件小事開始。`;
 const counts=chapters.map(c=>({id:c.id,title:c.title,characters:readingCharacterCount(c.blocks.map(b=>b.text)),paragraphs:c.blocks.length}));
 reports.push({id,title:book.title,parts:count,characters:counts.reduce((n,c)=>n+c.characters,0),counts,sourceSha256:digest(`content/books/${id}/original.md`),legacyProgress:id+':whisper',newProgress:id+'-events:whisper',practicePreserved:id+':practice'});
 drafts.push({id,story});
}
// Apply only reviewed word-in-sentence corrections to the new paragraphs.
const fixes=read(path.join(here,'readings.json')).phrases;
for(const {story}of drafts)for(const c of story.chapters)for(const text of [c.title,...c.blocks.map(b=>b.text)]){
 const changes={};
 for(const [phrase,values]of Object.entries(fixes))for(let at=text.indexOf(phrase);at>=0;at=text.indexOf(phrase,at+1))for(const [offset,sound]of Object.entries(values))changes[at+Number(offset)]=sound;
 if(Object.keys(changes).length)overrides.phrases[text]={...overrides.phrases[text],...changes};
}
for(const [word,entry]of Object.entries(read(path.join(here,'glossary.json'))))if(!glossary[word])glossary[word]=entry;
for(const [name,data]of [['library.json',library],['readings-overrides.json',overrides],['glossary.json',glossary]])writeFileSync(path.join(content,name),JSON.stringify(data,null,2)+'\n');
const build=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,READER_CONTENT:content,READER_DIST:dist,READER_PREVIEW:'1'}});process.stdout.write(build.stdout||'');process.stderr.write(build.stderr||'');if(build.status)process.exit(build.status);
const annotations=read(path.join(dist,'readings.json'));
for(const {id,story}of drafts){const lines=[];for(const c of story.chapters){lines.push('# '+c.title);for(const text of [c.title,...c.blocks.map(b=>b.text)]){const chars=Array.from(text),sounds=annotations[text];if(!sounds||sounds.length!==chars.length||chars.some((ch,i)=>/\p{Script=Han}/u.test(ch)&&!sounds[i]))throw Error('注音缺漏：'+text);lines.push(chars.map((ch,i)=>sounds[i]?`${ch}(${sounds[i]})`:ch).join(''));}}writeFileSync(path.join(here,id,'注音校對.txt'),lines.join('\n\n')+'\n');}
for(const file of protectedFiles)if(digest(file)!==before[file])throw Error('正式內容不能意外改動：'+file);
const originalPractice=read(path.join(root,'dist/practice.json')),previewPractice=read(path.join(dist,'practice.json'));
for(const id of ['tata','karate'])if(JSON.stringify(previewPractice[id])!==JSON.stringify(originalPractice[id]))throw Error('閱讀理解不能改動：'+id);
writeFileSync(path.join(dist,'_redirects'),'/read /?book=super-ya&mode=whisper&preview=1 302\n');
writeFileSync(path.join(here,'review.json'),JSON.stringify({date:'2026-10-21',status:'完整重寫試讀，正式版與既有紀錄保留。',reports,protectedFiles:before,phonetics:'逐字對齊及全稿語境輸出；人工重點校對多音字及輕聲，不宣稱外部逐字審定。',limits:['未實機測試 iPad。','未做孩子接受度測試。'],preview:{dist,content}},null,2)+'\n');
console.log(JSON.stringify(reports.map(({id,parts,characters})=>({id,parts,characters})),null,2));
