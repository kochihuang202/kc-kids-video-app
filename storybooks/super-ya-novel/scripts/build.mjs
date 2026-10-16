import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const require = createRequire(import.meta.url);
let pinyin;
try { ({pinyin} = require('pinyin-pro')); }
catch { ({pinyin} = require(path.join(root,'.tools/node_modules/pinyin-pro'))); }
const read = name => JSON.parse(readFileSync(path.join(root,'content',name),'utf8'));
const story=read('story.json'),ui=read('ui.json'),overrides=read('readings-overrides.json');
const kiki=read('books/kiki/story.json'),library=read('library.json'),kikiUi={...ui,...read('books/kiki/ui.json')};
const presentation=read('presentation.json');
for(const c of story.chapters)c.presentation=presentation[c.id];
const strings = new Set();
function collect(v){if(typeof v==='string'){if(/\p{Script=Han}/u.test(v)){strings.add(v);strings.add(v.replace(/\*\*/g,''));if(v.includes('**'))for(const part of v.split(/(\*\*[^*]+\*\*)/g)){const text=part.startsWith('**')?part.slice(2,-2):part;if(/\p{Script=Han}/u.test(text))strings.add(text);}}}else if(v&&typeof v==='object')Object.values(v).forEach(collect);}
collect(story);collect(ui);collect(read('reading-fixtures.json'));
collect(kiki);collect(kikiUi);collect(library);
for(const c of kiki.chapters)collect(`${kikiUi.resume}・${c.title}`);
['飛吧！','一起飛進故事，也看看心裡的小風景。',`${ui.bopo}：${ui.on}`,`${ui.bopo}：${ui.off}`,...story.chapters.map(c=>`${ui.resume}・${c.title}`)].forEach(s=>strings.add(s));
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
mkdirSync(path.join(root,'dist'),{recursive:true});
cpSync(path.join(root,'public'),path.join(root,'dist'),{recursive:true});
for(const [name,value] of Object.entries({'story.json':story,'ui.json':ui,'readings.json':readings}))writeFileSync(path.join(root,'dist',name),JSON.stringify(value));
mkdirSync(path.join(root,'dist/books/kiki'),{recursive:true});
writeFileSync(path.join(root,'dist/library.json'),JSON.stringify(library));
writeFileSync(path.join(root,'dist/books/kiki/story.json'),JSON.stringify(kiki));
writeFileSync(path.join(root,'dist/books/kiki/ui.json'),JSON.stringify(kikiUi));
mkdirSync(path.join(root,'output'),{recursive:true});
const audit=[];
for(const c of [...story.chapters,...kiki.chapters]){audit.push(`# ${c.title}`);for(const text of c.blocks.map(b=>b.text))audit.push(Array.from(text).map((ch,i)=>readings[text][i]?`${ch}(${readings[text][i]})`:ch).join(''));}
writeFileSync(path.join(root,'output','annotation-review.txt'),audit.join('\n\n'));
console.log(`Built 2 books, ${story.chapters.length+kiki.chapters.length} parts, ${strings.size} annotated strings.`);
