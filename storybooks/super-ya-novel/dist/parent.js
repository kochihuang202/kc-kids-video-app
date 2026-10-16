import {cloudSnapshot} from './cloud.js?v=d57971c562d6';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function mountParent({app,library,ui,ruby,getJSON,session}){
 document.body.dataset.view='parent';document.title='父母查看進度｜巧虎陪你讀';
 if(!session.isActive())return;
 const practice=await getJSON('practice.json'),stories=Object.fromEntries(await Promise.all(library.books.map(async b=>[b.id,await getJSON(b.data)])));
 if(!session.isActive())return;
 app.innerHTML=`<div class="shell"><header class="masthead"><span class="wordmark">${ruby(ui.parent)}</span><a href="${session.returnTo}" aria-label="回孩子模式">回孩子模式</a></header><main class="parent-main"><h1>${ruby(ui.parentHeading)}</h1><p>${ruby(ui.parentNotice)}</p><div class="parent-actions"><button id="refresh-progress" type="button">${ruby(ui.refreshProgress)}</button><span id="parent-sync" role="status">${ruby(ui.connecting)}</span></div><div id="parent-progress"></div><p id="release-info" class="fineprint"></p></main></div>`;
 let loading=false;
 async function refresh(){
  if(loading||!session.isActive())return;loading=true;document.querySelector('#refresh-progress').disabled=true;
  try{
   const snapshot=await cloudSnapshot(),docs=snapshot.documents||{};if(!session.isActive())return;
   document.querySelector('#parent-progress').innerHTML=library.books.map(book=>{
    const reading=docs[book.id+':whisper'],training=docs[book.id+':practice'],s=stories[book.id],p=training?.state||{},r=reading?.state||{};
    const chapter=Number.isInteger(r.chapter)&&s.chapters[r.chapter]?r.chapter:0,anchor=r.anchors?.[chapter];
    let total=0,complete=0,alone=0,help=0,explained=0;
    const rows=practice[book.id].scenes.map((scene,i)=>{
     let n=0,own=0,h=0,ex=0,tries=0;
     for(const [level,qs]of [['story',scene.questions.story]])for(let j=0;j<qs.length;j++){
      total++;const a=p.attempts?.[scene.id+':'+level+':'+j];if(!a)continue;tries+=a.tries||0;
      if(a.correct||a.revealed){n++;complete++;if(a.revealed){ex++;explained++;}else if(a.tries===1&&!a.hints){own++;alone++;}else{h++;help++;}}
     }
     return `<tr><th scope="row">${ruby(scene.title)}</th><td>${n} / ${scene.questions.story.length}</td><td>${own}</td><td>${h}</td><td>${ex}</td><td>${tries}</td></tr>`;
    }).join('');
    const paragraph=anchor?` · ${ruby(ui.blockPosition)} ${anchor.block+1}`:'';
    const seen=Object.keys(r.readThrough||{}).length;
    const notes=Object.entries(p.notes||{}).filter(([,text])=>text.trim()).map(([key,text])=>{const [id,level]=key.split(':'),index=Number(id.slice(1))-1;return `<div class="parent-note"><h4>${ruby(practice[book.id].scenes[index]?.title||'')} · ${ruby(level==='story'?ui.storyLevel:'舊版想法短文（不計入目前練習）')}</h4><p>${esc(text)}</p></div>`;}).join('');
    const current=practice[book.id].scenes.map(scene=>`<h4>${ruby(scene.title)}</h4><ul>${scene.questions.story.map((q,i)=>{const a=p.attempts?.[scene.id+':story:'+i];return `<li>${ruby(q.q)}<br>${a?`作答 ${a.tries||0} 次、重試 ${Math.max(0,(a.tries||0)-1)} 次、提示 ${Math.min(2,a.hints||0)} 層${a.hints>=3?'、看過原文定位':''}${a.revealed?'、看過解說':''}${a.correct?'、曾答對':''}`:'尚未作答'}</li>`;}).join('')}</ul>`).join('');
    const legacy=Object.entries(p.attempts||{}).filter(([key])=>key.includes(':extra:')).map(([key,a])=>`<li>${esc(key)}：作答 ${a.tries||0} 次、提示 ${a.hints||0} 次${a.revealed?'、看過解說':''}${a.correct?'、曾答對':''}</li>`).join('');
    const timestamp=doc=>doc?.updatedAt?new Date(doc.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):ui.noProgress;
    return `<section class="parent-book"><h2>${ruby(book.title)}</h2><div class="parent-summary"><article><h3>${ruby(ui.whisperTitle)}</h3><p>${ruby(r.started?s.chapters[chapter].title:ui.notStarted)}${paragraph}</p><p>${ruby(ui.visitedParts)} ${seen} / ${s.chapters.length}</p><p class="tool-note">${ruby(ui.readingNotUnderstanding)}</p><p class="updated-at">${ruby(ui.lastSaved)} ${timestamp(reading)}</p></article><article><h3>${ruby(ui.practiceTitle)}</h3><p>${ruby(ui.completedTasks)} ${complete} / ${total}</p><dl class="progress-stats"><div><dt>${ruby(ui.independent)}</dt><dd>${alone}</dd></div><div><dt>${ruby(ui.withHelp)}</dt><dd>${help}</dd></div><div><dt>${ruby(ui.explained)}</dt><dd>${explained}</dd></div></dl><p class="updated-at">${ruby(ui.lastSaved)} ${timestamp(training)}</p></article></div><div class="progress-table-scroll"><table class="progress-table"><thead><tr><th>${ruby(ui.scene)}</th><th>${ruby(ui.completedTasks)}</th><th>${ruby(ui.independent)}</th><th>${ruby(ui.withHelp)}</th><th>${ruby(ui.explained)}</th><th>${ruby(ui.answerAttempts)}</th></tr></thead><tbody>${rows}</tbody></table></div><details class="attempt-details"><summary>查看作答、提示與重試紀錄</summary>${current}</details>${legacy?`<details class="legacy-records"><summary>舊版想法短文紀錄（不列入目前題數）</summary><ul>${legacy}</ul></details>`:''}${notes?`<details class="parent-notes"><summary>${ruby(ui.childNotes)}</summary>${notes}</details>`:''}</section>`;
   }).join('');
   document.querySelector('#parent-sync').textContent=ui.cloudUpdated+' '+new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei'});
  }catch{if(session.isActive())document.querySelector('#parent-sync').textContent=ui.parentOffline;}
  finally{loading=false;const refreshButton=document.querySelector('#refresh-progress');if(refreshButton)refreshButton.disabled=false;}
 }
 document.querySelector('#refresh-progress').onclick=refresh;
 try{const release=await getJSON('release.json');if(session.isActive())document.querySelector('#release-info').textContent='網站版本 '+release.id+' · 更新時間 '+new Date(release.builtAt).toLocaleString('zh-TW');}catch{}
 const timer=setInterval(()=>{if(!document.hidden)refresh();},30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});session.signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
 await refresh();
}

