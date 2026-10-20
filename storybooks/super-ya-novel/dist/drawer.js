// A single fixed entry opens a left drawer in both reading modes.
import {parentControl} from './parent-gate.js?v=0fc51c77b6c1';
export function drawer({ui,ruby,controls,close}){
 const query=new URLSearchParams(location.search),id=document.body.dataset.view==='library'?null:query.get('book'),cover=id&&!query.has('chapter')&&!query.has('mode');
 const mode=query.get('mode')==='practice'?'practice':'whisper',inMode=id&&(query.has('chapter')||query.has('mode'));
 const toc=inMode?`<a class="mode-toc-link" href="?book=${encodeURIComponent(id)}&mode=${mode}" aria-label="${mode==='practice'?ui.backPracticeContents:ui.backWhisperContents}"><span class="nav-full">${ruby(mode==='practice'?ui.practiceContents:ui.whisperContents)}</span><span class="nav-short">${ruby(ui.contentsShort)}</span></a>`:'<span class="mode-toc-placeholder"></span>';
 return `<header class="reader-header child-header"><nav class="child-nav" aria-label="閱讀導覽"><span class="settings-slot"></span>${toc}${id?(cover?`<span class="nav-location" aria-current="page" aria-label="目前在封面"><span class="nav-full">${ruby(ui.coverNav)}</span><span class="nav-short">${ruby(ui.coverShort)}</span></span>`:`<a class="nav-cover" href="?book=${encodeURIComponent(id)}" aria-label="回到封面"><span class="nav-full">${ruby(ui.coverNav)}</span><span class="nav-short">${ruby(ui.coverShort)}</span></a>`):'<span class="empty-cover"></span>'}<a class="nav-shelf" href="/" aria-label="回到書架"><span class="nav-full">${ruby(ui.shelfNav)}</span><span class="nav-short">${ruby(ui.shelfShort)}</span></a></nav></header><details class="preferences"><summary aria-label="${ui.settings}"><span class="drawer-trigger-icon" aria-hidden="true">☰</span><span class="drawer-trigger-label"> ${ruby('設定')}</span></summary><button type="button" class="drawer-backdrop" ${close} aria-label="${ui.closeTools}"></button><div class="reading-settings" role="dialog" aria-modal="true" aria-label="${ui.settings}"><header class="drawer-heading"><h2>${ruby(ui.settings)}</h2><button type="button" ${close} aria-label="${ui.closeTools}">✕</button></header>${controls}${parentControl()}</div></details>`;
}
export function closeDrawer(){const panel=document.querySelector('.preferences');if(panel){panel.removeAttribute('open');panel.querySelector('summary').focus({preventScroll:true});}}
document.addEventListener('keydown',event=>{
 const panel=document.querySelector('.preferences[open] .reading-settings');if(!panel)return;
 if(event.key==='Escape'){event.preventDefault();closeDrawer();}
 if(event.key==='Tab'){
  const items=[...panel.querySelectorAll('a[href],button:not(:disabled),summary,textarea')].filter(el=>el.getClientRects().length);
  const first=items[0],last=items.at(-1);if(!first)return;
  if(!panel.contains(document.activeElement)){event.preventDefault();first.focus();}
  else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
