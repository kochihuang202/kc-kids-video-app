const KEY='shimajiro-novel:v2',LEGACY_KEY='shimajiro-novel:v1',app=document.querySelector('#app');
let story,ui,readings,state,saveTimer,scrollFrame,restoring=false,storageAvailable=true;
const defaults=()=>({chapter:0,started:false,bopo:true,size:0,positions:{},anchors:{},readThrough:{},finished:false});
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
function rich(raw,emphasis=[]){
  const text=raw.replace(/\*\*/g,''),chars=Array.from(text),strong=new Set();let offset=0;
  for(const part of raw.split(/(\*\*[^*]+\*\*)/g)){
    const bold=part.startsWith('**'),length=Array.from(bold?part.slice(2,-2):part).length;
    if(bold)for(let i=offset;i<offset+length;i++)strong.add(i);offset+=length;
  }
  for(const phrase of emphasis){let at=text.indexOf(phrase);while(at!==-1){const start=Array.from(text.slice(0,at)).length;for(let i=start;i<start+Array.from(phrase).length;i++)strong.add(i);at=text.indexOf(phrase,at+phrase.length);}}
  const sounds=readings[text];let result='',start=0;
  while(start<chars.length){const bold=strong.has(start);let end=start+1;while(end<chars.length&&strong.has(end)===bold)end++;const html=ruby(chars.slice(start,end).join(''),sounds?.slice(start,end));result+=bold?`<strong>${html}</strong>`:html;start=end;}
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
    if(p.guideRanges.some(([,end])=>end===i))html+='</blockquote>';
    for(const pic of p.pictures.filter(pic=>pic.after===i))html+=picture(pic.image,pic.caption);
  });return html;
}
function loadState(){
  try{
    let v=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!v){const old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');if(old&&typeof old==='object')v={bopo:old.bopo,size:old.size};}
    const next=defaults();if(!v||typeof v!=='object'||Array.isArray(v))return next;
    next.chapter=Number.isInteger(v.chapter)&&v.chapter>=0&&v.chapter<story.chapters.length?v.chapter:0;
    next.started=v.started===true;next.finished=v.finished===true;next.bopo=v.bopo!==false;next.size=[0,1,2].includes(v.size)?v.size:0;
    story.chapters.forEach((c,i)=>{
      if(Number.isFinite(v.positions?.[i])&&v.positions[i]>=0)next.positions[i]=v.positions[i];
      const a=v.anchors?.[i];if(a&&Number.isInteger(a.block)&&a.block>=0&&a.block<c.blocks.length&&Number.isFinite(a.offset)&&Math.abs(a.offset)<10000)next.anchors[i]={block:a.block,offset:a.offset};
      if(Number.isInteger(v.readThrough?.[i])&&v.readThrough[i]>=0&&v.readThrough[i]<c.blocks.length)next.readThrough[i]=v.readThrough[i];
    });return next;
  }catch{storageAvailable=false;return defaults();}
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{storageAvailable=false;showStorageNotice();}}
function showStorageNotice(){if(!document.querySelector('#storage-note')){const n=document.createElement('p');n.id='storage-note';n.className='storage-note';n.setAttribute('role','status');n.innerHTML=ruby(ui.storage);app.prepend(n);}}
function settings(){document.body.classList.toggle('no-bopo',!state.bopo);document.documentElement.style.setProperty('--reader-size',[26,30,34][state.size]+'px');}
function toc(){return `<ol class="toc-list">${story.chapters.map((c,i)=>`<li><button type="button" data-action="chapter" data-chapter="${i}" aria-label="${escape(c.title)}" ${state.chapter===i&&state.started?'aria-current="page"':''}><span class="chapter-num" aria-hidden="true">0${i+1}</span><span class="toc-name">${ruby(c.title)}</span><span class="toc-arrow" aria-hidden="true">↗</span></button></li>`).join('')}</ol>`;}
function knownEvents(chapter){return story.chapters[chapter].presentation.events.filter(e=>e.block<=(state.readThrough[chapter]??-1));}
function eventCards(events,chapter){return events.map(e=>`<li><button type="button" class="map-card" data-action="map-jump" data-chapter="${chapter}" data-block="${e.block}" aria-label="${escape(e.label)}"><img src="assets/episode/${escape(e.image)}.jpg" alt="" width="320" height="180" loading="lazy"><span>${ruby(e.label)}</span></button></li>`).join('');}
function mapContents(chapter){const events=knownEvents(chapter);return events.length?`<ol class="map-events">${eventCards(events,chapter)}</ol><p class="map-note">${ruby(ui.mapHint)}</p>`:`<p class="map-note">${ruby(ui.mapEmpty)}</p>`;}
function storyMap(){return `<details class="story-map" id="story-map"><summary>${ruby(ui.mapTitle)}</summary><div id="map-content">${mapContents(state.chapter)}</div></details>`;}
function recap(){
  const chapter=knownEvents(state.chapter).length?state.chapter:Object.keys(state.readThrough).map(Number).filter(i=>i<=state.chapter&&knownEvents(i).length).sort((a,b)=>b-a)[0];
  if(chapter===undefined)return '';
  return `<details class="story-map resume-map"><summary>${ruby(ui.recap)}</summary><p class="map-note">${ruby(story.chapters[chapter].title)}</p><ol class="map-events">${eventCards(knownEvents(chapter).slice(-3),chapter)}</ol></details>`;
}
function home(){
  document.body.dataset.view='home';settings();
  app.innerHTML=`<div class="shell"><header class="masthead"><span class="wordmark">${ruby(story.subtitle)}</span><span class="book-number">STORYBOOK / 01</span></header><main><section class="cover" aria-labelledby="book-title"><div><p class="eyebrow">${ruby(ui.bookLabel)}</p><h1 id="book-title">${ruby('飛吧！')}<br><span class="latin">SUPER YA！</span></h1><p class="cover-copy">${ruby('一起飛進故事，也看看心裡的小風景。')}</p><div class="cover-actions">${button(state.started?`${ui.resume}・${story.chapters[state.chapter].title}`:ui.start,'start','primary')}${state.started?button(ui.reread,'reread','text-button'):''}</div></div><figure class="cover-art character-cover"><img src="assets/shimajiro-friends.png" alt="巧虎和朋友們在草叢間，一起望向前方。" width="640" height="359" fetchpriority="high"><figcaption>${ruby(ui.pictureCaption)}</figcaption></figure></section>${state.started?recap():''}<section class="intro-guide" aria-label="巧虎的邀請">${avatar()}<div><span class="label">${ruby(ui.guideTag)}</span><p>${ruby(story.welcome)}</p></div></section><section aria-labelledby="contents-title"><div class="toc-heading"><h2 id="contents-title">${ruby(ui.toc)}</h2></div>${toc()}</section></main><footer class="fineprint">${escape(story.note)}<br>閱讀進度只留在目前瀏覽器。封面由使用者提供；內頁畫面擷取自使用者提供的本集影片。<br>非官方延伸閱讀作品。</footer></div>`;
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
  restoring=true;clearTimeout(saveTimer);document.body.dataset.view='reader';state.chapter=index;state.started=true;settings();const c=story.chapters[index];
  app.innerHTML=`<header class="reader-header"><div class="reader-bar">${control(ui.toc,ui.compactToc,'toc')}<span class="reader-brand">${ruby(story.subtitle)}</span><div class="tools"><details class="preferences"><summary aria-label="${escape(ui.settings)}"><span class="long-label">${ruby(ui.settings)}</span><span class="short-label">${ruby(ui.compactSettings)}</span></summary><div class="reading-settings"><span>${ruby(ui.size)}</span><div class="size-buttons" role="group" aria-label="字的大小">${[ui.small,ui.medium,ui.large].map((v,i)=>button(v,'size','',`data-size="${i}" aria-pressed="${state.size===i}"`)).join('')}</div></div></details>${button(`${ui.bopo}：${state.bopo?ui.on:ui.off}`,'bopo','',`id="bopo-toggle" aria-pressed="${state.bopo}"`)}${control(ui.back,ui.compactBack,'home','text-button')}</div></div><div class="progress-track" aria-hidden="true"><div class="progress-fill"></div></div></header><main class="reader"><header class="chapter-heading"><p class="chapter-kicker">CHAPTER 0${index+1} / 05</p><h1 tabindex="-1" id="chapter-title">${ruby(c.title)}</h1>${picture(c.presentation.hero,c.presentation.heroCaption,'chapter-art')}<p class="story-role">${ruby(ui.storyTag)}</p><p class="guide-explainer">${ruby(ui.guideHint)}</p></header><article class="prose" aria-labelledby="chapter-title">${bodyMarkup(c)}</article><div class="chapter-end" aria-hidden="true">✦ · ✦</div>${storyMap()}<nav class="chapter-nav" aria-label="章節導覽">${button(ui.previous,'previous','',index===0?'disabled':'')}${button(index===story.chapters.length-1?ui.finish:ui.next,index===story.chapters.length-1?'finish':'next','primary')}</nav><p class="rest-note">${ruby(ui.rest)}</p></main><footer class="reader-footer">${escape(story.note)}</footer><dialog id="contents"><div class="dialog-top"><h2>${ruby(ui.toc)}</h2>${button(ui.close,'close-toc')}</div>${toc()}</dialog>`;
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
  if(action==='bopo')state.bopo=!state.bopo;else state.size=value;settings();
  const b=document.querySelector('#bopo-toggle');b.setAttribute('aria-pressed',String(state.bopo));b.setAttribute('aria-label',`${ui.bopo}：${state.bopo?ui.on:ui.off}`);b.innerHTML=ruby(`${ui.bopo}：${state.bopo?ui.on:ui.off}`);
  document.querySelectorAll('[data-size]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.size)===state.size)));
  requestAnimationFrame(()=>{restoreAnchor(anchor,fallback);restoring=false;remember();updateProgress();});
}
app.addEventListener('click',event=>{
  if(!event.target.closest('.preferences'))document.querySelector('.preferences')?.removeAttribute('open');
  const el=event.target.closest('button[data-action]');if(!el||el.disabled)return;const a=el.dataset.action;
  if(a==='start')reader(state.chapter);
  else if(a==='reread'){state.positions[0]=0;delete state.anchors[0];reader(0,false);}
  else if(a==='home'){remember();home();window.scrollTo(0,0);}
  else if(a==='chapter')go(Number(el.dataset.chapter));
  else if(a==='previous')go(state.chapter-1);
  else if(a==='next')go(state.chapter+1);
  else if(a==='finish'){remember();state.finished=true;save();home();window.scrollTo(0,0);}
  else if(a==='toc')document.querySelector('#contents').showModal();
  else if(a==='close-toc')document.querySelector('#contents').close();
  else if(a==='bopo'||a==='size')resizeReading(a,Number(el.dataset.size));
  else if(a==='map-jump'){const chapter=Number(el.dataset.chapter),block=Number(el.dataset.block);if(!knownEvents(chapter).some(e=>e.block===block))return;if(document.body.dataset.view==='reader'&&chapter===state.chapter){jumpBlock(block);remember();}else{remember();reader(chapter,false,true,block);}}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelector('.preferences')?.removeAttribute('open');});
window.addEventListener('scroll',()=>{
  if(document.body.dataset.view!=='reader'||restoring)return;clearTimeout(saveTimer);saveTimer=setTimeout(remember,180);
  if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{updateProgress();updateSeen();scrollFrame=null;});
},{passive:true});
window.addEventListener('resize',()=>{
  if(!state||document.body.dataset.view!=='reader'||restoring)return;const anchor=state.anchors[state.chapter];restoring=true;
  requestAnimationFrame(()=>{restoreAnchor(anchor,state.positions[state.chapter]||0);restoring=false;remember();updateProgress();});
});
window.addEventListener('pagehide',()=>{if(state)remember();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state)remember();});
try{
  [story,ui,readings]=await Promise.all(['story.json','ui.json','readings.json'].map(async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw new Error(path);return r.json();}));
  state=loadState();if('scrollRestoration'in history)history.scrollRestoration='manual';home();
}catch{app.innerHTML='<p class="loading" role="alert">故事暫時沒有打開，請再試一次。<br><button type="button" id="retry">重新打開</button></p>';document.querySelector('#retry').addEventListener('click',()=>location.reload());}
