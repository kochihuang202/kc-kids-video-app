import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import {createHash} from 'node:crypto';
import {validateBook} from './validate-content.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const require = createRequire(import.meta.url);
let pinyin;
try { ({pinyin} = require('pinyin-pro')); }
catch { ({pinyin} = require(path.join(root,'.tools/node_modules/pinyin-pro'))); }
const contentRoot=process.env.READER_CONTENT||path.join(root,'content');
const distRoot=process.env.READER_DIST||path.join(root,'dist');
const read = name => JSON.parse(readFileSync(path.join(contentRoot,name),'utf8'));
const ui={...read('ui.json'),...read('learning-ui.json')},overrides=read('readings-overrides.json'),library=read('library.json');
const practice=read('practice.json'),glossary=read('glossary.json');
for(const book of library.books)if(book.practiceSource){
 const base=book.practiceSource,passages=read(base+'/practice-passages.json'),questions=read(base+'/practice-questions.json'),answers=read(base+'/practice-answers.json');
 practice[book.id]={...passages,scenes:passages.scenes.map(s=>({...s,questions:{story:questions[s.id].map((q,i)=>({...q,...answers[s.id][i]}))}}))};
}
const stories=Object.fromEntries(library.books.map(book=>[book.id,read(book.data)]));
const presentation=read('presentation.json');
for(const c of stories['super-ya'].chapters)c.presentation=presentation[c.id];
const registry=Object.fromEntries(library.books.map(book=>{
 const story=stories[book.id],data=practice[book.id];validateBook({book,story,practice:data,existing:true});
 book.modes={whisper:story.chapters.length,practice:data.scenes.length};
 return [book.id,{...book.modes,scenes:data.scenes.map(s=>({id:s.id,questions:s.questions.story.length}))}];
}));
const bookUIs=Object.fromEntries(library.books.map(b=>[b.id,{...ui,...(b.ui?read(b.ui):{})}]));
const strings = new Set();
function collect(v){if(typeof v==='string'){if(/\p{Script=Han}/u.test(v)){strings.add(v);strings.add(v.replace(/\*\*/g,''));if(v.includes('**'))for(const part of v.split(/(\*\*[^*]+\*\*)/g)){const text=part.startsWith('**')?part.slice(2,-2):part;if(/\p{Script=Han}/u.test(text))strings.add(text);}}}else if(v&&typeof v==='object')Object.values(v).forEach(collect);}
collect(stories);collect(ui);collect(bookUIs);collect(library);collect(read('reading-fixtures.json'));collect(practice);collect(glossary);
collect(['聽這個詞','回去繼續讀','設定','回到書架','回到封面','開始閱讀','接著讀','選擇單元','選擇篇章']);
for(const data of Object.values(practice))for(const scene of data.scenes)for(const [i,text]of scene.story.entries()){strings.add(text.replace(/\*\*/g,''));strings.add(`${i+1}．${text}`);}
for(const [id,story]of Object.entries(stories))for(const c of story.chapters)collect(`${bookUIs[id].resume}・${c.title}`);
['飛吧！','一起飛進故事，也看看心裡的小風景。',`${ui.bopo}：${ui.on}`,`${ui.bopo}：${ui.off}`].forEach(s=>strings.add(s));
const initials={b:'ㄅ',p:'ㄆ',m:'ㄇ',f:'ㄈ',d:'ㄉ',t:'ㄊ',n:'ㄋ',l:'ㄌ',g:'ㄍ',k:'ㄎ',h:'ㄏ',j:'ㄐ',q:'ㄑ',x:'ㄒ',zh:'ㄓ',ch:'ㄔ',sh:'ㄕ',r:'ㄖ',z:'ㄗ',c:'ㄘ',s:'ㄙ'};
const finals={a:'ㄚ',o:'ㄛ',e:'ㄜ',ai:'ㄞ',ei:'ㄟ',ao:'ㄠ',ou:'ㄡ',an:'ㄢ',en:'ㄣ',ang:'ㄤ',eng:'ㄥ',er:'ㄦ',i:'ㄧ',ia:'ㄧㄚ',ie:'ㄧㄝ',iao:'ㄧㄠ',iu:'ㄧㄡ',ian:'ㄧㄢ',in:'ㄧㄣ',iang:'ㄧㄤ',ing:'ㄧㄥ',iong:'ㄩㄥ',u:'ㄨ',ua:'ㄨㄚ',uo:'ㄨㄛ',uai:'ㄨㄞ',ui:'ㄨㄟ',uan:'ㄨㄢ',un:'ㄨㄣ',uang:'ㄨㄤ',ong:'ㄨㄥ',ueng:'ㄨㄥ',v:'ㄩ',ve:'ㄩㄝ',van:'ㄩㄢ',vn:'ㄩㄣ',ü:'ㄩ',üe:'ㄩㄝ',üan:'ㄩㄢ',ün:'ㄩㄣ',ê:'ㄝ'};
const ymap={yi:'i',ya:'ia',yo:'io',ye:'ie',yao:'iao',you:'iu',yan:'ian',yin:'in',yang:'iang',ying:'ing',yong:'iong',yu:'v',yue:'ve',yuan:'van',yun:'vn'};
const wmap={wu:'u',wa:'ua',wo:'uo',wai:'uai',wei:'ui',wan:'uan',wen:'un',wang:'uang',weng:'ueng'};
function convert(value){
  const match=value.match(/^([a-züê]+)([0-5])$/u);if(!match)throw new Error(`Unknown pinyin ${value}`);
  let [,base,tone]=match;let initial='',final='';
  if(ymap[base]) final=ymap[base];else if(wmap[base]) final=wmap[base];
  else {initial=base.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/)?.[0]||'';final=base.slice(initial.length);}
  if(['j','q','x'].includes(initial)&&final.startsWith('u')) final='v'+final.slice(1);
  if(['zh','ch','sh','r','z','c','s'].includes(initial)&&final==='i')final='';
  if(initial&&!(initial in initials))throw new Error(initial);
  if(final&&!(final in finals))throw new Error(`Unknown final ${value}: ${final}`);
  const core=(initials[initial]||'')+(finals[final]||'');
  return (tone==='0'||tone==='5'?'˙':'')+core+({2:'ˊ',3:'ˇ',4:'ˋ'}[tone]||'');
}
export function annotate(text){
  const chars=Array.from(text);
  const tokens=pinyin(text,{type:'all',toneType:'num',traditional:true,toneSandhi:false});
  if(tokens.length!==chars.length)throw new Error('Annotation character alignment failed');
  const result=tokens.map(t=>t.isZh?(overrides.characters[t.origin]||convert(t.pinyin)):null);
  // Longer phrase rules take precedence over shorter rules.
  for(const [phrase,changes] of Object.entries(overrides.phrases).sort((a,b)=>a[0].length-b[0].length)){
    const needle=Array.from(phrase);
    for(let i=0;i<=chars.length-needle.length;i++)if(chars.slice(i,i+needle.length).join('')===phrase)
      for(const [offset,reading] of Object.entries(changes))result[i+Number(offset)]=reading;
  }
  return result;
}
const readings=Object.fromEntries([...strings].map(s=>[s,annotate(s)]));
mkdirSync(distRoot,{recursive:true});
cpSync(path.join(root,'public'),distRoot,{recursive:true});
for(const [name,value]of Object.entries({'ui.json':ui,'readings.json':readings,'library.json':library,'practice.json':practice,'glossary.json':glossary}))writeFileSync(path.join(distRoot,name),JSON.stringify(value));
for(const book of library.books){const target=path.join(distRoot,book.data);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(stories[book.id]));if(book.ui){const targetUi=path.join(distRoot,book.ui);mkdirSync(path.dirname(targetUi),{recursive:true});writeFileSync(targetUi,JSON.stringify(bookUIs[book.id]));}}
// Version every module edge, not just app.js: a stale imported drawer must not survive release.
const hash=createHash('sha256');
function hashTree(dir){for(const entry of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const target=path.join(dir,entry.name);if(entry.isDirectory())hashTree(target);else hash.update(path.relative(root,target)).update(readFileSync(target));}}
hashTree(path.join(root,'public'));hashTree(contentRoot);hashTree(path.join(root,'scripts'));
hash.update(readFileSync(path.join(root,'worker/progress.mjs')));
const release={id:hash.digest('hex').slice(0,12),builtAt:new Date().toISOString()};
writeFileSync(path.join(distRoot,'release.json'),JSON.stringify(release));
for(const entry of readdirSync(distRoot)){if(!/\.(js|html)$/.test(entry))continue;const target=path.join(distRoot,entry);let text=readFileSync(target,'utf8');text=text.replace(/(from\s+|import\s*\()(['"])(\.\/[^'"]+\.js)(?:\?[^'"]*)?\2/g,(_,prefix,quote,url)=>prefix+quote+url+'?v='+release.id+quote).replace(/(href|src)="(styles\.css|app\.js)(?:\?[^" ]*)?"/g,(_,attr,url)=>`${attr}="${url}?v=${release.id}"`);if(process.env.READER_PREVIEW&&entry==='index.html')text=text.replace('<head>','<head><meta name="reading-preview" content="true">');writeFileSync(target,text);}
if(!process.env.READER_PREVIEW)writeFileSync(path.join(root,'worker/generated.mjs'),`// Generated by scripts/build.mjs.\nexport const books=${JSON.stringify(registry)};\nexport const release=${JSON.stringify(release)};\n`);
mkdirSync(path.join(root,'output'),{recursive:true});
const audit=[];
for(const c of Object.values(stories).flatMap(s=>s.chapters)){audit.push(`# ${c.title}`);for(const text of c.blocks.map(b=>b.text))audit.push(Array.from(text).map((ch,i)=>readings[text][i]?`${ch}(${readings[text][i]})`:ch).join(''));}
writeFileSync(path.join(root,'output','annotation-review.txt'),audit.join('\n\n'));
console.log(`Built ${library.books.length} books, ${Object.values(stories).reduce((n,s)=>n+s.chapters.length,0)} parts, ${strings.size} annotated strings. Version ${release.id}.`);
