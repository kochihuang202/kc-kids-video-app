import {makePayload} from './payload.mjs';
const base=new URL('./',import.meta.url),publicationBase=new URL('./',location.href),status=document.querySelector('#status');
globalThis.__inkbridgeWebBase=base.href;
const state=window.__inkbridgeWeb={ready:false,errors:[],requests:[],source:'native92570/48626/67259'};
function fail(error){state.errors.push(error?.message||String(error));if(state.stale)return;status.hidden=false;status.id='error';status.textContent='無法開啟分享：'+state.errors.at(-1);console.error(error);}
window.addEventListener('error',e=>fail(e.error||e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
// Explicit base-path adaptation for shipped browser resources. No server/API
// fallbacks and no synthetic responses; missing resources fail visibly.
const nativeFetch=window.fetch.bind(window);
window.fetch=(input,options)=>{let url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 if(/^\/(fonts|canvaskit|pdfjs)\//.test(url))url=new URL(url.slice(1),base).href;
 const target=new URL(url,location.href);if(!['blob:','data:'].includes(target.protocol)&&target.origin!==location.origin)return Promise.reject(Error('分享包拒絕外部請求：'+target.origin));
 return nativeFetch(typeof input==='string'||input instanceof URL?url:new Request(url,input),options).then(response=>{if(response.status===409&&target.pathname.startsWith(publicationBase.pathname))stalePublication();return response;});
};
function stalePublication(){
 if(state.stale)return;state.stale=true;status.hidden=false;status.id='status';status.replaceChildren();
 const box=document.createElement('section'),message=document.createElement('p'),reload=document.createElement('button');message.textContent='此分享已有新版本，請重新載入後繼續查看。';reload.textContent='重新載入';reload.onclick=()=>location.reload();box.append(message,reload);status.append(box);
}
async function boot(){
 if(location.protocol==='file:')throw Error('請執行 Start-Web.bat，或放到靜態網站開啟');
 const publication=await fetch(new URL('share.json',publicationBase),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('分享資料缺失');return r.json();});
 if(publication.format!=='inkbridge-web-share'||publication.version!==1)throw Error('不相容的分享包');
 let id=new URL(location.href).searchParams.get('shareId')||publication.rootBoardId;if(!publication.boardIds.includes(id))throw Error('此白板不在分享包中');
 if(!new URL(location.href).searchParams.has('shareId')){const u=new URL(location.href);u.searchParams.set('shareId',id);history.replaceState({},'',u);}
 const assetURL=relative=>{const url=new URL(relative,publicationBase);if(publication.publicationVersion)url.searchParams.set('v',publication.publicationVersion);return url.href;};
 const attachments=publication.attachments.map(f=>({source_file_id:f.source_file_id,cdn_url:assetURL(f.path)}));
 const previewURLs=new Map(publication.attachments.filter(f=>f.preview_path).map(f=>[assetURL(f.path),assetURL(f.preview_path)]));
 globalThis.__inkbridgeWebImageSource=(src,bucket)=>bucket<=512?(previewURLs.get(src)||src):src;
 globalThis.__inkbridgeWebImageDimensions=new Map(publication.attachments.filter(f=>f.width&&f.height).map(f=>[assetURL(f.path),{width:f.width,height:f.height}]));
 globalThis.__inkbridgeUnsharedBoards=new Set(publication.graph.whiteboardInstances.filter(r=>r.isUnshared).map(r=>r.whiteboardId));
 state.publicationVersion=publication.publicationVersion||null;
 const localReads=new Set(['getShareFlow','getPdfCardById','getMediaCardById','getNoteCardById','getFileById','getNoteHighlightsBySourceId']);
 globalThis.__inkbridgeServices={has:name=>localReads.has(name),async call(name,value){state.requests.push(name);
  if(name==='getShareFlow'){const key=typeof value==='string'?value:value.shareId;return {...makePayload(publication,key),attachments};}
  if(name==='getLocalSystemFonts')return [];
  if(name==='getNoteHighlightsBySourceId')return {success:true,list:(publication.graph.noteHighlights||[]).filter(row=>row.sourceId===value.sourceId)};
  if(name==='getPdfCardById'||name==='getMediaCardById'||name==='getNoteCardById'){const key=typeof value==='string'?value:value.id;const c=publication.graph.contents.find(c=>c.id===key),card=c?{...publication.graph.cardMetadata.find(m=>m.id===key),id:c.id,title:c.title,content:c.document}:null;if(name==='getPdfCardById')return {success:!!card,pdfCard:card,file:publication.graph.files.find(f=>f.id===card?.fileId)||null};if(name==='getMediaCardById')return {success:!!card,mediaCard:card};return card;}
  if(name==='getFileById'){const file=publication.graph.files.find(f=>f.id===(typeof value==='string'?value:value.id));return {success:!!file,file:file?{...file,metadata:typeof file.metadata==='string'?JSON.parse(file.metadata):file.metadata}:null};}
  throw Error('唯讀分享不提供此操作：'+name);
 }};
 const r=window.__originalRequire;if(!r)throw Error('閱讀器資源未完整下載');r.p=new URL('_next/',base).href;
 r(64744);const React=r(27378),ReactDOM=r(31542),store=r(63268).Z,Provider=r(16125).zt,Theme=r(2726).f,CanvasProvider=r(64744).InkBridgeCanvasHostProvider,Viewer=r(92570).default;
 const kit=r(37757),K=await kit.zj();kit.nY(K);await new Promise((resolve,reject)=>r(65857).fO.init(K,resolve).catch(reject));r(19281).YH.init('inkbridge-web','read-only');
 const locale=await fetch(new URL('locale.json',base)).then(r=>r.json());
 window.__NEXT_DATA__={buildId:'LOq0EGi9XWnc3BD21aEGY',page:'/v/flow',query:{shareId:id},props:locale,isFallback:false};
 const router=r(51648).createRouter('/v/flow',{shareId:id},location.pathname+location.search,{initialProps:locale,pageLoader:new(r(43867).default)(window.__NEXT_DATA__.buildId,''),App:r(64744).default,Component:Viewer,wrapApp:c=>c,subscription:()=>{throw Error('此連結不在唯讀分享中');},isFallback:false,locale:'zh-TW',locales:['zh-TW','zh','en'],defaultLocale:'zh-TW',isPreview:false});
 router.isReady=true;window.router=router;Object.defineProperty(globalThis,'__inkbridgeRoutePath',{get:()=>'/v/flow'});
 function App(){return React.createElement(r(29242).RouterContext.Provider,{value:router},React.createElement(Provider,{store},React.createElement(Theme,{attribute:'class',defaultTheme:'light',enableSystem:false},React.createElement(CanvasProvider,null,React.createElement(Viewer),React.createElement(r(64744).InkBridgeImageGallery)))));}
 const Translated=r(1643).Jc(App);ReactDOM.createRoot(document.querySelector('#app')).render(React.createElement(Translated,{pageProps:locale.pageProps}));
 const nativeStore=r(23).gt;state.inspect=()=>({nodes:nativeStore.getState().nodes,view:nativeStore.getState().view,errors:state.errors,requests:state.requests});
 nativeStore.subscribe(s=>{if(s.nodes.length){state.ready=true;if(!state.stale)status.hidden=true;}});
 if(previewURLs.size){
  // Native zoom can replay its recorded picture without re-entering the media
  // drawer. Ask its existing bucketed image queue for visible final-resolution
  // assets after camera motion; its cache and redraw subscription do the rest.
  const imageQueue=r(33158).Yw,filesById=new Map(publication.attachments.map(f=>[f.source_file_id,f]));let timer,camera='';
  const schedule=s=>{const next=JSON.stringify([s.view,s.nodes.map(n=>n.id)]);if(next===camera)return;camera=next;clearTimeout(timer);timer=setTimeout(()=>{
   if(state.stale)return;const current=nativeStore.getState(),view=current.view,canvas=document.querySelector('canvas');if(!canvas)return;const box=canvas.getBoundingClientRect(),nodes=new Map(current.nodes.map(n=>[n.id,n]));
   for(const node of current.nodes){const file=filesById.get(node.data?.fileId);if(!file?.preview_path||node.data?.mediaType!=='image')continue;
    let x=node.position.x,y=node.position.y,parent=node.parentId,seen=new Set([node.id]);while(parent&&nodes.has(parent)&&!seen.has(parent)){seen.add(parent);const p=nodes.get(parent);x+=p.position.x;y+=p.position.y;parent=p.parentId;}
    const left=view.translateX+x*view.scale,top=view.translateY+y*view.scale,width=node.width*view.scale,height=node.height*view.scale;
    if(left+width<0||top+height<0||left>box.width||top>box.height)continue;
    imageQueue.loadImage(K,assetURL(file.path),{maxDisplayWidth:width,maxDisplayHeight:height,inViewport:true}).catch(fail);
   }
  },180);};nativeStore.subscribe(schedule);schedule(nativeStore.getState());
 }
 // Empty boards are valid; mark ready after the native loader and canvas mount.
 const observer=new MutationObserver(()=>{if(document.querySelector('canvas')&&state.requests.includes('getShareFlow')){state.ready=true;if(!state.stale)status.hidden=true;}});observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
 if(publication.publicationVersion){
  // HTML image elements and PDF worker requests do not all pass through the
  // window fetch wrapper. Detect version replacement without mixing documents.
  const check=async()=>{try{const response=await fetch(new URL('share.json',publicationBase),{cache:'no-store'});if(response.status===404){stalePublication();return;}if(response.ok&&(await response.json()).publicationVersion!==publication.publicationVersion)stalePublication();}catch{}};
  setInterval(check,30000);window.addEventListener('focus',check);
 }
}
boot().catch(fail);
