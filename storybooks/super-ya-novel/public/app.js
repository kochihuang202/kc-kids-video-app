import {pageWordCount} from './text-stats.js';
import {openPreferences} from './preferences.js';
import {drawer,modeSwitch} from './drawer.js';
import {openProgress} from './cloud.js';
import {wordRanges,showWord,speakParagraphs,stopSpeech} from './tools.js';
const LEGACY_KEY='shimajiro-novel:v1',app=document.querySelector('#app');
let KEY,library,selectedBook,story,ui,readings,state,glossary,cloud,preferencesStore,saveTimer,scrollFrame,restoring=false,storageAvailable=true;
const defaults=()=>({chapter:0,started:false,bopo:true,size:0,positions:{},anchors:{},readThrough:{},finished:false,words:true,rate:0.85});
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function ruby(text,sounds=readings[text]){
  return Array.from(text).map((ch,i)=>{
    const sound=sounds?.[i];if(!sound)return escape(ch);
    const mark=sound.match(/[ˊˇˋ˙]/)?.[0]||'',core=sound.replace(/[ˊˇˋ˙]/g,'');
    return `<ruby aria-label="${escape(ch)}"><rb>${escape(ch)}</rb><rt aria-hidden="true"><span class="phonetic">${Array.from(core).map(s=>`<span>${s}</span>`).join('')}</span>${mark?`<span class="${mark==='˙'?'neutral':'tone'}">${mark}</span>`:''}</rt></ruby>`;
  }).join('');
}
const button=(label,action,cls='',extra='')=>`<button type="button" class="${cls}" data-action="${action}" aria-label="${escape(label)}" ${extra}>${ruby(label)}</button>`;
const control=(label,short,action,cls='')=>`<button type="button" class="${cls}" data-action="${action}" aria-label="${escape(label)}"><span class="long-label">${ruby(label)}</span><span class="short-label">${ruby(short)}</span></button>`;
const avatar=()=>'<img class="avatar" src="assets/shimajiro-avatar.jpg" alt="" width="192" height="192">';
// Slice contextual readings from the complete paragraph, even across bold spans.
function rich(raw,emphasis=[],showTerms=state?.words!==false){
  const text=raw.replace(/\*\*/g,''),chars=Array.from(text),strong=new Set();let offset=0;
  for(const part of raw.split(/(\*\*[^*]+\*\*)/g)){
    const bold=part.startsWith('**'),length=Array.from(bold?part.slice(2,-2):part).length;
    if(bold)for(let i=offset;i<offset+length;i++)strong.add(i);offset+=length;
  }
  for(const phrase of emphasis){let at=text.indexOf(phrase);while(at!==-1){const start=Array.from(text.slice(0,at)).length;for(let i=start;i<start+Array.from(phrase).length;i++)strong.add(i);at=text.indexOf(phrase,at+phrase.length);}}
  const sounds=readings[text];let result='',start=0;
  const ranges=showTerms?wordRanges(text,glossary||{}):[];
  function segment(a,b){let output='';while(a<b){const bold=strong.has(a);let end=a+1;while(end<b&&strong.has(end)===bold)end++;const html=ruby(chars.slice(a,end).join(''),sounds?.slice(a,end));output+=bold?`<strong>${html}</strong>`:html;a=end;}return output;}
  while(start<chars.length){const term=ranges.find(r=>r.start===start);if(term){result+=`<span role="button" tabindex="0" class="word-help" data-word="${escape(term.word)}" aria-label="${escape(term.word)}">${segment(start,term.end)}</span>`;start=term.end;}else{const next=ranges.find(r=>r.start>start)?.start??chars.length;result+=segment(start,next);start=next;}}
  return result;
}
function picture(image,caption,cls='story-picture'){
  return `<figure class="${cls}"><img src="assets/episode/${escape(image)}.jpg" alt="${escape(caption)}" width="960" height="540" ${cls==='chapter-art'?'fetchpriority="high"':'loading="lazy"'}><figcaption>${ruby(caption)}</figcaption></figure>`;
}
function bodyMarkup(c){
  const p=c.presentation;let paragraph=0,html='';
  c.blocks.forEach((block,i)=>{
    if(p.guideRanges.some(([start])=>start===i))html+=`<blockquote class="guide-passage"><div class="guide-label">${avatar()}<span>${ruby(ui.guideTag)}</span></div>`;
    const tag=block.type==='heading'?'h2':'p',id=block.type==='heading'?`section-${i}`:`paragraph-${paragraph++}`;
    html+=`<${tag} class="source-block ${tag==='h2'?'section-heading':''}" id="${id}" data-block="${i}" tabindex="-1">${rich(block.text,p.emphasis[i])}</${tag}>`;
    if(tag==='p')html+=`<div class="paragraph-tools">${button(ui.listenParagraph,'speak-block','text-button',`data-speak-block="${i}"`)}</div>`;
    if(p.guideRanges.some(([,end])=>end===i))html+='</blockquote>';
    for(const pic of p.pictures.filter(pic=>pic.after===i))html+=picture(pic.image,pic.caption);
  });return html;
}
function loadState(input){
  try{
    let v=input===undefined?JSON.parse(localStorage.getItem(KEY)||'null'):input;
    if(!v&&selectedBook.id==='super-ya'){const old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');if(old&&typeof old==='object')v={bopo:old.bopo,size:old.size};}
    const next=defaults();if(!v||typeof v!=='object'||Array.isArray(v))return next;
    next.chapter=Number.isInteger(v.chapter)&&v.chapter>=0&&v.chapter<story.chapters.length?v.chapter:0;
    next.started=v.started===true;next.finished=v.finished===true;next.bopo=v.bopo!==false;next.size=[0,1,2].includes(v.size)?v.size:0;next.words=v.words!==false;next.rate=[0.6,0.85,1].includes(v.rate)?v.rate:0.85;
    story.chapters.forEach((c,i)=>{
      if(Number.isFinite(v.positions?.[i])&&v.positions[i]>=0)next.positions[i]=v.positions[i];
      const a=v.anchors?.[i];if(a&&Number.isInteger(a.block)&&a.block>=0&&a.block<c.blocks.length&&Number.isFinite(a.offset)&&Math.abs(a.offset)<10000)next.anchors[i]={block:a.block,offset:a.offset};
      if(Number.isInteger(v.readThrough?.[i])&&v.readThrough[i]>=0&&v.readThrough[i]<c.blocks.length)next.readThrough[i]=v.readThrough[i];
    });return next;
  }catch{storageAvailable=false;return defaults();}
}
function save(){if(!selectedBook){preferencesStore?.update(state);return;}try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageAvailable=false;showStorageNotice();}cloud?.update(state);preferencesStore?.update(state);}
function showStorageNotice(){if(!document.querySelector('#storage-note')){const n=document.createElement('p');n.id='storage-note';n.className='storage-note';n.setAttribute('role','status');n.innerHTML=ruby(ui.storage);app.prepend(n);}}
function settings(){document.body.classList.toggle('no-bopo',!state.bopo);document.documentElement.style.setProperty('--reader-size',[26,30,34][state.size]+'px');}
function toc(){return `<ol class="toc-list">${story.chapters.map((c,i)=>`<li><button type="button" data-action="chapter" data-chapter="${i}" aria-label="${escape(c.title)}" ${state.chapter===i&&state.started?'aria-current="page"':''}><span class="chapter-num" aria-hidden="true">0${i+1}</span><span class="toc-name">${ruby(c.title)}</span><span class="toc-arrow" aria-hidden="true">↗</span></button></li>`).join('')}</ol>`;}
function knownEvents(chapter){return story.chapters[chapter].presentation.events.filter(e=>e.block<=(state.readThrough[chapter]??-1));}
function eventCards(events,chapter){return events.map(e=>`<li><button type="button" class="map-card ${e.image?'':'text-event'}" data-action="map-jump" data-chapter="${chapter}" data-block="${e.block}" aria-label="${escape(e.label)}">${e.image?`<img src="assets/episode/${escape(e.image)}.jpg" alt="" width="320" height="180" loading="lazy">`:''}<span>${ruby(e.label)}</span></button></li>`).join('');}
function mapContents(chapter){const events=knownEvents(chapter);return events.length?`<ol class="map-events">${eventCards(events,chapter)}</ol><p class="map-note">${ruby(ui.mapHint)}</p>`:`<p class="map-note">${ruby(ui.mapEmpty)}</p>`;}
function storyMap(){return `<details class="story-map" id="story-map"><summary>${ruby(ui.mapTitle)}</summary><div id="map-content">${mapContents(state.chapter)}</div></details>`;}
function recap(){
  const chapter=knownEvents(state.chapter).length?state.chapter:Object.keys(state.readThrough).map(Number).filter(i=>i<=state.chapter&&knownEvents(i).length).sort((a,b)=>b-a)[0];
  if(chapter===undefined)return '';
  return `<details class="story-map resume-map"><summary>${ruby(ui.recap)}</summary><p class="map-note">${ruby(story.chapters[chapter].title)}</p><ol class="map-events">${eventCards(knownEvents(chapter).slice(-3),chapter)}</ol></details>`;
}
function bookLinks(){return '<nav class="book-links" aria-label="故事書連結"><a href="./">'+ruby(library.shelf)+'</a>'+library.books.filter(b=>b.id!==selectedBook.id).map(b=>'<a href="?book='+b.id+'">'+ruby(b.title)+'</a>').join('')+'<a href="?view=parent">'+ruby(ui.parent)+'</a></nav>';}
function shelf(){
 state={...defaults(),...preferencesStore.value};document.body.dataset.view='library';document.title=library.title+'｜故事書架';settings();
 app.innerHTML='<div class="shell"><header class="masthead"><span class="wordmark">'+ruby(library.title)+'</span><span class="book-number">STORYBOOKS / 02</span></header><nav class="book-links"><a href="?view=parent">'+ruby(ui.parent)+'</a></nav><main class="bookshelf"><h1>'+ruby(library.invitation)+'</h1><p class="shelf-note">'+ruby(library.saved)+'</p><div class="book-grid">'+library.books.map(b=>'<a class="book-card" href="?book='+b.id+'" aria-label="'+escape(b.title)+'"><img src="'+escape(b.image)+'" alt="'+escape(b.imageAlt)+'" width="960" height="540"><div><p class="book-number">0'+Number(b.number)+'</p><h2>'+ruby(b.title)+'</h2><p>'+ruby(b.subtitle)+'</p><p class="shelf-note">'+ruby(b.detail)+'</p><span class="book-open">'+ruby(library.open)+' ↗</span></div></a>').join('')+'</div></main></div>'+shelfPreferences();
}
function preferenceControls(){return `${button(`${ui.bopo}：${state.bopo?ui.on:ui.off}`,'bopo','',`id="bopo-toggle" aria-pressed="${state.bopo}"`)}<span>${ruby(ui.size)}</span><div class="size-buttons" role="group" aria-label="字的大小">${[ui.small,ui.medium,ui.large].map((v,i)=>button(v,'size','',`data-size="${i}" aria-pressed="${state.size===i}"`)).join('')}</div><button type="button" data-action="words" aria-label="詞語提示" aria-pressed="${state.words}">${ruby(ui.words)}</button><div class="speech-controls">${button(ui.speakChapter,'speak-chapter','',document.body.dataset.view==='reader'?'':'disabled')}${button(ui.stopSpeech,'speech-stop')}<div class="rate-buttons" role="group" aria-label="朗讀速度">${[[0.6,ui.slow],[0.85,ui.normal],[1,ui.fast]].map(([rate,label])=>button(label,'rate','',`data-rate="${rate}" aria-pressed="${state.rate===rate}"`)).join('')} </div><p class="tool-note">${ruby(ui.voiceNotice)}</p></div><p class="sync-note" data-sync-status>${escape(cloud?.status||preferencesStore?.status||ui.connecting)}</p>${button(ui.doneSettings,'close-settings','primary')}`;}
function shelfPreferences(){return drawer({ui,ruby,close:'data-action="close-settings"',progress:`<p>${ruby(library.saved)}</p>`,links:library.books.map(b=>`<a href="?book=${b.id}">${ruby(b.title)}</a>`).join('')+`<a href="?view=parent">${ruby(ui.parent)}</a>`,controls:preferenceControls()});}
function preferences(){return drawer({ui,ruby,close:'data-action="close-settings"',progress:`<p>${ruby(state.started?story.chapters[state.chapter].title:ui.notStarted)}</p><p class="tool-note">${ruby(ui.readingNotUnderstanding)}</p>`,links:`<a href="./">${ruby(library.shelf)}</a><a href="?book=${selectedBook.id}">${ruby(ui.modeHome)}</a><a href="?book=${selectedBook.id}&mode=practice${document.body.dataset.view==='reader'?'&scene='+state.chapter:''}">${ruby(ui.practiceTitle)}</a><span class="drawer-current" aria-current="page">${ruby(ui.whisperTitle)}</span>${button(ui.toc,'toc')}<a href="?view=parent">${ruby(ui.parent)}</a>`,controls:preferenceControls()});}
let restoringRoute=false;
function syncWhisperRoute(chapter){
 if(restoringRoute)return;
 const url='?book='+selectedBook.id+(chapter===null?'':'&chapter='+chapter);
 if(location.search!==url)history.pushState(null,'',url);
}
function home(){
  stopSpeech();
  document.body.dataset.view='home';syncWhisperRoute(null);settings();
  app.innerHTML=`<div class="shell"><header class="masthead"><span class="wordmark">${ruby(story.subtitle)}</span><span class="book-number">STORYBOOK / ${selectedBook.number}</span></header>${bookLinks()}<main>${modeSwitch({book:selectedBook,ui,ruby,current:"whisper"})}<section class="cover" aria-labelledby="book-title"><div><p class="eyebrow">${ruby(ui.bookLabel)}</p><h1 id="book-title">${selectedBook.id==='super-ya'?ruby('飛吧！')+'<br><span class="latin">SUPER YA！</span>':ruby(story.title)}</h1><p class="cover-copy">${ruby(selectedBook.subtitle)}</p><div class="cover-actions">${button(state.started?`${ui.resume}・${story.chapters[state.chapter].title}`:ui.start,'start','primary')}${state.started?button(ui.reread,'reread','text-button'):''}</div></div><figure class="cover-art character-cover"><img src="assets/shimajiro-friends.png" alt="巧虎和朋友們在草叢間，一起望向前方。" width="640" height="359" fetchpriority="high"><figcaption>${ruby(ui.pictureCaption)}</figcaption></figure></section>${state.started?recap():''}<section class="intro-guide" aria-label="巧虎的邀請">${avatar()}<div><span class="label">${ruby(ui.guideTag)}</span><p>${ruby(story.welcome)}</p></div></section><section aria-labelledby="contents-title"><div class="toc-heading"><h2 id="contents-title">${ruby(ui.toc)}</h2></div>${toc()}</section></main><footer class="fineprint">${escape(story.note)}<br>閱讀進度會儲存到網路；暫時離線時先留在裝置，連線後再同步。${selectedBook.id==='super-ya'?'封面由使用者提供；內頁畫面擷取自使用者提供的本集影片。':'封面為使用者提供的角色圖片；本篇以完整原稿閱讀為主。'}<br>非官方延伸閱讀作品。</footer></div>${preferences()}`;
  if(!storageAvailable)showStorageNotice();
}
function headerBottom(){return document.querySelector('.reader-header')?.getBoundingClientRect().bottom||0;}
function visibleAnchor(){
  // Ignore the last sliver of the preceding paragraph beneath the toolbar.
  const line=headerBottom()+80;
  const el=[...document.querySelectorAll('.source-block')].find(n=>{const r=n.getBoundingClientRect();return r.bottom>line&&r.top<innerHeight;});
  return el?{block:Number(el.dataset.block),offset:el.getBoundingClientRect().top-headerBottom()}:null;
}
function restoreAnchor(anchor,fallback=0){
  const el=anchor&&document.querySelector(`[data-block="${anchor.block}"]`);
  window.scrollTo({top:el?scrollY+el.getBoundingClientRect().top-headerBottom()-anchor.offset:fallback,behavior:'instant'});
}
function reader(index,restore=true,focus=true,targetBlock=null){
  stopSpeech();
  restoring=true;clearTimeout(saveTimer);document.body.dataset.view='reader';state.chapter=index;state.started=true;syncWhisperRoute(index);settings();const c=story.chapters[index];
  app.innerHTML=`<header class="reader-header"><div class="reader-bar">${control(ui.toc,ui.compactToc,'toc')}<span class="reader-brand">${ruby(story.subtitle)}</span><div class="tools"><a class="practice-shortcut" href="?book=${selectedBook.id}&mode=practice&scene=${index}">${ruby(ui.practiceTitle)}</a>${control(ui.back,ui.compactBack,'home','text-button')}</div></div><div class="progress-track" aria-hidden="true"><div class="progress-fill"></div></div></header><main class="reader">${modeSwitch({book:selectedBook,ui,ruby,current:"whisper",chapter:index})}<header class="chapter-heading"><p class="chapter-kicker">${selectedBook.id==='kiki'?'PART':'CHAPTER'} ${String(index+1).padStart(2,'0')} / ${String(story.chapters.length).padStart(2,'0')}</p><h1 tabindex="-1" id="chapter-title">${ruby(c.title)}</h1>${c.presentation.hero?picture(c.presentation.hero,c.presentation.heroCaption,'chapter-art'):''}<p class="story-role">${ruby(ui.storyTag)}</p>${ui.guideHint?`<p class="guide-explainer">${ruby(ui.guideHint)}</p>`:''}</header><article class="prose" aria-labelledby="chapter-title">${bodyMarkup(c)}</article><div class="chapter-end" aria-hidden="true">✦ · ✦</div>${storyMap()}<nav class="chapter-nav" aria-label="章節導覽">${button(ui.previous,'previous','',index===0?'disabled':'')}${button(index===story.chapters.length-1?ui.finish:ui.next,index===story.chapters.length-1?'finish':'next','primary')}</nav><p class="rest-note">${ruby(ui.rest)}</p></main><footer class="reader-footer">${escape(story.note)}${bookLinks()}${pageWordCount(c.blocks.map(b=>b.text),ui,ruby)}</footer>${preferences()}<dialog id="contents"><div class="dialog-top"><h2>${ruby(ui.toc)}</h2>${button(ui.close,'close-toc')}</div>${toc()}</dialog>`;
  save();if(!storageAvailable)showStorageNotice();
  requestAnimationFrame(()=>{
    if(focus)document.querySelector('#chapter-title').focus({preventScroll:true});
    if(targetBlock!==null)jumpBlock(targetBlock);else restoreAnchor(restore?state.anchors[index]:null,restore?state.positions[index]||0:0);
    requestAnimationFrame(()=>{restoring=false;updateProgress();updateSeen();remember();});
  });
}
function updateSeen(){
  if(restoring||document.body.dataset.view!=='reader')return;
  let last=state.readThrough[state.chapter]??-1;
  for(const el of document.querySelectorAll('.source-block'))if(el.getBoundingClientRect().bottom<=innerHeight-25)last=Math.max(last,Number(el.dataset.block));
  if(last>(state.readThrough[state.chapter]??-1)){
    const before=knownEvents(state.chapter).length;state.readThrough[state.chapter]=last;
    if(before!==knownEvents(state.chapter).length)document.querySelector('#map-content').innerHTML=mapContents(state.chapter);
    save();
  }
}
function remember(){if(!state)return;if(document.body.dataset.view==='reader'&&!restoring){state.positions[state.chapter]=scrollY;const a=visibleAnchor();if(a)state.anchors[state.chapter]=a;else delete state.anchors[state.chapter];}save();}
function go(index){remember();reader(Math.max(0,Math.min(story.chapters.length-1,index)));}
function updateProgress(){const fill=document.querySelector('.progress-fill');if(fill){const fraction=Math.min(1,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight));fill.style.width=((state.chapter+fraction)/story.chapters.length*100)+'%';}}
function jumpBlock(block){const el=document.querySelector(`[data-block="${block}"]`);if(el){window.scrollTo({top:scrollY+el.getBoundingClientRect().top-headerBottom()-24,behavior:'instant'});el.focus({preventScroll:true});}}
function resizeReading(action,value){
  const anchor=visibleAnchor(),fallback=scrollY;restoring=true;
  if(action==='bopo')state.bopo=!state.bopo;else state.size=value;settings();save();
  const b=document.querySelector('#bopo-toggle');b.setAttribute('aria-pressed',String(state.bopo));b.setAttribute('aria-label',`${ui.bopo}：${state.bopo?ui.on:ui.off}`);b.innerHTML=ruby(`${ui.bopo}：${state.bopo?ui.on:ui.off}`);
  document.querySelectorAll('[data-size]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.size)===state.size)));
  requestAnimationFrame(()=>{restoreAnchor(anchor,fallback);restoring=false;remember();updateProgress();});
}
app.addEventListener('click',event=>{
  const term=event.target.closest('[data-word]');if(term&&state){showWord(term.dataset.word,glossary,ruby,state.rate||0.85);return;}
  if(!event.target.closest('.preferences'))document.querySelector('.preferences')?.removeAttribute('open');
  const el=event.target.closest('button[data-action]');if(!el||el.disabled)return;const a=el.dataset.action;
  if(a==='start')reader(state.chapter);
  else if(a==='speak-block'){const i=Number(el.dataset.speakBlock);speakParagraphs([{text:story.chapters[state.chapter].blocks[i].text,element:document.querySelector(`.source-block[data-block="${i}"]`)}],state.rate);}
  else if(a==='speak-chapter')speakParagraphs(story.chapters[state.chapter].blocks.map((b,i)=>({text:b.text,element:document.querySelector(`.source-block[data-block="${i}"]`)})),state.rate);
  else if(a==='speech-stop')stopSpeech(true);
  else if(a==='rate'){state.rate=Number(el.dataset.rate);save();document.querySelectorAll('[data-rate]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.rate===state.rate)));}
  else if(a==='words'){const anchor=visibleAnchor();state.words=!state.words;save();const prose=document.querySelector('.prose');if(prose)prose.innerHTML=bodyMarkup(story.chapters[state.chapter]);restoreAnchor(anchor,scrollY);el.setAttribute('aria-pressed',String(state.words));}
  else if(a==='reread'){state.positions[0]=0;delete state.anchors[0];reader(0,false);}
  else if(a==='home'){remember();home();window.scrollTo(0,0);}
  else if(a==='chapter')go(Number(el.dataset.chapter));
  else if(a==='previous')go(state.chapter-1);
  else if(a==='next')go(state.chapter+1);
  else if(a==='finish'){remember();state.finished=true;save();home();window.scrollTo(0,0);}
  else if(a==='toc'){document.querySelector('.preferences')?.removeAttribute('open');const contents=document.querySelector('#contents');if(contents)contents.showModal();else document.querySelector('#contents-title')?.scrollIntoView({block:'start'});}
  else if(a==='close-toc')document.querySelector('#contents').close();
  else if(a==='close-settings'){const panel=document.querySelector('.preferences');panel.removeAttribute('open');panel.querySelector('summary').focus({preventScroll:true});}
  else if(a==='bopo'||a==='size')resizeReading(a,Number(el.dataset.size));
  else if(a==='map-jump'){const chapter=Number(el.dataset.chapter),block=Number(el.dataset.block);if(!knownEvents(chapter).some(e=>e.block===block))return;if(document.body.dataset.view==='reader'&&chapter===state.chapter){jumpBlock(block);remember();}else{remember();reader(chapter,false,true,block);}}
});
document.addEventListener('keydown',event=>{const term=event.target.closest?.('[data-word]');if(term&&['Enter',' '].includes(event.key)){event.preventDefault();showWord(term.dataset.word,glossary,ruby,state?.rate||0.85);}if(event.key==='Escape'){const panel=document.querySelector('.preferences[open]');if(panel){panel.removeAttribute('open');panel.querySelector('summary').focus({preventScroll:true});}}});
window.addEventListener('scroll',()=>{
  if(document.body.dataset.view!=='reader'||restoring)return;clearTimeout(saveTimer);saveTimer=setTimeout(remember,180);
  if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{updateProgress();updateSeen();scrollFrame=null;});
},{passive:true});
window.addEventListener('resize',()=>{
  if(!state||document.body.dataset.view!=='reader'||restoring)return;const anchor=state.anchors[state.chapter];restoring=true;
  requestAnimationFrame(()=>{restoreAnchor(anchor,state.positions[state.chapter]||0);restoring=false;remember();updateProgress();});
});
window.addEventListener('popstate',()=>{
 if(!selectedBook||!state)return;
 const q=new URLSearchParams(location.search);if(q.get('book')!==selectedBook.id||q.get('mode')==='practice')return;
 if(document.body.dataset.view==='reader')remember();
 restoringRoute=true;const target=Number(q.get('chapter'));
 if(q.has('chapter')&&Number.isInteger(target)&&target>=0&&target<story.chapters.length)reader(target,true);else{home();window.scrollTo(0,0);}
 restoringRoute=false;
});
window.addEventListener('pagehide',()=>{if(state&&document.body.dataset.view==='reader')remember();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state&&document.body.dataset.view==='reader')remember();});
async function getJSON(path){const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw new Error(path);return r.json();}
try{
 [library,ui,readings,glossary]=await Promise.all(['library.json','ui.json','readings.json','glossary.json'].map(getJSON));
 const query=new URLSearchParams(location.search);
 selectedBook=library.books.find(b=>b.id===query.get('book'));
 if('scrollRestoration'in history)history.scrollRestoration='manual';
 if(query.get('view')==='parent'||!selectedBook){preferencesStore=await openPreferences();document.body.classList.toggle('no-bopo',!preferencesStore.value.bopo);}
 if(query.get('view')==='parent'){
  const {mountParent}=await import('./parent.js');await mountParent({app,library,ui,ruby,getJSON});
 }else if(selectedBook){
  KEY=selectedBook.storageKey;story=await getJSON(selectedBook.data);
  if(selectedBook.id==='kiki')ui=await getJSON('books/kiki/ui.json');
  document.title=story.title+'｜'+story.subtitle;
  if(query.get('mode')==='practice'){
   const {mountPractice}=await import('./practice.js');
   await mountPractice({app,book:selectedBook,story,ui,ruby,rich,glossary,getJSON});
  }else{
   state=loadState();cloud=await openProgress(selectedBook.id,'whisper',state);preferencesStore=await openPreferences(cloud.value);state=loadState({...cloud.value,...preferencesStore.value});
   const chapter=Number(query.get('chapter'));
   if(query.has('chapter')&&Number.isInteger(chapter)&&chapter>=0&&chapter<story.chapters.length)reader(chapter,true);else home();
  }
 }else shelf();
}catch{app.innerHTML='<p class="loading" role="alert">故事暫時沒有打開，請再試一次。<br><button type="button" id="retry">重新打開</button></p>';document.querySelector('#retry').addEventListener('click',()=>location.reload());}
