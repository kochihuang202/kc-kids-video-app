import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readingCharacterCount} from '../../public/text-stats.js';

const directory=fileURLToPath(new URL('.',import.meta.url));
const root=path.resolve(directory,'../..');
const manuscript=readFileSync(path.join(directory,'SUPER_YA_前五個事件_孩子試讀版.md'),'utf8');
const stage=path.join(root,'output/drafts/super-ya-first-five-2026-10-20');
const content=path.join(stage,'content'),dist=path.join(stage,'dist');
const sections=manuscript.trim().split(/^## /m).slice(1);
const chapters=sections.map((section,index)=>{
  const [title,...paragraphs]=section.trim().split(/\n\n/),blocks=[],guideRanges=[];
  let guideStart=null;
  for(const raw of paragraphs){
    const guide=raw.startsWith('>');
    if(guide&&guideStart===null)guideStart=blocks.length;
    if(!guide&&guideStart!==null){guideRanges.push([guideStart,blocks.length-1]);guideStart=null;}
    // Markdown quote groups contain blank quote lines between natural paragraphs.
    for(const paragraph of raw.split(/\n>\s*\n/))blocks.push({type:'paragraph',text:paragraph.replace(/^> ?/gm,'').trim()});
  }
  if(guideStart!==null)guideRanges.push([guideStart,blocks.length-1]);
  return {id:`trial-opening-${index+1}`,title,blocks,presentation:{guideRanges,pictures:[],emphasis:{},events:[]}};
});
const original=path.join(root,'content/books/super-ya-revisit/original.md');
const protectedPaths=['content/library.json','content/books/super-ya-revisit/story.json','content/books/super-ya-revisit/source.md','worker/generated.mjs'];
const digest=p=>createHash('sha256').update(readFileSync(path.join(root,p))).digest('hex');
const before=protectedPaths.map(digest);
mkdirSync(stage,{recursive:true});cpSync(path.join(root,'content'),content,{recursive:true});
const story={title:'飛吧！SUPER YA！',subtitle:'巧虎的時光悄悄話',edition:'first-five-child-trial-2026-10-20',welcome:'我想把那一天的事，說給你聽。',note:'',chapters};
writeFileSync(path.join(directory,'story.json'),JSON.stringify(story,null,2)+'\n');
writeFileSync(path.join(content,'books/super-ya-revisit/story.json'),JSON.stringify(story,null,2)+'\n');
writeFileSync(path.join(content,'books/super-ya-revisit/source.md'),manuscript);
const library=JSON.parse(readFileSync(path.join(content,'library.json'),'utf8'));
const book=library.books.find(b=>b.id==='super-ya-revisit');
book.subtitle=story.welcome;book.detail='巧虎想起那一天的五件小事。';
writeFileSync(path.join(content,'library.json'),JSON.stringify(library,null,2)+'\n');
const readings={phrases:{'車子':{'0':'ㄔㄜ'},'要是':{'1':'ㄕˋ'},'他得一直':{'1':'ㄉㄟˇ'}}};
const overrides=JSON.parse(readFileSync(path.join(content,'readings-overrides.json'),'utf8'));
Object.assign(overrides.phrases,readings.phrases);
writeFileSync(path.join(content,'readings-overrides.json'),JSON.stringify(overrides,null,2)+'\n');
writeFileSync(path.join(directory,'readings.json'),JSON.stringify(readings,null,2)+'\n');
const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,READER_CONTENT:content,READER_DIST:dist,READER_PREVIEW:'1'}});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.status)process.exit(result.status);
protectedPaths.forEach((p,i)=>{if(digest(p)!==before[i])throw Error('正式內容意外改變：'+p);});
const annotations=JSON.parse(readFileSync(path.join(dist,'readings.json'),'utf8'));
for(const chapter of chapters)for(const text of [chapter.title,...chapter.blocks.map(b=>b.text)]){
  const sounds=annotations[text],chars=Array.from(text);
  if(!sounds||sounds.length!==chars.length||chars.some((ch,i)=>/\p{Script=Han}/u.test(ch)&&!sounds[i]))throw Error('試讀注音缺漏：'+text);
}
const counts=chapters.map(c=>({title:c.title,characters:readingCharacterCount(c.blocks.map(b=>b.text)),paragraphs:c.blocks.length}));
writeFileSync(path.join(directory,'annotation-review.txt'),chapters.map(c=>'# '+c.title+'\n\n'+c.blocks.map(b=>Array.from(b.text).map((ch,i)=>annotations[b.text][i]?`${ch}(${annotations[b.text][i]})`:ch).join('')).join('\n\n')).join('\n\n'));
writeFileSync(path.join(directory,'review.json'),JSON.stringify({date:'2026-10-20',scope:'前五個事件的兒童試讀；只修悄悄話，未上架。',originalSha256:createHash('sha256').update(readFileSync(original)).digest('hex'),counts,totalCharacters:counts.reduce((n,c)=>n+c.characters,0),facts:['卡歐先設定兜風行程迎接吉吉。','琪琪他們有別的事不能來。','目的地出發之後揭曉。','跳跳球撞上卡歐、使他倒地，巧虎問沒事吧；卡歐後來請收球。'],limits:['巧虎現在回想的分享是創作；不將推測當成當時角色已說出的想法。','第一篇的積木及第二至五篇的生活情境明示為假設、可能或巧虎一般經驗。','試讀未新增閱讀理解題；預覽中其餘作品與練習沿用現有內容。','未做實體 iPad 與孩子接受度測試。'],productionUnchanged:protectedPaths,preview:{dist,port:4186,url:'http://127.0.0.1:4186/?book=super-ya-revisit&chapter=0&preview=1'}},null,2)+'\n');
console.log(JSON.stringify({chapters:chapters.length,counts,dist},null,2));
