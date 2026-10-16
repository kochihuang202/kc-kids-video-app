// Unlock exists only in this page's memory; it is never saved as a preference.
let hold=null,active=false,returnTo='/',controller;
export const parentControl=()=>'<div class="parent-entry"><button type="button" data-parent-hold aria-label="切換父母模式">切換父母模式</button><p role="status" data-hold-status>按住三秒進入；放開或移開即可取消。</p></div>';
function cancel(){if(hold){clearTimeout(hold.timer);hold.el.style.removeProperty('--hold');hold=null;}document.querySelectorAll('[data-hold-status]').forEach(n=>n.textContent='按住三秒進入；放開或移開即可取消。');}
function begin(el,event){
 cancel();if(event.button>0)return;event.preventDefault();
 const rect=el.getBoundingClientRect();hold={el,rect};el.style.setProperty('--hold','100%');
 const status=el.parentElement.querySelector('[data-hold-status]');if(status)status.textContent='持續按住，三秒後進入父母模式……';
 hold.timer=setTimeout(()=>{cancel();if(location.search!=='?view=parent'){returnTo=location.pathname+location.search;try{sessionStorage.setItem('reading-child-return',returnTo);}catch{}history.pushState(null,'','?view=parent');}active=true;document.dispatchEvent(new CustomEvent('parent-unlocked'));},3000);
}
document.addEventListener('pointerdown',e=>{const el=e.target.closest('[data-parent-hold]');if(el)begin(el,e);});
document.addEventListener('pointermove',e=>{if(hold){const r=hold.rect;if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)cancel();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
window.addEventListener('blur',cancel);
for(const type of ['pointerup','pointercancel','keydown','keyup'])document.addEventListener(type,e=>{
 if(type==='keydown'&&[' ','Enter'].includes(e.key)&&e.target.matches('[data-parent-hold]')){if(!e.repeat)begin(e.target,e);return;}
 if(type!=='keydown')cancel();
});
export function parentGate(app){
 active=false;controller?.abort();document.body.dataset.view='parent-gate';
 app.innerHTML='<main class="parent-gate"><h1>切換父母模式</h1><p>按住下方按鈕三秒，才會顯示閱讀紀錄。</p>'+parentControl()+'<a href="'+safeReturn()+'">回孩子模式</a></main>';
}
function safeReturn(){try{returnTo=sessionStorage.getItem('reading-child-return')||returnTo;}catch{}return /^\/(?:\?|$)/.test(returnTo)&&!returnTo.includes('view=parent')?returnTo:'/';}
export function parentSession(){controller=new AbortController();return {signal:controller.signal,returnTo:safeReturn(),isActive:()=>active};}
document.addEventListener('visibilitychange',()=>{cancel();if(document.hidden&&active)parentGate(document.querySelector('#app'));});
window.addEventListener('pagehide',()=>{cancel();active=false;controller?.abort();});
window.addEventListener('popstate',()=>{if(active)location.reload();});
