// A single fixed entry opens a left drawer in both reading modes.
export function drawer({ui,ruby,controls,links,progress,close}){
 return `<div class="reading-tools-bar" aria-hidden="true"></div><details class="preferences"><summary aria-label="${ui.settings}"><span class="drawer-trigger-icon" aria-hidden="true">☰</span><span class="drawer-trigger-label"> ${ruby(ui.settings)}</span></summary><button type="button" class="drawer-backdrop" ${close} aria-label="${ui.closeTools}"></button><div class="reading-settings" role="dialog" aria-modal="true" aria-label="${ui.settings}"><header class="drawer-heading"><h2>${ruby(ui.readingTools)}</h2><button type="button" ${close} aria-label="${ui.closeTools}">✕</button></header><section class="drawer-progress"><h3>${ruby(ui.myProgress)}</h3>${progress}</section><nav class="drawer-nav" aria-label="${ui.readingNavigation}">${links}</nav><h3>${ruby(ui.settings)}</h3>${controls}</div></details>`;
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
export function modeSwitch({book,ui,ruby,current,chapter}){
 const reading=Number.isInteger(chapter),whisper=`?book=${book.id}${reading?'&chapter='+chapter:''}`,practice=`?book=${book.id}&mode=practice${reading?'&scene='+chapter:''}`;
 return `<nav class="mode-choices mode-switch" aria-label="${ui.switchMode}"><a class="mode-card" href="${practice}" ${current==='practice'?'aria-current="page"':''}><strong>${ruby(ui.practiceTitle)}</strong><span>${ruby(ui.practiceDescription)}</span></a><a class="mode-card" href="${whisper}" ${current==='whisper'?'aria-current="page"':''}><strong>${ruby(ui.whisperTitle)}</strong><span>${ruby(ui.whisperDescription)}</span></a></nav>`;
}
