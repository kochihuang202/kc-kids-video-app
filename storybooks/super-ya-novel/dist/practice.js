import {storage,preview,draftURL} from './storage.js?v=94e93f714eb1';
import {pageWordCount} from './text-stats.js?v=94e93f714eb1';
import {openPreferences} from './preferences.js?v=94e93f714eb1';
import {drawer} from './drawer.js?v=94e93f714eb1';
import {openProgress} from './cloud.js?v=94e93f714eb1';
import {showWord,speakParagraphs,stopSpeech} from './tools.js?v=94e93f714eb1';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountPractice({app,book,story,ui,ruby,rich,glossary,getJSON}){
 const data=(await getJSON('practice.json'))[book.id],localKey='shimajiro-practice:'+book.id+':v1';
 const base={scene:0,level:'story',phase:'read',positions:{},anchors:{},attempts:{},notes:{},size:0,bopo:true,words:true,rate:0.85};
 let local={};try{local=JSON.parse(storage.getItem(localKey)||'{}');}catch{}
 const cloud=await openProgress(book.id,'practice',{...base,...local}),preferencesStore=await openPreferences(cloud.value);let p={...base,...cloud.value,...preferencesStore.value},view='home';
 p.level='story';
 p.scene=Number.isInteger(p.scene)&&p.scene>=0&&p.scene<data.scenes.length?p.scene:0;
 let routeReady=false,restoringRoute=false,scrollTimer,restoringScroll=false;
 function rememberReading(){
  if(view!=='reader'||restoringScroll||document.body.dataset.view!=='practice')return;
  const header=document.querySelector('.child-header')?.getBoundingClientRect().bottom||76;
  const nodes=[...document.querySelectorAll('.practice-paragraph')],el=nodes.find(n=>n.getBoundingClientRect().bottom>header+80);
  if(el){p.anchors[p.scene]={block:nodes.indexOf(el),offset:el.getBoundingClientRect().top-header};save();}
 }
 function restoreReading(){
  const anchor=p.anchors[p.scene],el=anchor&&document.getElementById('practice-para-'+anchor.block);restoringScroll=true;
  requestAnimationFrame(()=>{if(el)window.scrollTo({top:scrollY+el.getBoundingClientRect().top-76-anchor.offset,behavior:'instant'});restoringScroll=false;});
 }
 function applyRoute(phase){
  const q=new URLSearchParams(location.search),target=q.get('scene');
  if(target!==null&&/^\d+$/.test(target)&&Number(target)<data.scenes.length){
   const level='story',same=p.scene===Number(target)&&p.level===level;
   p.scene=Number(target);p.level=level;p.phase=['read','practice'].includes(phase)?phase:same?p.phase:'read';view='reader';
  }else view='home';
 }
 function syncRoute(){
  const url='?book='+book.id+'&mode=practice'+(view==='reader'?'&scene='+p.scene+(p.level==='extra'?'&level=extra':''):'');
  const snapshot={practice:{phase:p.phase}};
  if(location.search===draftURL(url).replace(/^\//,'')||!routeReady||restoringRoute)history.replaceState(snapshot,'',draftURL(url));else history.pushState(snapshot,'',draftURL(url));
  routeReady=true;
 }
 applyRoute();
 const key=()=>data.scenes[p.scene].id+':'+p.level,questions=()=>data.scenes[p.scene].questions[p.level],passage=()=>data.scenes[p.scene][p.level];
 const done=a=>a?.correct===true||a?.revealed===true;
 const count=scene=>scene.questions.story.filter((q,i)=>done(p.attempts[scene.id+':story:'+i])).length;
 const b=(text,action,extra='',cls='')=>`<button type="button" data-p="${action}" ${extra} class="${cls}" aria-label="${esc(text)}">${ruby(text)}</button>`;
 const save=()=>{try{storage.setItem(localKey,JSON.stringify(p));}catch{}cloud.update(p);preferencesStore.update(p);};
 function prefs(){return drawer({ui,ruby,close:'data-p="close-settings"',controls:`${b(`${ui.bopo}：${p.bopo?ui.on:ui.off}`,'bopo',`aria-pressed="${p.bopo}"`)}<span>${ruby(ui.size)}</span><div class="size-buttons">${[ui.small,ui.medium,ui.large].map((v,i)=>b(v,'size',`data-size="${i}" aria-pressed="${i===p.size}"`)).join('')}</div>${b(ui.words,'words',`aria-pressed="${p.words}"`)}${b(ui.speakPassage,'speak-all',view==='reader'?'':'disabled')}${b(ui.stopSpeech,'stop')}<div class="rate-buttons">${[[0.6,ui.slow],[0.85,ui.normal],[1,ui.fast]].map(([v,label])=>b(label,'rate',`data-rate="${v}" aria-pressed="${p.rate===v}"`)).join('')}</div><p class="tool-note">${ruby(ui.voiceNotice)}</p><p class="sync-note" data-sync-status>${esc(cloud.status)}</p>${b(ui.doneSettings,'close-settings','','primary')}`});}
 function nav(){return '';}
 function render(){
  syncRoute();
  document.body.dataset.view='practice';document.body.classList.toggle('no-bopo',!p.bopo);document.documentElement.style.setProperty('--reader-size',[26,30,34][p.size]+'px');
  if(view==='home'){
   app.innerHTML=nav()+`<main class="practice-shell contents-page"><p class="eyebrow">${ruby(book.title)}</p><h1>${ruby(ui.practiceTitle)}</h1><p class="practice-intro">${ruby(ui.practiceWelcome)}</p><section class="resume-panel"><div><span>${ruby(ui.resumeLabel)}</span><strong>${ruby(data.scenes[p.scene].title)}</strong></div>${b(ui.resumePractice,'resume','','primary')}</section><h2 class="contents-heading">${ruby('選擇單元')}</h2><div class="scene-grid">${data.scenes.map((s,i)=>`<button type="button" data-p="scene" data-scene="${i}" class="scene-card" aria-label="${esc(s.title)}"><span class="chapter-num">${String(i+1).padStart(2,'0')}</span><h2>${ruby(s.title)}</h2><p>${ruby(s.subtitle)}</p><span class="scene-status">${ruby(count(s)===s.questions.story.length?ui.completedPractice:ui.unreadPractice)}</span></button>`).join('')}</div><p class="sync-note" data-sync-status>${esc(cloud.status)}</p></main>`+prefs();return;
  }
  const s=data.scenes[p.scene],qs=questions(),pos=Math.min(p.positions[key()]||0,qs.length),id=key()+':'+pos,a=p.attempts[id]||{},q=qs[pos];
  let task='';
  if(pos>=qs.length){task=`<h2>${ruby(ui.practiceEnd)}</h2><p>${ruby(s.reflection)}</p><label for="own-note">${ruby(ui.ownWords)}</label><textarea id="own-note" maxlength="1000" aria-label="用自己的話說">${esc(p.notes[key()]||'')}</textarea><p class="tool-note">${ruby(ui.noteNotice)}</p>${b(ui.revisit,'restart')}${b(p.scene===data.scenes.length-1?ui.backPracticeContents:ui.nextScene,'next-scene','','primary')}`;}
  else{
   const options=q.type==='choice'?q.options:passage();
   task=`<p class="eyebrow">${ruby(q.skill)} · ${pos+1} / ${qs.length}</p><h2 class="question-title">${ruby(q.q)}</h2><div class="answer-options">${options.map((option,i)=>`<button type="button" data-p="answer" data-choice-index="${i}" aria-label="${esc(option)}" ${done(a)?'disabled':''} class="answer-choice ${done(a)&&i===q.correct?'correct':a.selection===i&&a.tries?'selected':''}"><span class="answer-index" aria-hidden="true">${i+1}</span><span class="answer-text">${ruby(q.type==='choice'?option:`${i+1}．${option}`)}</span>${done(a)&&i===q.correct?`<span class="answer-state">${ruby(ui.correctAnswer)}</span>`:''}</button>`).join('')}</div>`;
   if(done(a))task+=`<div class="feedback good"><strong>${ruby(a.correct?(a.tries===1&&!a.hints?ui.foundAlone:ui.foundEvidence):ui.readExplanation)}</strong><p>${ruby(q.why)}</p><p>${ruby(ui.evidenceParagraph)} ${q.evidence.map(i=>i+1).join('、')}</p></div>`;
   else{
    if(a.tries)task+=`<p class="feedback">${ruby(ui.tryAgain)}</p>`;
    if(a.hints>=1)task+=`<p class="hint-card">${ruby(q.hints[0])}</p>`;
    if(a.hints>=2)task+=`<p class="hint-card">${ruby(q.hints[1])}</p>`;
    if(a.hints>=3)task+=`<p class="hint-card">${ruby(ui.evidenceParagraph)} ${q.evidence.map(i=>i+1).join('、')}${b(ui.showEvidence,'evidence')}</p>`;
    if((a.hints||0)<3)task+=b(ui.hint,'hint');task+=b(ui.explanation,'reveal');
   }
   task+=`<nav class="question-nav">${b(ui.previousQuestion,'prev',pos===0?'disabled':'')}${b(done(a)?ui.nextQuestion:ui.skipQuestion,'next','',done(a)?'primary':'skip-question')}</nav>`;
  }
  app.innerHTML=nav()+`<main class="practice-shell practice-reading"><div class="practice-top"><div><p class="eyebrow">${ruby(book.title)} · ${ruby(ui.practiceTitle)}</p><h1>${ruby(s.title)}</h1></div></div><p class="tool-note">${ruby(ui.readFirst)}</p><div class="practice-layout ${p.phase==='practice'?'with-questions':''}"><article class="practice-paper"><h2>${ruby(p.level==='story'?ui.storyPassage:ui.extraPassage)}</h2>${b(ui.speakPassage,'speak-all','', 'text-button')}<div class="practice-passage">${passage().map((text,i)=>`<div class="practice-paragraph" id="practice-para-${i}"><span class="para-number" aria-hidden="true">${i+1}</span><p class="practice-text">${rich(text,[],p.words)}</p><div class="paragraph-tools">${b(ui.listenParagraph,'speak-one',`data-paragraph="${i}"`,'text-button')}</div></div>`).join('')}</div>${p.phase==='read'?b(ui.beginPractice,'begin','','primary'):b(ui.readOnly,'read-only')}</article>${p.phase==='practice'?`<section class="practice-panel" aria-label="理解練習">${task}</section>`:''}</div><p class="sync-note" data-sync-status>${esc(cloud.status)}</p>${pageWordCount(passage(),ui,ruby)}</main>`+prefs();
 }
 function change(action){
  stopSpeech();const first=[...document.querySelectorAll('.practice-paragraph')].find(n=>n.getBoundingClientRect().bottom>156),index=first?.id,top=first?.getBoundingClientRect().top,scroll=scrollY;
  action();save();render();requestAnimationFrame(()=>{const el=index&&document.getElementById(index);if(el)window.scrollBy({top:el.getBoundingClientRect().top-top,behavior:'instant'});else window.scrollTo(0,scroll);});
 }
 app.addEventListener('click',event=>{
  const term=event.target.closest('[data-word]');if(term){showWord(term.dataset.word,glossary,ruby,p.rate);return;}
  const el=event.target.closest('[data-p]');if(!el||el.disabled)return;const action=el.dataset.p;
  if(action==='close-settings'){document.querySelector('.preferences').removeAttribute('open');document.querySelector('.preferences summary').focus({preventScroll:true});return;}
  if(action==='stop'){stopSpeech(true);return;}
  if(action==='speak-one'||action==='speak-all'){
   const items=passage().map((text,i)=>({text,element:document.querySelector(`#practice-para-${i} .practice-text`)}));speakParagraphs(action==='speak-one'?[items[Number(el.dataset.paragraph)]]:items,p.rate);return;
  }
  if(['size','bopo','words','rate'].includes(action)){
   const wasOpen=document.querySelector('.preferences').hasAttribute('open');
   change(()=>{if(action==='size')p.size=+el.dataset.size;else if(action==='rate')p.rate=+el.dataset.rate;else p[action]=!p[action];});
   if(wasOpen)document.querySelector('.preferences').setAttribute('open','');return;
  }
  stopSpeech();
  if(action==='scene'||action==='resume'){rememberReading();if(action==='scene'){p.scene=+el.dataset.scene;p.level='story';p.phase='read';}view='reader';save();render();window.scrollTo(0,0);restoreReading();return;}
  if(action==='home'){rememberReading();view='home';save();render();window.scrollTo(0,0);return;}
    if(action==='begin'||action==='read-only'){p.phase=action==='begin'?'practice':'read';save();render();document.querySelector('.practice-panel')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
  const qs=questions(),pos=Math.min(p.positions[key()]||0,qs.length),id=key()+':'+pos,q=qs[pos];
  if(action==='next-scene'){if(p.scene===data.scenes.length-1){rememberReading();view='home';save();render();window.scrollTo(0,0);return;}p.scene=Math.min(data.scenes.length-1,p.scene+1);p.level='story';p.phase='read';save();render();window.scrollTo(0,0);return;}
  if(action==='restart'){p.positions[key()]=0;save();render();return;}
  if(['next','prev'].includes(action)){p.positions[key()]=Math.max(0,Math.min(qs.length,pos+(action==='next'?1:-1)));save();render();document.querySelector('.practice-panel')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
  if(!q)return;const a=p.attempts[id]||(p.attempts[id]={tries:0,hints:0,correct:false,revealed:false});
  if(action==='answer'&&!done(a)){a.tries++;a.selection=+el.dataset.choiceIndex;a.correct=a.selection===q.correct;}
  if(action==='hint'&&!done(a))a.hints=Math.min(3,a.hints+1);
  if(action==='reveal')a.revealed=true;
  save();const y=scrollY;render();window.scrollTo(0,y);
  if(action==='evidence'){for(const i of q.evidence)document.getElementById('practice-para-'+i)?.classList.add('proof');document.getElementById('practice-para-'+q.evidence[0])?.scrollIntoView({block:'center',behavior:'smooth'});}
 });
 app.addEventListener('input',event=>{if(event.target.id==='own-note'){p.notes[key()]=event.target.value.slice(0,1000);save();}});
 app.addEventListener('keydown',event=>{const term=event.target.closest('[data-word]');if(term&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();showWord(term.dataset.word,glossary,ruby,p.rate);}});
 window.addEventListener('popstate',event=>{
  const q=new URLSearchParams(location.search);if(q.get('book')!==book.id||q.get('mode')!=='practice'){location.reload();return;}
  stopSpeech();rememberReading();restoringRoute=true;applyRoute(event.state?.practice?.phase);save();render();restoringRoute=false;window.scrollTo(0,0);if(view==='reader')restoreReading();
 });
 window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(rememberReading,180);},{passive:true});
 window.addEventListener('pagehide',rememberReading);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)rememberReading();});
 render();if(view==='reader')restoreReading();
}
