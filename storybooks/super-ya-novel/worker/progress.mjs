const books={'super-ya':5,kiki:9};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const bad=()=>{throw new Error('進度格式不正確');};
export function sanitizePatch(input,book,mode){
 if(!books[book]||!['whisper','practice'].includes(mode)||!plain(input))bad();
 const out={},count=books[book];
 const allowed=mode==='whisper'?['chapter','started','bopo','size','positions','anchors','readThrough','finished','words','rate']:['scene','level','phase','positions','attempts','notes','size','bopo','words','rate'];
 for(const [key,value]of Object.entries(input)){
  if(!allowed.includes(key))bad();
  if(['chapter','scene'].includes(key)){if(!integer(value,0,count-1))bad();out[key]=value;}
  else if(['started','bopo','finished','words'].includes(key)){if(typeof value!=='boolean')bad();out[key]=value;}
  else if(key==='size'){if(!integer(value,0,2))bad();out[key]=value;}
  else if(key==='rate'){if(![0.6,0.85,1].includes(value))bad();out[key]=value;}
  else if(key==='level'){if(!['story','extra'].includes(value))bad();out[key]=value;}
  else if(key==='phase'){if(!['read','practice'].includes(value))bad();out[key]=value;}
  else{
   if(!plain(value)||Object.keys(value).length>100)bad();const map={};
   for(const [k,v]of Object.entries(value)){
    if(['anchors','readThrough','positions'].includes(key)&&mode==='whisper'){
     if(!/^\d+$/.test(k)||!integer(+k,0,count-1))bad();
     if(key==='anchors'){if(v===null){map[k]=null;continue;}if(!plain(v)||!integer(v.block,0,999)||!Number.isFinite(v.offset)||Math.abs(v.offset)>10000)bad();map[k]={block:v.block,offset:v.offset};}
     else{if(!Number.isFinite(v)||v<0||v>1000000)bad();map[k]=v;}
    }else if(key==='attempts'){
     const match=k.match(/^s(\d+):(story|extra):(\d+)$/);if(!match||!integer(+match[1],1,count)||!integer(+match[3],0,match[2]==='story'?2:1)||!plain(v))bad();
     if(!integer(v.tries??0,0,999)||!integer(v.hints??0,0,3))bad();
     if(v.selection!==undefined&&!integer(v.selection,0,50))bad();
     map[k]={tries:v.tries??0,hints:v.hints??0,correct:v.correct===true,revealed:v.revealed===true,selection:v.selection??0};
    }else if(['positions','notes'].includes(key)){
     const match=k.match(/^s(\d+):(story|extra)$/);if(!match||!integer(+match[1],1,count))bad();
     if(key==='notes'){if(typeof v!=='string'||v.length>1000)bad();map[k]=v;}
     else{if(!integer(v,0,3))bad();map[k]=v;}
    }else bad();
   }out[key]=map;
  }
 }return out;
}
export function mergeProgress(old,patch){
 const next={...old};
 for(const [key,value]of Object.entries(patch)){
  if(['anchors','positions','readThrough','attempts','notes'].includes(key)){
   const map={...(next[key]||{})};
   for(const [k,v]of Object.entries(value)){
    if(v===null){delete map[k];continue;}
    if(key==='readThrough')map[k]=Math.max(map[k]??-1,v);
    else if(key==='attempts'){
     const prev=map[k]||{};map[k]={...prev,...v,tries:Math.max(prev.tries||0,v.tries||0),hints:Math.max(prev.hints||0,v.hints||0),correct:prev.correct===true||v.correct===true,revealed:prev.revealed===true||v.revealed===true};
    }else map[k]=v;
   }next[key]=map;
  }else if(key==='finished')next[key]=old.finished===true||value===true;
  else next[key]=value;
 }return next;
}
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
 async fetch(request,env){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  if(url.pathname==='/api/health')return json({ok:true,cloud:!!env.PROGRESS});
  if(!env.PROGRESS)return json({error:'雲端進度暫時無法使用'},503);
  try{
   if(request.method==='GET'&&url.pathname==='/api/progress'){
    const {results}=await env.PROGRESS.prepare('SELECT id, state, revision, updated_at FROM reading_progress ORDER BY id').all();
    return json({documents:Object.fromEntries(results.map(r=>[r.id,{state:JSON.parse(r.state),revision:r.revision,updatedAt:r.updated_at}]))});
   }
   const match=url.pathname.match(/^\/api\/progress\/(super-ya|kiki)\/(whisper|practice)$/);
   if(request.method!=='POST'||!match)return json({error:'找不到這個功能'},404);
   const origin=request.headers.get('Origin');
   if((origin&&origin!==url.origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'請從閱讀網站操作'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'需要 JSON 格式'},415);
   if(Number(request.headers.get('Content-Length'))>128000)return json({error:'進度內容太大'},413);
   const reader=request.body?.getReader(),chunks=[];let length=0;
   if(reader)while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>128000){await reader.cancel();return json({error:'進度內容太大'},413);}chunks.push(value);}
   const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const text=new TextDecoder().decode(bytes);
   let patch;try{patch=sanitizePatch(JSON.parse(text).patch,match[1],match[2]);}catch{return json({error:'進度格式不正確'},400);}
   if(!Object.keys(patch).length)return json({ok:true});
   const id=match[1]+':'+match[2];
   await env.PROGRESS.prepare("INSERT INTO reading_progress(id,state,revision,updated_at) VALUES(?,'{}',0,?) ON CONFLICT(id) DO NOTHING").bind(id,new Date().toISOString()).run();
   for(let attempt=0;attempt<5;attempt++){
    const row=await env.PROGRESS.prepare('SELECT state,revision FROM reading_progress WHERE id=?').bind(id).first();
    const next=mergeProgress(JSON.parse(row.state),patch),updatedAt=new Date().toISOString();
    const result=await env.PROGRESS.prepare('UPDATE reading_progress SET state=?, revision=revision+1, updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(next),updatedAt,id,row.revision).run();
    if(result.meta.changes)return json({ok:true,revision:row.revision+1,updatedAt});
   }return json({error:'進度正在同步，請稍後再試'},409);
  }catch{return json({error:'雲端暫時無法連線，請稍後再試'},503);}
 }
};
