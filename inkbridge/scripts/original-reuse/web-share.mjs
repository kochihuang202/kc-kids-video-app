// Keep native46979's complete modal and78178's complete panel; adapt remote IO.
export function changeShareSelection(tree,selectedIds,id,checked){
 const selected=new Set(selectedIds),root=tree.rootBoardId,links=tree.links||[],allowed=new Set(tree.boards.map(b=>b.id));
 if(checked&&allowed.has(id)){
  // One finite ancestor path matches the host's scope normalization; selecting
  // a repeated descendant must not silently expose every alternate parent.
  const parent=new Map([[root,null]]),queue=[root];for(let i=0;i<queue.length;i++)for(const link of links)if(link.containerId===queue[i]&&allowed.has(link.whiteboardId)&&!parent.has(link.whiteboardId)){parent.set(link.whiteboardId,link.containerId);queue.push(link.whiteboardId);}
  for(let current=id;current!==null&&current!==undefined;current=parent.get(current))selected.add(current);
 }else if(id!==root){const seen=new Set();function remove(current){if(current===root||seen.has(current)||!allowed.has(current))return;seen.add(current);selected.delete(current);for(const link of links)if(link.containerId===current)remove(link.whiteboardId);}remove(id);}
 selected.add(root);return tree.boards.map(b=>b.id).filter(x=>selected.has(x));
}
export function installWebShare({getBoardId,isHome,flush,onError}){
 const require=window.__originalRequire,React=require(27378),DOM=require(31542),h=React.createElement,events=new EventTarget(),states=new Map(),trees=new Map(),settings=new Map();
 const state=id=>states.get(id)||{configured:false,selection:[id],imagePreset:'clarity'};
 const emit=()=>events.dispatchEvent(new Event('change'));
 const update=(id,value)=>{states.set(id,{...state(id),...value});emit();return state(id);};
 const useChanges=()=>{const [,set]=React.useState(0);React.useEffect(()=>{const listen=()=>set(x=>x+1);events.addEventListener('change',listen);return()=>events.removeEventListener('change',listen);},[]);};
 const failure=error=>{update(getBoardId(),{error:error.message||String(error),progress:null});};
 async function status(id){try{return update(id,await window.inkbridge.webShare({method:'status',boardId:id}));}catch(error){update(id,{error:error.message});throw error;}}
 const invoke=async(channel,payload={})=>{
  const id=payload.whiteboard_id||getBoardId();
  if(channel==='get-share-status'){
   // Descendant membership belongs to one atomic root publication.
   const receipt=id===getBoardId()?await status(id):state(getBoardId());
   const included=id===getBoardId()||receipt.selection?.includes(id),url=included?receipt.url:null;
   return {success:true,data:url?{shareLink:url,shareId:receipt.publicationId,isEnabled:receipt.enabled,updated_at:receipt.publishedAt,viewCount:0}:null};
  }
  if(channel==='get-cloud-usage')return {success:true,usedBytes:state(getBoardId()).bytes||0,quotaBytes:0};
  if(channel==='update-share-status'){
   const current=state(getBoardId());try{const receipt=await window.inkbridge.webShare({method:'setEnabled',boardId:getBoardId(),publicationId:current.publicationId,expectedVersion:current.version,enabled:payload.isEnabled});update(getBoardId(),receipt);return{success:true};}catch(error){failure(error);return{success:false,error:error.message};}
  }
  throw Error('Unsupported native sharing boundary: '+channel);
 };
 window.__inkbridgeShareInvoke=invoke;window.__inkbridgeShareFailure=failure;window.__inkbridgeShareBusy=id=>!!state(id).progress;
 window.__inkbridgeShareTreeRecords=async id=>{const all=await window.inkbridge.webShare({method:'tree',boardId:id}),reachable=new Set();function visit(key){if(reachable.has(key))return;reachable.add(key);for(const link of all.links)if(link.containerId===key)visit(link.whiteboardId);}visit(id);const tree={...all,boards:all.boards.filter(b=>reachable.has(b.id)),links:all.links.filter(link=>reachable.has(link.containerId)&&reachable.has(link.whiteboardId))};trees.set(id,tree);return tree.boards.map(board=>({...board,name:board.name||board.title||'未命名白板',isCurrent:board.id===id,isPublished:!!state(id).url&&state(id).selection?.includes(board.id)}));};
 window.__inkbridgeShareSelection=(id,items)=>(state(id).selection||[id]).filter(x=>x!==id&&items.some(item=>item.id===x));
 window.__inkbridgeUseShareAccess=()=>{useChanges();const id=getBoardId();React.useEffect(()=>{status(id).catch(()=>{});},[id]);return !!state(id).configured;};
 window.__inkbridgeSharePublish=async({boardId,selectedBoardIds})=>{
  await flush();const current=state(boardId),config=settings.get(boardId)||{};
  const request={method:'publish',boardId,selectedBoardIds,imagePreset:config.imagePreset||current.imagePreset||'clarity',losslessImageIds:config.losslessImageIds||current.losslessImageIds||[],expectedVersion:current.version??null,requestId:config.requestId||crypto.randomUUID()};
  settings.set(boardId,{...config,requestId:request.requestId});update(boardId,{error:null,progress:{phase:'capture'}});
  try{const receipt=await window.inkbridge.webShare(request);settings.set(boardId,{...config,requestId:null});update(boardId,{...receipt,selection:selectedBoardIds,progress:null});return receipt;}catch(error){settings.set(boardId,{...config,requestId:null});failure(error);throw error;}
 };
 const Button=require(17015).A,Checkbox=require(19764).K;
 function Connection({hasAccess}){
  useChanges();const id=getBoardId(),current=state(id),[url,setUrl]=React.useState(current.baseUrl||''),[code,setCode]=React.useState(''),[busy,setBusy]=React.useState(false);
  if(hasAccess)return null;
  const pair=async()=>{setBusy(true);try{await window.inkbridge.webShare({method:'configure',baseUrl:url,pairingCode:code.trim()});await status(id);}catch(error){failure(error);}finally{setBusy(false);}};
  return h('section',{className:'space-y-3 rounded-lg border border-default-200 p-3','data-testid':'share-connection'},
   h('h3',{className:'text-sm font-semibold'},'連接自己的分享網站'),h('p',{className:'text-xs text-default-500'},'發布至自己的 Cloudflare。持有連結即可觀看；本機保存不會自動公開。'),
   h('input',{className:'w-full rounded-lg border border-default-200 bg-default-50 p-2 text-sm',placeholder:'https://inkbridge-share.pages.dev',value:url,onChange:e=>setUrl(e.target.value),'aria-label':'分享網站網址'}),
   h('input',{className:'w-full rounded-lg border border-default-200 bg-default-50 p-2 text-sm',placeholder:'已連線電腦產生的一次性配對碼',value:code,onChange:e=>setCode(e.target.value),'aria-label':'裝置配對碼'}),
   h(Button,{size:'sm',color:'primary',variant:'flat',isLoading:busy,onPress:pair},'連接裝置'),
   h(Extras,{boardId:id,selectedBoardIds:[id],isPublishing:false}));
 }
 function Tree({items,selectedNestedIds,onSelectionChange,isPublishing}){
  const root=items.find(b=>b.isCurrent)?.id||getBoardId(),tree=trees.get(root)||{rootBoardId:root,boards:items,links:[]},selected=new Set([root,...selectedNestedIds]),byId=new Map(items.map(b=>[b.id,b])),rows=[];
  const visit=(id,depth,path)=>{if(path.has(id))return;const item=byId.get(id);if(!item)return;rows.push({item,depth,key:[...path,id].join('/')});const next=new Set(path).add(id);for(const link of tree.links)if(link.containerId===id)visit(link.whiteboardId,depth+1,next);};visit(root,0,new Set());
  const apply=ids=>onSelectionChange(ids.filter(id=>id!==root));
  return h('section',{className:'rounded-lg border border-default-200 bg-default-50/50 p-3 space-y-2','data-testid':'share-board-tree'},
   h('div',{className:'flex items-center justify-between gap-2 text-xs'},h('strong',null,'選擇要分享的白板'),h('span',{className:'flex gap-2'},h('button',{type:'button',disabled:isPublishing,onClick:()=>apply(items.map(b=>b.id))},'全選子孫'),h('button',{type:'button',disabled:isPublishing,onClick:()=>apply([])},'全部取消'))),
   h('div',{className:'max-h-52 overflow-y-auto space-y-1'},rows.map(({item,depth,key})=>h('div',{key,style:{paddingLeft:depth*16}},h(Checkbox,{value:item.id,isSelected:selected.has(item.id),isDisabled:item.id===root||isPublishing,onValueChange:checked=>apply(changeShareSelection(tree,[...selected],item.id,checked)),classNames:{label:'text-sm min-w-0'},'data-board-id':item.id},item.name,item.id===root&&h('span',{className:'ml-1 text-xs text-primary'},'（目前白板）'))))),
   h('p',{className:'text-xs text-default-500'},'已選 '+selected.size+' 張白板；未勾選的子白板不公開內容。'));
 }
 async function offline(id,selectedBoardIds){update(id,{error:null,progress:{phase:'offline'}});try{await flush();const result=await window.inkbridge.webShare({method:'offline',boardId:id,selectedBoardIds,losslessImageIds:settings.get(id)?.losslessImageIds||state(id).losslessImageIds||[],imagePreset:settings.get(id)?.imagePreset||state(id).imagePreset||'clarity'});update(id,{offline:result,progress:null});}catch(error){update(id,{progress:null});failure(error);}}
 function Extras({boardId,selectedBoardIds,isPublishing}){
  useChanges();const current=state(boardId),preset=settings.get(boardId)?.imagePreset||current.imagePreset||'clarity',[pairCode,setPairCode]=React.useState(''),[jobs,setJobs]=React.useState([]),[prepared,setPrepared]=React.useState(null),[prepareError,setPrepareError]=React.useState('');
  React.useEffect(()=>{window.inkbridge.webShare({method:'jobs',boardId}).then(setJobs).catch(()=>{});},[boardId,current.error]);
  const selectionKey=[...selectedBoardIds].sort().join('|');
  React.useEffect(()=>{let active=true;window.inkbridge.webShare({method:'prepare',boardId,selectedBoardIds}).then(result=>{if(active){setPrepared(result);setPrepareError('');}}).catch(error=>{if(active)setPrepareError(error.message);});return()=>{active=false;};},[boardId,selectionKey]);
  const progress=current.progress,bytes=current.bytes,formatBytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MiB':Math.round(n/1024)+' KiB';
  return h('div',{className:'space-y-3 text-xs','data-testid':'share-extra-options'},
   h('label',{className:'flex items-center justify-between gap-3'},'圖片壓縮',h('select',{value:preset,disabled:isPublishing,'aria-label':'圖片壓縮',className:'rounded-lg border border-default-200 bg-default-50 px-2 py-1.5',onChange:e=>{settings.set(boardId,{...settings.get(boardId),imagePreset:e.target.value});emit();}},h('option',{value:'clarity'},'清晰優先'),h('option',{value:'compact'},'節省流量'))),
   h('p',{className:'text-default-500'},'保留原始尺寸與本機原檔。PNG／BMP 預設無損，PDF 保留原檔。'),
   prepared&&h('p',{className:'text-default-500','data-testid':'share-scope-summary'},'已選 '+prepared.boards+' 張白板 · '+prepared.attachmentCount+' 個附件 · 原始容量 '+formatBytes(prepared.sourceBytes)),
   prepareError&&h('p',{className:'text-danger',role:'alert'},prepareError),
   bytes!=null&&h('p',{className:'text-default-500'},'上次發布容量 '+formatBytes(bytes)),
   progress&&h('div',{role:'status',className:'rounded-lg bg-primary/5 p-2'},({capture:'正在擷取已保存內容…',offline:'正在建立離線網頁包…',preparing:'正在處理圖片…',prepared:'附件已處理，準備上傳…',connecting:'正在連接分享網站…',uploading:'正在上傳…',verifying:'正在驗證附件…',publishing:'正在完成發布…'}[progress.phase]||progress.message||'正在發布…'),progress.totalBytes>0?' '+Math.round((progress.uploadedBytes||0)/progress.totalBytes*100)+'%':'',progress.bytes!=null?' · 處理後 '+formatBytes(progress.bytes):'',progress.phase!=='offline'&&h('button',{className:'ml-2 underline',onClick:()=>window.inkbridge.webShare({method:'cancel',boardId,requestId:settings.get(boardId)?.requestId||progress.requestId}).catch(failure)},'取消')),
   current.error&&h('p',{role:'alert',className:'rounded-lg bg-danger/5 p-2 text-danger'},current.error),
   current.localChanged&&h('p',{className:'rounded-lg bg-warning/5 p-2 text-warning'},'已發布擷取時的版本。本機另有新修改，再按更新才會公開。'),
   jobs.filter(job=>!['complete','cancelled'].includes(job.state)).map(job=>h('div',{key:job.requestId,className:'flex items-center justify-between rounded-lg bg-default-50 p-2'},h('span',null,'待發布版本 · '+new Date(job.capturedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})),h(Button,{size:'sm',variant:'flat',isDisabled:isPublishing,onPress:async()=>{try{update(boardId,{progress:{phase:'uploading',requestId:job.requestId},error:null});const receipt=await window.inkbridge.webShare({method:'resume',boardId,requestId:job.requestId});update(boardId,{...receipt,progress:null});setJobs(jobs.filter(x=>x.requestId!==job.requestId));window.dispatchEvent(new CustomEvent('inkbridge:share-refresh',{detail:boardId}));}catch(error){failure(error);}}},'繼續上傳'))),
   h('details',null,h('summary',{className:'cursor-pointer text-default-500'},'更多選項'),h('div',{className:'mt-2 flex flex-col items-start gap-2'},
    prepared?.images?.length>0&&h('fieldset',{className:'w-full space-y-1'},h('legend',{className:'mb-1 text-default-600'},'個別圖片使用無損（適合文字截圖）'),prepared.images.map(image=>h('div',{key:image.id},h(Checkbox,{size:'sm',isDisabled:isPublishing,isSelected:(settings.get(boardId)?.losslessImageIds||current.losslessImageIds||[]).includes(image.id),onValueChange:checked=>{const config=settings.get(boardId)||{},ids=new Set(config.losslessImageIds||current.losslessImageIds||[]);if(checked)ids.add(image.id);else ids.delete(image.id);settings.set(boardId,{...config,losslessImageIds:[...ids]});emit();},classNames:{label:'text-xs'}},image.name)))),
    h(Button,{size:'sm',variant:'flat',isDisabled:isPublishing||!!progress,onPress:()=>offline(boardId,selectedBoardIds)},'匯出離線網頁包'),
    current.offline&&h(Button,{size:'sm',variant:'light',onPress:()=>window.inkbridge.webShare({method:'open',boardId,exportId:current.offline.exportId}).catch(failure)},'開啟網頁包資料夾'),
    current.configured&&h(Button,{size:'sm',variant:'light',isDisabled:isPublishing,onPress:async()=>{try{const result=await window.inkbridge.webShare({method:'pair'});setPairCode(result.code);}catch(error){failure(error);}}},'產生其他電腦的配對碼'),
    pairCode&&h('p',{className:'select-all rounded-lg bg-default-50 p-2'},'一次性配對碼：'+pairCode))));
 }
 window.__inkbridgeShareTree=Tree;window.__inkbridgeShareConnection=Connection;window.__inkbridgeShareExtras=Extras;
 window.inkbridge.onWebShareProgress?.(progress=>update(progress.boardId||getBoardId(),progress.phase==='error'?{progress:null,error:progress.message}:progress.phase==='complete'?{progress:null}:{progress}));
 const native=require(46979),SharePopover=native.InkBridgeSharePopover,Icon=require(73176).default;
 if(!SharePopover)throw Error('Apply prepare-sharing.cjs before starting InkBridge');
 return function ShareControls({boardId=getBoardId(),home=isHome()}){
  if(home)return null;
  return DOM.createPortal(h('div',{id:'original-share-controls',className:native.uR,style:{position:'absolute',right:16,bottom:16,zIndex:20}},
   h(SharePopover,{whiteboardId:boardId,onOpenChange:open=>{if(open)status(boardId).catch(()=>{});}},h('button',{type:'button',className:native.V4,'aria-label':'分享白板',title:'分享白板'},h(Icon,{className:'h-4 w-4'})))),document.querySelector('.canvas-wrap'));
 };
}
