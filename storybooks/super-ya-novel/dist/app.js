const KEY = 'shimajiro-novel:v2';
const LEGACY_KEY = 'shimajiro-novel:v1';
const app = document.querySelector('#app');
let story, ui, readings, state, saveTimer, scrollFrame, storageAvailable = true;
const defaults = () => ({ chapter: 0, started: false, bopo: true, size: 0, positions: {}, choices: {}, finished: false });
const escape = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function ruby(text) {
  const chars = Array.from(text), sounds = readings[text];
  return chars.map((ch, i) => {
    const sound = sounds?.[i];
    if (!sound) return escape(ch);
    const mark = sound.match(/[ˊˇˋ˙]/)?.[0] || '';
    const core = sound.replace(/[ˊˇˋ˙]/g, '');
    return `<ruby aria-label="${escape(ch)}"><rb>${escape(ch)}</rb><rt aria-hidden="true"><span class="phonetic">${Array.from(core).map(s => `<span>${s}</span>`).join('')}</span>${mark ? `<span class="${mark === '˙' ? 'neutral' : 'tone'}">${mark}</span>` : ''}</rt></ruby>`;
  }).join('');
}
function button(label, action, cls = '', extra = '') {
  return `<button type="button" class="${cls}" data-action="${action}" aria-label="${escape(label)}" ${extra}>${ruby(label)}</button>`;
}
function rich(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map(part=>part.startsWith('**')&&part.endsWith('**')?`<strong>${ruby(part.slice(2,-2))}</strong>`:ruby(part)).join('');
}
function bodyMarkup(c) {
  let paragraph=0;
  return (c.blocks||c.paragraphs.map(text=>({type:'paragraph',text}))).map((block,index)=>block.type==='heading'?`<h2 class="section-heading" id="section-${index}">${rich(block.text)}</h2>`:`<p id="paragraph-${paragraph++}">${rich(block.text)}</p>`).join('');
}
function loadState() {
  try {
    let v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v) {
      const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
      // The five documents have different chapter boundaries. Keep preferences,
      // but never apply the old edition's chapter, scroll position or responses.
      if(legacy&&typeof legacy==='object')v={bopo:legacy.bopo,size:legacy.size};
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return defaults();
    const next = defaults();
    next.chapter = Number.isInteger(v.chapter) && v.chapter >= 0 && v.chapter < story.chapters.length ? v.chapter : 0;
    next.started = v.started === true; next.finished = v.finished === true;
    next.bopo = v.bopo !== false;
    next.size = [0, 1, 2].includes(v.size) ? v.size : 0;
    for (let i = 0; i < story.chapters.length; i++) {
      if (Number.isFinite(v.positions?.[i]) && v.positions[i] >= 0) next.positions[i] = v.positions[i];
      if ([0,1,2,3].includes(v.choices?.[i])) next.choices[i] = v.choices[i];
    }
    return next;
  } catch { storageAvailable = false; return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { storageAvailable = false; showStorageNotice(); }
}
function showStorageNotice() {
  if (!document.querySelector('#storage-note')) {
    const note = document.createElement('p'); note.id = 'storage-note'; note.className = 'storage-note';
    note.setAttribute('role', 'status'); note.innerHTML = ruby(ui.storage); app.prepend(note);
  }
}
function settings() {
  document.body.classList.toggle('no-bopo', !state.bopo);
  document.documentElement.style.setProperty('--reader-size', [26,30,34][state.size] + 'px');
}
function art(scene = 'workshop', cover = false) {
  const ocean = scene === 'ocean', flowers = ['flowers','home','sunset'].includes(scene), sunset = scene === 'sunset';
  return `<svg class="landscape" viewBox="0 0 440 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M28 265V145C28 70 93 24 174 27C229 0 350 32 392 105C422 157 420 221 405 265H28Z" fill="${ocean?'#d9e9e5':sunset?'#f0dfbc':'#e9edda'}"/>
    <circle cx="337" cy="82" r="29" fill="${sunset?'#df9c62':'#efc978'}"/>
    ${ocean ? '<path d="M30 117Q100 95 172 117T410 117M29 198Q115 176 204 198T410 198" stroke="#a4c9c1" stroke-width="3"/><g fill="#d7a24f"><path d="M87 149Q115 121 142 149Q115 176 87 149ZM88 149L72 134V164Z"/><path d="M255 213Q275 193 300 213Q275 233 255 213ZM257 213L241 201V225Z"/></g><circle cx="129" cy="145" r="2" fill="#435d50"/><circle cx="291" cy="210" r="2" fill="#435d50"/>' : '<path d="M45 95Q66 67 89 92Q113 79 125 104H45Z" fill="#fffdf6"/><path d="M264 134Q284 106 309 131Q331 118 347 145H264Z" fill="#fffdf6"/>'}
    <path d="M20 264Q114 208 218 253Q323 210 422 264V280H20Z" fill="${ocean?'#94b9a3':'#b9c99f'}"/>
    <path d="M20 276Q140 249 233 270Q340 244 423 278" stroke="#789368" stroke-width="2"/>
    ${flowers ? '<g stroke="#75865e" stroke-width="2"><path d="M75 264V230M104 254V216M348 258V229M374 270V243"/></g><g fill="#d89a80"><circle cx="75" cy="228" r="9"/><circle cx="348" cy="226" r="10"/></g><g fill="#e8c66d"><circle cx="104" cy="213" r="9"/><circle cx="374" cy="240" r="8"/></g>' : ''}
    <g transform="translate(${cover?155:165} ${ocean?80:96})"><rect x="6" y="54" width="94" height="80" rx="22" fill="#f4e9c8" stroke="#56745f" stroke-width="3"/><path d="M30 135V158H6V147M77 135V158H101V147" fill="#759d83" stroke="#56745f" stroke-width="3" stroke-linejoin="round"/><rect x="14" y="7" width="78" height="59" rx="23" fill="#87ac98" stroke="#56745f" stroke-width="3"/><path d="M51 6V-7" stroke="#56745f" stroke-width="3"/><circle cx="51" cy="-12" r="6" fill="#e7b85e"/><rect x="28" y="21" width="50" height="26" rx="12" fill="#f9f5df"/><circle cx="42" cy="33" r="4" fill="#42664f"/><circle cx="65" cy="33" r="4" fill="#42664f"/><path d="M3 73L-13 94L-27 87M102 73L119 94L132 86" stroke="#56745f" stroke-width="10" stroke-linecap="round"/><circle cx="53" cy="96" r="16" fill="#e9bd66"/><path d="M46 96L51 102L62 88" stroke="#fff9e9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    ${scene==='house'?'<path d="M60 250V210L83 193L106 210V250H60Z" fill="#e9b79d" stroke="#8e8061" stroke-width="2"/><path d="M78 250V228H91V250" fill="#fff8e8"/>':''}
    <path d="M55 282H391" stroke="#768365" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}
function toc() {
  return `<ol class="toc-list">${story.chapters.map((c, i) => `<li><button type="button" data-action="chapter" data-chapter="${i}" aria-label="${escape(c.title)}" ${state.chapter===i && state.started ? 'aria-current="page"' : ''}><span class="chapter-num" aria-hidden="true">0${i+1}</span><span class="toc-name">${ruby(c.title)}</span><span class="toc-arrow" aria-hidden="true">↗</span></button></li>`).join('')}</ol>`;
}
function home() {
  document.body.dataset.view = 'home';
  settings();
  app.innerHTML = `<div class="shell"><header class="masthead"><span class="wordmark">${ruby(ui.subtitle || story.subtitle)}</span><span class="book-number">STORYBOOK / 01</span></header>
    <main><section class="cover" aria-labelledby="book-title"><div><p class="eyebrow">${ruby(ui.bookLabel)}</p><h1 id="book-title">${ruby('飛吧！')}<br><span class="latin">SUPER YA！</span></h1><p class="cover-copy">${ruby('一起飛進故事，也看看心裡的小風景。')}</p><div class="cover-actions">${button(state.started ? `${ui.resume}・${story.chapters[state.chapter].title}` : ui.start, 'start', 'primary')}${state.started ? button(ui.reread,'reread','text-button') : ''}</div></div><figure class="cover-art character-cover"><img src="assets/shimajiro-friends.png" alt="巧虎和朋友們在草叢間，一起望向前方。" width="640" height="359" fetchpriority="high"><figcaption>${ruby(ui.pictureCaption)}</figcaption></figure></section>
    <section class="intro-guide" aria-label="巧虎的邀請"><span class="avatar" aria-hidden="true">🐯</span><div><span class="label">${ruby(ui.guideTag)}</span><p>${ruby(story.welcome)}</p></div></section>
    <section aria-labelledby="contents-title"><div class="toc-heading"><h2 id="contents-title">${ruby(ui.toc)}</h2></div>${toc()}</section></main><footer class="fineprint">${escape(story.note)}<br>閱讀進度只留在目前瀏覽器。封面圖片由使用者提供，章節插圖為示意。<br>非官方延伸閱讀作品。</footer></div>`;
  if (!storageAvailable) showStorageNotice();
}
function chatMarkup(c) {
  return `<section class="chat" id="chat" aria-labelledby="chat-title"><div class="chat-heading"><span class="avatar" aria-hidden="true">🐯</span><div><span class="label">${ruby(ui.guideTag)}</span><h2 id="chat-title">${ruby(ui.chatTitle)}</h2></div></div><p>${ruby(c.chat.intro)}</p><p class="chat-question">${ruby(c.chat.question)}</p><p class="chat-hint">${ruby(ui.hint)}</p>
    <div class="choices" role="group" aria-label="你的想法">${[...c.chat.choices.map(ch => ch.label),ui.unsure].map((label,i)=> `<button type="button" data-action="choose" data-choice="${i}" aria-label="${escape(label)}" aria-pressed="${state.choices[state.chapter] === i}" class="choice ${i===3?'unsure':''}"><span class="choice-mark" aria-hidden="true"></span><span>${ruby(label)}</span></button>`).join('')}</div><div id="reply-slot" aria-live="polite" aria-atomic="true"></div><div class="chat-actions">${button(ui.skip,'continue','text-button')}</div></section>`;
}
function reader(index, restore = true, focus = true) {
  document.body.dataset.view = 'reader'; state.chapter = index; state.started = true; settings();
  const c = story.chapters[index];
  app.innerHTML = `<header class="reader-header"><div class="reader-bar">${button(ui.toc,'toc')}<span class="reader-brand">${ruby(story.subtitle)}</span><div class="tools">${button(`${ui.bopo}：${state.bopo?ui.on:ui.off}`,'bopo','',`id="bopo-toggle" aria-pressed="${state.bopo}"`)}${button(ui.back,'home','text-button')}</div></div>
    <div class="reading-settings"><label>${ruby(ui.size)}</label><div class="size-buttons" role="group" aria-label="字的大小">${[ui.small,ui.medium,ui.large].map((v,i)=>button(v,'size','',`data-size="${i}" aria-pressed="${state.size===i}"`)).join('')}</div><span class="book-number" style="margin-left:auto">0${index+1} / ${String(story.chapters.length).padStart(2,'0')}</span></div><div class="progress-track" aria-hidden="true"><div class="progress-fill" style="width:${index/story.chapters.length*100}%"></div></div></header>
    <main class="reader"><header class="chapter-heading"><p class="chapter-kicker">CHAPTER 0${index+1}</p><h1 tabindex="-1" id="chapter-title">${ruby(c.title)}</h1><div class="chapter-art">${art(c.scene)}</div><p class="story-role">${ruby(ui.storyTag)}</p></header><article class="prose" aria-labelledby="chapter-title">${bodyMarkup(c)}</article><div class="chapter-end" aria-hidden="true">✦ · ✦</div>${chatMarkup(c)}
    <nav class="chapter-nav" aria-label="章節導覽">${button(ui.previous,'previous','',index===0?'disabled':'')}${button(index===story.chapters.length-1?ui.finish:ui.next,index===story.chapters.length-1?'finish':'next','primary')}</nav><p class="rest-note">${ruby(ui.rest)}</p></main><footer class="reader-footer">${escape(story.note)}</footer><dialog id="contents"><div class="dialog-top"><h2>${ruby(ui.toc)}</h2>${button(ui.close,'close-toc')}</div>${toc()}</dialog>`;
  renderReply(false); save();
  if (!storageAvailable) showStorageNotice();
  requestAnimationFrame(() => {
    if (focus) document.querySelector('#chapter-title').focus({preventScroll:true});
    window.scrollTo({top:restore ? state.positions[index] || 0 : 0, behavior:'instant'});
    updateProgress();
  });
}
function renderReply(announce = true) {
  const slot = document.querySelector('#reply-slot'), choice = state.choices[state.chapter];
  if (!slot || ![0,1,2,3].includes(choice)) return;
  const chat = story.chapters[state.chapter].chat;
  if (!announce) slot.setAttribute('aria-live','off');
  slot.innerHTML = `<div class="reply" id="reply" tabindex="-1"><span class="label">${ruby(ui.replyTitle)}</span><p>${ruby(choice===3?chat.unsure:chat.choices[choice].reply)}</p>${button(ui.another,'another','text-button')}</div>`;
  if (!announce) requestAnimationFrame(()=>slot.setAttribute('aria-live','polite'));
}
function remember() {
  if (document.body.dataset.view==='reader') state.positions[state.chapter] = window.scrollY;
  save();
}
function go(index) { remember(); reader(Math.max(0,Math.min(story.chapters.length-1,index))); }
function updateProgress() {
  const fill = document.querySelector('.progress-fill'); if (!fill) return;
  const fraction = Math.min(1, window.scrollY / Math.max(1,document.documentElement.scrollHeight-innerHeight));
  fill.style.width = ((state.chapter+fraction)/story.chapters.length*100)+'%';
}
function resizeReading(action, value) {
  const anchor = [...document.querySelectorAll('.prose p,.chat,.ending')].find(el=>el.getBoundingClientRect().bottom>170);
  const top = anchor?.getBoundingClientRect().top;
  if (action==='bopo') state.bopo=!state.bopo; else state.size=value;
  settings();
  const b = document.querySelector('#bopo-toggle');
  b.setAttribute('aria-pressed',String(state.bopo)); b.setAttribute('aria-label',`${ui.bopo}：${state.bopo?ui.on:ui.off}`);
  b.innerHTML=ruby(`${ui.bopo}：${state.bopo?ui.on:ui.off}`);
  document.querySelectorAll('[data-size]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.size)===state.size)));
  requestAnimationFrame(()=>{if(anchor) window.scrollBy({top:anchor.getBoundingClientRect().top-top,behavior:'instant'}); remember();});
}
app.addEventListener('click', event => {
  const el=event.target.closest('button[data-action]'); if(!el || el.disabled) return;
  const a=el.dataset.action;
  if(a==='start') reader(state.chapter);
  else if(a==='reread'){state.positions[0]=0; reader(0,false);}
  else if(a==='home'){remember();home();window.scrollTo(0,0);}
  else if(a==='chapter') go(Number(el.dataset.chapter));
  else if(a==='previous') go(state.chapter-1);
  else if(a==='next') go(state.chapter+1);
  else if(a==='continue') {
    document.querySelector('.chapter-nav').scrollIntoView({block:'center',behavior:'instant'});
    document.querySelector('.chapter-nav .primary').focus({preventScroll:true});
  }
  else if(a==='finish'){remember();state.finished=true;save();home();window.scrollTo(0,0);}
  else if(a==='toc') document.querySelector('#contents').showModal();
  else if(a==='close-toc') document.querySelector('#contents').close();
  else if(a==='bopo'||a==='size') resizeReading(a,Number(el.dataset.size));
  else if(a==='choose') {
    state.choices[state.chapter]=Number(el.dataset.choice);save();
    document.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));
    renderReply();
    requestAnimationFrame(()=>{document.querySelector('#reply').scrollIntoView({block:'nearest',behavior:'instant'});});
  }
  else if(a==='another') {
    const selected=state.choices[state.chapter]??0;
    document.querySelector(`[data-choice="${selected}"]`).focus();
  }
});
window.addEventListener('scroll',()=>{
  if(document.body.dataset.view!=='reader')return;
  clearTimeout(saveTimer);saveTimer=setTimeout(remember,180);
  if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{updateProgress();scrollFrame=null;});
},{passive:true});
window.addEventListener('pagehide',()=>{if(state)remember();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state)remember();});
try {
  [story,ui,readings] = await Promise.all(['story.json','ui.json','readings.json'].map(async path=>{
    const response=await fetch(path);if(!response.ok)throw new Error(path);return response.json();
  }));
  state=loadState();
  if ('scrollRestoration' in history) history.scrollRestoration='manual';
  home();
} catch {
  app.innerHTML='<p class="loading" role="alert">故事暫時沒有打開，請再試一次。<br><button type="button" id="retry">重新打開</button></p>';
  document.querySelector('#retry').addEventListener('click',()=>location.reload());
}
