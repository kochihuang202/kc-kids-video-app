import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readingCharacterCount} from '../../public/text-stats.js';

const here=fileURLToPath(new URL('.',import.meta.url)),root=path.resolve(here,'../..');
const opening=readFileSync(path.join(root,'editorial/child-trial-2026-10-20/SUPER_YA_前五個事件_孩子試讀版.md'),'utf8').trim();
const manuscript=opening+'\n\n'+readFileSync(path.join(here,'新增悄悄話.md'),'utf8').trim()+'\n';
const parse=text=>text.split(/^## /m).slice(1).map((section,i)=>{
 const [title,...parts]=section.trim().split(/\r?\n\r?\n/),blocks=[],guideRanges=[];let start=null;
 for(const raw of parts){
  const guide=raw.startsWith('>');
  if(guide&&start===null)start=blocks.length;
  if(!guide&&start!==null){guideRanges.push([start,blocks.length-1]);start=null;}
  for(const paragraph of raw.split(/\r?\n>\s*\r?\n/))blocks.push({type:'paragraph',text:paragraph.replace(/^> ?/gm,'').trim()});
 }
 if(start!==null)guideRanges.push([start,blocks.length-1]);
 return {id:`trial-opening-${i+1}`,title:title.trim(),blocks,presentation:{guideRanges,pictures:[],emphasis:{},events:[]}};
});
const chapters=parse(manuscript);if(chapters.length!==40)throw Error('必須是核定五篇加新增三十五篇');
const approved=JSON.parse(readFileSync(path.join(root,'editorial/child-trial-2026-10-20/story.json'),'utf8'));
if(JSON.stringify(chapters.slice(0,5))!==JSON.stringify(approved.chapters))throw Error('核定前五篇不能改動');
const destination=path.join(root,'content/books/super-ya-events');mkdirSync(destination,{recursive:true});
const story={title:'飛吧！SUPER YA！',subtitle:'巧虎的時光悄悄話',edition:'event-reflections-2026-10-20',welcome:'我想把那一天的事，說給你聽。',note:'',chapters};
writeFileSync(path.join(destination,'story.json'),JSON.stringify(story,null,2)+'\n');
writeFileSync(path.join(destination,'source.md'),manuscript);
const ui=JSON.parse(readFileSync(path.join(root,'content/books/super-ya-revisit/ui.json'),'utf8'));
ui.bookLabel='四十件小事，聽巧虎慢慢說';ui.storyTag='那一天的事，和我後來想到的事。';
writeFileSync(path.join(destination,'ui.json'),JSON.stringify(ui,null,2)+'\n');
const library=JSON.parse(readFileSync(path.join(root,'content/library.json'),'utf8')),first=library.books.find(b=>b.id==='super-ya');
first.subtitle=story.welcome;first.detail='40篇時光悄悄話，從一件小事開始。';
first.whisper={data:'books/super-ya-events/story.json',ui:'books/super-ya-events/ui.json',storageKey:'shimajiro-novel:super-ya-events:v1',progressId:'super-ya-events'};
const duplicate=library.books.find(b=>b.id==='super-ya-revisit');duplicate.hidden=true;duplicate.redirectTo='super-ya';
writeFileSync(path.join(root,'content/library.json'),JSON.stringify(library,null,2)+'\n');
const overridesPath=path.join(root,'content/readings-overrides.json'),overrides=JSON.parse(readFileSync(overridesPath,'utf8'));
Object.assign(overrides.phrases,JSON.parse(readFileSync(path.join(here,'readings.json'),'utf8')).phrases);
writeFileSync(overridesPath,JSON.stringify(overrides,null,2)+'\n');
const glossaryPath=path.join(root,'content/glossary.json'),glossary=JSON.parse(readFileSync(glossaryPath,'utf8'));
for(const [word,entry]of Object.entries(JSON.parse(readFileSync(path.join(here,'glossary.json'),'utf8'))))if(!glossary[word])glossary[word]=entry;
writeFileSync(glossaryPath,JSON.stringify(glossary,null,2)+'\n');
const counts=chapters.map(c=>({id:c.id,title:c.title,characters:readingCharacterCount(c.blocks.map(b=>b.text)),paragraphs:c.blocks.length}));
const original=readFileSync(path.join(root,'content/books/super-ya-revisit/original.md'));
writeFileSync(path.join(here,'review.json'),JSON.stringify({date:'2026-10-20',edition:story.edition,chapters:40,added:35,openingPreserved:true,totalCharacters:counts.reduce((n,c)=>n+c.characters,0),counts,sourceSha256:createHash('sha256').update(original).digest('hex'),checks:['前五篇與已上線試讀逐字、逐段及 ID 一致。','新篇章每篇只談一個事件；陪讀與情節交錯，使用既有引用段落。','影片 03:09 字幕為「真想坐坐看」，不能照逐字稿誤寫做機器人。','花田說話及道歉在先，返程看到修好娃娃屋在後。','最後的等待與爭吵不以娃娃屋當起因；不補充三天的技術理由。','推測以如果、可能、也許或巧虎的回想標示，不宣稱已知角色內心。'],limits:['未做實體 iPad 與孩子接受度測試。','情緒小怪獸是創作比喻，不是佛經原話；不把感受等同傷人行為。'],progress:{current:'super-ya-events:whisper',legacy:['super-ya:whisper','super-ya-revisit:whisper','super-ya-revisit:practice'],practiceUnchanged:'super-ya:practice',note:'新版使用獨立進度；舊紀錄留在原文件，不將舊版完成算為新版完成。'}},null,2)+'\n');
console.log(JSON.stringify({chapters:40,added:35,characters:counts.reduce((n,c)=>n+c.characters,0),source:path.join(destination,'source.md')},null,2));
