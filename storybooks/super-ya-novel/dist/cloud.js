import {storage,preview,draftURL} from './storage.js?v=94e93f714eb1';
const clone=value=>JSON.parse(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const maps=new Set(['positions','anchors','readThrough','attempts','notes']);
function overlay(a,b){const next={...a};for(const [k,v]of Object.entries(b)){if(maps.has(k))next[k]={...(next[k]||{}),...v};else next[k]=v;}return next;}
export async function cloudSnapshot(){
 if(preview)return {documents:{}};
 const r=await fetch('/api/progress',{cache:'no-store',signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw new Error('雲端暫時無法連線');return r.json();
}
export async function openProgress(book,mode,initial){
 if(preview){let value=clone(initial);return {get value(){return clone(value);},hasDocument:false,status:'內容預覽，不寫入正式進度',update(next){value=clone(next);},async flush(){}};}
 const queueKey=`reading-pending:${book}:${mode}`;let pending={},inflight=null,last=clone(initial),timer,busy=false,status='正在連線';
 try{pending=JSON.parse(storage.getItem(queueKey)||'{}');if(!pending||typeof pending!=='object'||Array.isArray(pending))pending={};}catch{pending={};}
 function announce(message){status=message;document.querySelectorAll('[data-sync-status]').forEach(el=>{el.textContent=status;});}
 function persist(){try{storage.setItem(queueKey,JSON.stringify(overlay(inflight||{},pending)));}catch{/* Memory still works with disabled storage. */}}
 let value=clone(initial),initialized=false;
 try{
  const data=await cloudSnapshot(),doc=data.documents?.[book+':'+mode];
  if(doc){value=overlay(initial,overlay(doc.state,pending));initialized=true;}
  announce('已連上雲端');
 }catch{announce('暫存於這台裝置，連線後會自動同步');}
 last=clone(value);
 async function flush(){
  clearTimeout(timer);if(busy||!Object.keys(pending).length)return;
  busy=true;const sent=pending;inflight=sent;pending={};persist();announce('正在儲存到網路');
  try{
   const body=JSON.stringify({patch:sent});
   const r=await fetch(`/api/progress/${book}/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:new TextEncoder().encode(body).length<60000});
   if(!r.ok)throw new Error('sync');inflight=null;persist();announce('已存到網路');
  }catch{pending=overlay(sent,pending);inflight=null;persist();announce('暫存於這台裝置，連線後會自動同步');}
  finally{busy=false;if(Object.keys(pending).length&&status==='已存到網路')timer=setTimeout(flush,500);}
 }
 function update(next){
  const changes={};
  for(const [k,v]of Object.entries(next)){
   if(equal(v,last[k]))continue;
   if(maps.has(k)){
    const delta={};for(const [index,item]of Object.entries(v||{}))if(!equal(item,last[k]?.[index]))delta[index]=item;
    if(k==='anchors')for(const index of Object.keys(last[k]||{}))if(!(index in(v||{})))delta[index]=null;
    if(Object.keys(delta).length)changes[k]=delta;
   }else changes[k]=v;
  }
  // First actual activity migrates existing local progress if the cloud is empty.
  if(!initialized){for(const [k,v]of Object.entries(next))if(!(k in changes))changes[k]=v;initialized=true;}
  last=clone(next);if(!Object.keys(changes).length)return;
  pending=overlay(pending,changes);persist();announce('等待儲存到網路');clearTimeout(timer);timer=setTimeout(flush,700);
 }
 if(Object.keys(pending).length)timer=setTimeout(flush,0);
 window.addEventListener('online',flush);window.addEventListener('pagehide',flush);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
 return {value,update,flush,get hasDocument(){return initialized;},get status(){return status;}};
}
