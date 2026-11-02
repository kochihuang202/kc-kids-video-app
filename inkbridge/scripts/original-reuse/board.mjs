import {checkNoteVersion,documentIdentity,standaloneServices} from '/inkbridge-core/note-version.mjs';
import {windowExpectations,assertWindowExpectations,projectWindowOperations,advanceWindowBaseline} from '/inkbridge-core/workspace-window-sync.mjs';
import {createOriginalSections,projectGroupedNode,sectionWorldPosition} from '/inkbridge-core/original-sections.mjs';
// InkBridge SQLite/UI boundary only. Canvas, gestures, cache, flow overlay and
// editing behavior come from the complete original components and their store.
import {PersistenceCoordinator} from '/inkbridge-core/persistence-coordinator.mjs';
import {noteDocument} from '/inkbridge-core/rich-document.mjs';
import {connectOriginalShell} from './original-shell.mjs';
import {installStorageSettings} from './storage-settings.mjs';
import {createOriginalNoteWriter} from '/inkbridge-core/original-note-writes.mjs';
import {folderDeletionOperations} from '/inkbridge-core/original-folder-writes.mjs';
import {createOriginalTags} from '/inkbridge-core/original-tags.mjs';
import {createOriginalBookmarks} from '/inkbridge-core/original-bookmarks.mjs';
import {createOriginalPdf} from '/inkbridge-core/original-pdf.mjs';
import {createOriginalConnections} from '/inkbridge-core/original-connections.mjs';

const $=selector=>document.querySelector(selector),r=window.__originalRequire;
const state=window.__inkbridgeIntegrated={ready:false,errors:[],callbacks:[],source:'original Canvas10764 + Flow34883 + Editor73866'};
function report(error){state.errors.push({message:error.message,stack:error.stack});$('#persistence-status').textContent=error.message;$('#persistence-status').classList.add('save-error');}
window.addEventListener('error',event=>report(event.error||Error(event.message)));
window.addEventListener('unhandledrejection',event=>report(event.reason instanceof Error?event.reason:Error(String(event.reason))));

async function boot(){
  if(!r)throw Error('Original module bundle is required; no fallback renderer will be used');r.p='/_next/';
  // Preserve original _app-first module initialization and original providers.
  r(64744);const React=r(27378),ReactDOM=r(31542),redux=r(63268).Z,Provider=r(16125).zt,Theme=r(2726).f,Canvas=r(10764).p,Flow=r(34883).R,CanvasProvider=r(64744).InkBridgeCanvasHostProvider;
  if(!CanvasProvider)throw Error('Apply the recorded original integration patches first');
  const kit=r(37757),K=await kit.zj();kit.nY(K);const fonts=r(65857).fO;await new Promise((resolve,reject)=>fonts.init(K,resolve).catch(reject));
  const graph=await window.inkbridge.load(),info=await window.inkbridge.info(),contents=new Map(graph.contents.map(content=>[content.id,content])),instances=new Map(graph.instances.map(instance=>[instance.id,instance])),files=new Map((graph.files||[]).map(file=>[file.id,file]));
  r(19281).YH.init('inkbridge-local',graph.workspaceId);
  const boardWindow=location.pathname==='/board-window',requestedBoard=new URL(location.href).searchParams.get('whiteboardId');
  if(boardWindow&&!graph.boards.some(board=>board.id===requestedBoard&&!board.attributes?.isTrashed))throw Error('白板不存在或已移至回收站');
  let persistedGraph=structuredClone(graph),boardId=(boardWindow?requestedBoard:null)||graph.boards.find(board=>!board.attributes?.isTrashed)?.id||graph.boards[0]?.id||'board-main',navigationChanging=false,navigationTail=Promise.resolve(),shell;
  const boards=new Map(graph.boards.map(board=>[board.id,board])),originalStore=r(23).gt,editors=new Map(),modalEditors=new Map(),editorSnapshots=new WeakMap(),helpers=r(45828),engine=r(66597).L;
  const pendingExternal=new Set();globalThis.__inkbridgeTrackOperation=operation=>{let task;try{task=Promise.resolve(operation());}catch(error){task=Promise.reject(error);}pendingExternal.add(task);task.then(()=>pendingExternal.delete(task),error=>{pendingExternal.delete(task);report(error);});return task;};
  function stageBoardView(view,id=boardId){if(state.home||navigationChanging||!boards.has(id))return;const board={...boards.get(id),view};boards.set(id,board);coordinator.stage({type:'putBoard',data:board});}
  const graphContext=()=>({CanvasKit:K,fontMgr:fonts.getFontMgr(),view:originalStore.getState().view,theme:'light',locale:'zh-TW'});
  const bodyFromEditor=editor=>editor.read(()=>({document:JSON.parse(JSON.stringify(editor.getEditorState().toJSON())),body:r(41570).GvG().getTextContent()}));
  function putContent(content,body){
    const document=content.document?JSON.parse(JSON.stringify(content.document)):null;
    const title=document?helpers.LG(document):(content.title||'新卡片');
    const next={...content,document,title,body:body??(document?helpers.Vj(document):'')};
    const previous=contents.get(content.id);if(previous&&previous.title===next.title&&previous.body===next.body&&JSON.stringify(previous.document)===JSON.stringify(document))return;
    contents.set(next.id,next);coordinator.stage({type:'putContent',data:JSON.parse(JSON.stringify(next))});
  }
  function persistGeometry(node){
    const item=instances.get(node.id);if(!item)return;
    const parent=sectionWorldPosition(node.parentId,sections.sections),bounds=engine.getNodeBounds(node,graphContext()),next={...item,x:node.position.x-parent.x,y:node.position.y-parent.y,width:node.width||bounds.width,height:bounds.height};
    if(JSON.stringify(next)===JSON.stringify(item))return;instances.set(next.id,next);coordinator.stage({type:'putInstance',data:next});
  }
  function acceptDocument(nodeId,document,body){
    const item=instances.get(nodeId);if(!item)return;const editor=editors.get(nodeId);if(editor){readLiveEditor(editor,item.contentId);return;}acceptContentDocument(item.contentId,document,body);
  }
  function readLiveEditor(editor,contentId){if(editor.isComposing())return;const value=bodyFromEditor(editor),serialized=JSON.stringify(value.document);if(editorSnapshots.get(editor)===serialized)return;editorSnapshots.set(editor,serialized);acceptContentDocument(contentId,value.document,value.body,editor);}
  function acceptContentDocument(contentId,document,body,sourceEditor){
    const content=contents.get(contentId);if(!content)return;
    putContent({...content,document},body);
    const native=redux.getState().flow.noteCards.find(row=>row.id===contentId);
    if(!native||JSON.stringify(native.content)!==JSON.stringify(document))redux.dispatch(r(23407).yc.updateNoteCard({id:contentId,title:helpers.LG(document),content:document,lastEditedTime:new Date().toISOString()}));
    // The native editor deliberately suppresses recent prop echoes. Like its
    // external-update path, explicitly update other live editors; never reset
    // the originating editor's selection or interrupt an IME composition.
    const peers=[...modalEditors].filter(([,id])=>id===contentId).map(([editor])=>editor).concat([...editors].filter(([id])=>instances.get(id)?.contentId===contentId).map(([,editor])=>editor));
    for(const editor of new Set(peers))if(editor!==sourceEditor&&!editor.isComposing()&&JSON.stringify(bodyFromEditor(editor).document)!==JSON.stringify(document)){editor.setEditorState(editor.parseEditorState(document),{tag:'editor-force-update'});editor.update(()=>{},{discrete:true,tag:'editor-force-update'});editorSnapshots.set(editor,JSON.stringify(bodyFromEditor(editor).document));}
    const current=originalStore.getState();
    if(current.nodes.some(node=>node.data.objectId===content.id&&JSON.stringify(node.data.content)!==JSON.stringify(document))){
      current.setNodes(nodes=>nodes.map(node=>node.data.objectId===content.id?{...node,data:{...node.data,content:document,title:helpers.LG(document),lastEditedTime:new Date().toISOString()}}:node));
    }
    for(const node of originalStore.getState().nodes)if(node.data.objectId===content.id)persistGeometry(node);
  }
  const coordinator=new PersistenceCoordinator({revision:graph.revision,commit:async request=>{
    const result=boardWindow?await window.inkbridge.noteCall({method:'workspaceCommit',payload:{request,expected:windowExpectations(persistedGraph,request.operations)}}):await window.inkbridge.commit(request);
    if(!result.ok)throw Object.assign(Error(result.error.message),{code:result.error.code});
    const ack=boardWindow?result.result.ack:result.ack;
    if(boardWindow)persistedGraph=advanceWindowBaseline(persistedGraph,result.result.graph,request.operations);
    state.lastAck=ack;if(ack.changed){window.dispatchEvent(new Event('inkbridge:references-committed'));if(!boardWindow)window.inkbridge.workspaceCommitted();}return ack;
  },
    beforeFlush:async()=>{
      for(const [editor,contentId]of [...modalEditors]){if(editor.isComposing())await new Promise(resolve=>editor.getRootElement().addEventListener('compositionend',()=>queueMicrotask(resolve),{once:true}));readLiveEditor(editor,contentId);}
      for(const [nodeId,editor]of [...editors]){
        if(editor.isComposing())await new Promise(resolve=>editor.getRootElement().addEventListener('compositionend',()=>queueMicrotask(resolve),{once:true}));
        readLiveEditor(editor,instances.get(nodeId)?.contentId);
      }
    },onStatus:value=>{state.persistence=value;$('#persistence-status').textContent=value.error?`未保存：${value.error}`:value.saving?'正在保存…':value.dirty?'有待保存內容':`已保存 · v${value.revision}`;}});
  if(boardWindow){const recover=document.createElement('button');recover.id='board-window-recover';recover.textContent='保留草稿並重新載入';recover.hidden=true;recover.className='px-2 py-1 text-xs text-danger';$('#persistence-status').after(recover);
    const status=coordinator.onStatus;coordinator.onStatus=value=>{status(value);recover.hidden=!value.error;};
    recover.onclick=async()=>{try{document.body.inert=true;coordinator.dispose();await coordinator.flushTail.catch(()=>{});while(pendingExternal.size)await Promise.all([...pendingExternal]);await coordinator.beforeFlush();coordinator.dispose();
      const response=await window.inkbridge.noteCall({method:'saveDraft',payload:{kind:'board-window',boardId,operations:[...coordinator.pending.values()],contents:[...contents.values()],instances:[...instances.values()]}});if(!response.ok)throw Error(response.error.message);
      sessionStorage.setItem('inkbridge-board-recovery',response.result.file);location.reload();
    }catch(error){document.body.inert=false;report(error);}};
    const recovery=sessionStorage.getItem('inkbridge-board-recovery');if(recovery){$('#board-navigation-status').textContent='舊草稿保留於 '+recovery;sessionStorage.removeItem('inkbridge-board-recovery');}
  }
  state.flush=()=>coordinator.flush();state.load=()=>window.inkbridge.load();
  const sections=createOriginalSections({graph,navigate,coordinator,instances,store:originalStore,toNode,getBoardId:()=>boardId,convertSection:row=>r(19281).YH.sectionToGroupNode(row),catalogOperation});
  function toNode(item){return projectGroupedNode(toLocalNode(item),sections.sections);}
  function toLocalNode(item){
    const content=contents.get(item.contentId);
    if(content?.kind==='pdf'){const card={...(graph.cardMetadata||[]).find(row=>row.id===item.contentId),...content};return r(19281).YH.pdfCardInstanceToPdfCardNode({...item.attributes,...item,objectId:item.contentId,whiteboardId:item.boardId},card,files.get(card.fileId));}
    if(content?.kind==='image'||item.attributes?.type==='MediaCard'||item.attributes?.type==='image'){
      const mediaCard={...(graph.cardMetadata||[]).find(row=>row.id===item.contentId),...content,type:'image'};
      return r(19281).YH.mediaCardInstanceToMediaCardNode({...item.attributes,...item,objectId:item.contentId,whiteboardId:item.boardId},mediaCard);
    }
    return r(19281).YH.convertNoteCardToNode({...content,content:noteDocument(content)},{isAutoHeight:true,scale:1,color:'#fff',...item.attributes,id:item.id,objectId:item.contentId,whiteboardId:item.boardId,x:item.x,y:item.y,width:item.width,height:item.height});
  }
  function addCard(title='',body='',point){
    const controls=state.controls,box=$('#board').getBoundingClientRect();point??=controls.screenToFlowPosition({x:box.x+box.width/2,y:box.y+box.height/2});
    const contentId=crypto.randomUUID(),instanceId=crypto.randomUUID(),content={id:contentId,title,body,document:title||body?noteDocument({title,body}):r(19281).YH.newEmptyEditorContent(),kind:'text',tone:'sage'};
    putContent(content,body);const item={id:instanceId,contentId,boardId,x:point.x,y:point.y,width:520,height:200,z:instances.size};instances.set(item.id,item);coordinator.stage({type:'putInstance',data:item});
    originalStore.getState().addNodes([toNode(item)]);return instanceId;
  }
  if(!graph.boards.length){const board={id:boardId,title:'靈感白板',view:{x:80,y:60,zoom:.8}};boards.set(boardId,board);coordinator.stage({type:'putBoard',data:board});}
  sections.hydrate();originalStore.getState().setConnections([]);
  if(graph.revision===0&&!contents.size&&!instances.size){const contentId=crypto.randomUUID(),id=crypto.randomUUID(),document=noteDocument({title:'InkBridge 原版白板',body:'點卡片進入原版編輯器。\n雙擊空白處新增卡片。'});putContent({id:contentId,document,kind:'text',tone:'sage'});const item={id,contentId,boardId,x:20,y:20,width:520,height:200,z:0};instances.set(id,item);coordinator.stage({type:'putInstance',data:item});originalStore.getState().setNodes([toNode(item)]);}
  const pageProps=await fetch('/_next/data/LOq0EGi9XWnc3BD21aEGY/zh-TW/board.json').then(response=>response.json());window.__NEXT_DATA__={buildId:'LOq0EGi9XWnc3BD21aEGY',page:'/board',query:{},props:pageProps,isFallback:false};
  const RouterContext=r(29242).RouterContext,pageLoader=new(r(43867).default)(window.__NEXT_DATA__.buildId,'');
  const router=r(51648).createRouter('/flow',{whiteboardId:boardId},'/zh-TW/flow?whiteboardId='+encodeURIComponent(boardId),{initialProps:pageProps,pageLoader,App:r(64744).default,Component:Canvas,wrapApp:component=>component,subscription:()=>{throw Error('Navigation has not been connected to the InkBridge shell');},isFallback:false,locale:'zh-TW',locales:['zh-TW','zh','en'],defaultLocale:'zh-TW',isPreview:false});
  window.router=router;Object.defineProperty(globalThis,'__inkbridgeRoutePath',{configurable:true,get:()=>router.pathname});
  function navigate(operation){const task=navigationTail.catch(()=>{}).then(operation);navigationTail=task;return task;}
  function updateBoardTitle(){const title=boards.get(boardId)?.title||'';if(boardWindow)document.title=title+' — InkBridge';$('.breadcrumb strong').textContent=title;$('.board-heading h2').firstChild.textContent=title;const b=$('#board');if(b)b.dataset.flowCanvasWhiteboardId=boardId;}
  function switchBoard(id){return navigate(async()=>{
    if(!boards.has(id)||boards.get(id).attributes?.isTrashed)throw Error('白板不存在或已移至回收站');if(id===boardId&&!state.home)return;
    $('#board-navigation-status').textContent='正在保存並切換…';
    try{
      await coordinator.flush();
      ReactDOM.flushSync(()=>originalStore.getState().setEditingNode(null));await coordinator.flush();
      navigationChanging=true;boardId=id;
      const b=$('#board');if(b)b.dataset.flowCanvasWhiteboardId=id;
      ReactDOM.flushSync(()=>{originalStore.getState().setSelectedNodeIds(new Set());sections.hydrate();state.renderActive(id);state.home=false;state.renderHome(false);state.page='flow';state.renderPage('flow');});
      connections.hydrate(await window.inkbridge.load());
      await state.controls.setViewport(boards.get(id).view,{duration:0});await shell.selected();updateBoardTitle();
    }finally{navigationChanging=false;$('#board-navigation-status').textContent='';}
  });}
  function showHome(page='home'){return navigate(async()=>{await coordinator.flush();ReactDOM.flushSync(()=>{originalStore.getState().setEditingNode(null);originalStore.getState().setSelectedNodeIds(new Set());});await coordinator.flush();shell.homeSelected(page);ReactDOM.flushSync(()=>{state.home=true;state.renderHome(true);state.page=page;state.renderPage(page);});});}
  function showNote(id){return navigate(async()=>{if(contents.get(id)?.kind!=='text')throw Error('筆記卡片不存在');await coordinator.flush();ReactDOM.flushSync(()=>originalStore.getState().setEditingNode(null));await coordinator.flush();Object.assign(router.state,{pathname:'/note-detail',route:'/note-detail',query:{id},asPath:'/zh-TW/note-detail?id='+encodeURIComponent(id)});ReactDOM.flushSync(()=>{state.home=true;state.renderHome(true);state.page='note-detail';state.renderPage('note-detail');});await shell.selectedNote(id,contents.get(id).title);});}
  function showPdf(id){return navigate(async()=>{const content=contents.get(id);if(content?.kind!=='pdf')throw Error('PDF card missing');await coordinator.flush();ReactDOM.flushSync(()=>originalStore.getState().setEditingNode(null));await coordinator.flush();Object.assign(router.state,{pathname:'/pdf',route:'/pdf',query:{pdfId:id,fileId:content.fileId||graph.cardMetadata?.find(row=>row.id===id)?.fileId},asPath:'/zh-TW/pdf?pdfId='+encodeURIComponent(id)});ReactDOM.flushSync(()=>{state.home=true;state.renderHome(true);state.page='pdf';state.renderPage('pdf');});await shell.selectedNote(id,content.title,r(81638).R.PDFCard);});}
  function catalogOperation(kind,data){return {type:'putCatalog',kind,data:JSON.parse(JSON.stringify(data))};}
  function writeCatalog(method,payload){return navigate(async()=>{
    await coordinator.flush();const current=await window.inkbridge.load(),folders=current.folders||[],refs=current.whiteboardInstances||[],now=new Date().toISOString();let ops=[];
    if(method==='deleteWhiteboardFolder')ops=folderDeletionOperations(current,payload,now);
    else if(method==='updateFoldersOrder'){ops=payload.map((id,order)=>{const folder=folders.find(folder=>folder.id===id);if(!folder)throw Error('分組不存在');return catalogOperation('folder',{...folder,order,lastEditedTime:now});});}
    else{const kind=method.includes('Folder')?'folder':'whiteboard-instance',rows=kind==='folder'?folders:refs,previous=rows.find(row=>row.id===payload.id);
      if((method==='addFolder'||method==='createWhiteboardInstance')&&previous)throw Error('目錄ID已存在');
      if((method==='updateFolder'||method==='updateWhiteboardInstance')&&!previous)throw Error('目錄項目不存在');
      ops=[catalogOperation(kind,{...previous,...payload,lastEditedTime:now})];}
    for(const operation of ops)coordinator.stage(operation);await coordinator.flush();if(method==='deleteWhiteboardFolder')for(const board of (await window.inkbridge.load()).boards)boards.set(board.id,board);return true;
  });}
  function writeWhiteboard(payload,{create=false,trash=false,restore=false,folderId}={}){return navigate(async()=>{
    await coordinator.flush();const id=typeof payload==='string'?payload:payload.id,previous=boards.get(id);
    if(create&&previous)throw Error('白板ID已存在');if(!create&&!previous)throw Error('白板不存在');
    const current=await window.inkbridge.load(),folders=current.folders||[],refs=current.whiteboardInstances||[],affected=refs.filter(ref=>ref.whiteboardId===id),ops=[];
    if((trash||restore)&&new Set(affected.filter(ref=>ref.containerType==='folder').map(ref=>ref.containerId)).size>1)throw Error('此白板有多個分組引用，復原規則尚未驗證；未變更資料。');
    const {id:_,name,...attributes}=typeof payload==='string'?{}:payload;
    const now=new Date().toISOString(),board={id,title:create?name:name??previous.title,view:previous?.view||{x:0,y:0,zoom:1},attributes:{...previous?.attributes,...attributes,...(trash||restore?{isTrashed:trash}:{}),lastEditedTime:now}};let boardInstance;
    ops.push({type:'putBoard',data:board});
    if(create&&folderId){const folder=folders.find(folder=>folder.id===folderId);if(!folder)throw Error('分組不存在');boardInstance={...r(19281).YH.newWhiteboardInstance({whiteboardId:id,containerId:folderId,width:600,height:400,x:0,y:0}),containerType:'folder',rank:refs.length};ops.push(catalogOperation('whiteboard-instance',boardInstance),catalogOperation('folder',{...folder,whiteboardInstanceIds:[...folder.whiteboardInstanceIds,boardInstance.id],lastEditedTime:now}));}
    if(trash||restore){for(const ref of affected)ops.push(catalogOperation('whiteboard-instance',{...ref,isTrashed:trash||(ref.containerType==='folder'&&!folders.some(folder=>folder.id===ref.containerId)),lastEditedTime:now}));
      const ids=new Set(affected.map(ref=>ref.id));
      if(trash){const folder=folders.find(folder=>folder.whiteboardInstanceIds.some(id=>ids.has(id)));if(folder)ops.push(catalogOperation('folder',{...folder,whiteboardInstanceIds:folder.whiteboardInstanceIds.filter(id=>!ids.has(id)),lastEditedTime:now}));}
      else{const ref=affected.find(ref=>ref.containerType==='folder');if(ref){const folder=folders.find(folder=>folder.id===ref.containerId);if(folder)ops.push(catalogOperation('folder',{...folder,whiteboardInstanceIds:[...new Set([...folder.whiteboardInstanceIds,ref.id])],lastEditedTime:now}));}}}
    for(const operation of ops)coordinator.stage(operation);await coordinator.flush();boards.set(id,board);
    if(id===boardId)updateBoardTitle();return {board,boardInstance};
  });}
  const flushAll=async()=>{do{if(pendingExternal.size)await Promise.all([...pendingExternal]);await navigationTail.catch(()=>{});}while(pendingExternal.size);return coordinator.flush();};state.flush=flushAll;
  function registerModalEditor(contentId,editor){if(modalEditors.has(editor))return;modalEditors.set(editor,contentId);editorSnapshots.set(editor,JSON.stringify(bodyFromEditor(editor).document));const read=()=>readLiveEditor(editor,contentId);const offUpdate=editor.registerUpdateListener(({tags})=>{if(tags.has('editor-force-update')){editorSnapshots.set(editor,JSON.stringify(bodyFromEditor(editor).document));return;}queueMicrotask(read);});let offRoot;offRoot=editor.registerRootListener(root=>{if(!root){queueMicrotask(()=>{try{read();}catch(error){report(error);}offUpdate();offRoot?.();modalEditors.delete(editor);});}});}
  function replaceContentDocument(contentId,document){const targets=[...modalEditors].filter(([,id])=>id===contentId).map(([editor])=>editor).concat([...editors].filter(([id])=>instances.get(id)?.contentId===contentId).map(([,editor])=>editor));const parsed=targets.map(editor=>[editor,editor.parseEditorState(document)]);for(const [editor,value]of parsed)editor.setEditorState(value);acceptContentDocument(contentId,document);}
  globalThis.__inkbridgeRegisterSidebarEditor=registerModalEditor;
  const writeNoteBase=createOriginalNoteWriter({hydrateScene:sections.hydrate,navigate,coordinator,load:()=>window.inkbridge.load(),contents,instances,putContent,acceptContentDocument,replaceContentDocument,catalogOperation,store:originalStore,toNode,getBoardId:()=>boardId,getLiveDocument:id=>[...modalEditors].some(([editor,contentId])=>contentId===id&&editor.getRootElement()?.isConnected)?contents.get(id)?.document:null});
  const writeNote=async(method,payload)=>{const result=await writeNoteBase(method,payload);if(method==='registerFiles')for(const file of payload.files)files.set(file.id,file);if(['deleteNoteCardInstance','batchDeleteNoteCardInstances','batchDeleteCardsByType'].includes(method))connections.hydrate(await window.inkbridge.load());return result;};
  const tags=createOriginalTags({r,navigate,coordinator,load:()=>window.inkbridge.load(),catalogOperation});
  const bookmarks=createOriginalBookmarks({r,redux,navigate,coordinator,load:()=>window.inkbridge.load(),catalogOperation});await bookmarks.ready();
  const pdf=createOriginalPdf({navigate,coordinator,load:()=>window.inkbridge.load(),contents,instances,putContent,catalogOperation,store:originalStore,toNode,getBoardId:()=>boardId});
  const connections=createOriginalConnections({r,navigate,coordinator,load:()=>window.inkbridge.load(),store:originalStore,catalogOperation,getBoardId:()=>boardId});connections.hydrate(graph);
  function applySharedGraph(next){
    const replace=(map,rows)=>{map.clear();for(const row of rows||[])map.set(row.id,row);};
    for(const key of Object.keys(graph))delete graph[key];Object.assign(graph,structuredClone(next));
    replace(contents,next.contents);replace(instances,next.instances);replace(boards,next.boards);replace(files,next.files);replace(sections.sections,next.sections);
    for(const [editor,id]of modalEditors){const content=contents.get(id);if(!content){editor.setEditable(false);continue;}if(!editor.isComposing()&&documentIdentity(bodyFromEditor(editor).document)!==documentIdentity(content.document)){editor.setEditorState(editor.parseEditorState(content.document),{tag:'editor-force-update'});editor.update(()=>{},{discrete:true,tag:'editor-force-update'});editorSnapshots.set(editor,JSON.stringify(bodyFromEditor(editor).document));}}
    for(const content of contents.values())if(content.kind==='text')redux.dispatch(r(23407).yc.updateNoteCard({id:content.id,title:content.title,content:content.document}));
    sections.hydrate();connections.hydrate(next);shell?.hydrate(next);updateBoardTitle();
  }
  shell=connectOriginalShell({sections,requireOriginal:r,React,ReactDOM,redux,router,flush:()=>coordinator.flush(),flushAll,registerModalEditor,writeNote,tags,bookmarks,pdf,connections,switchBoard,showHome,showNote,showPdf,writeWhiteboard,writeCatalog,getActiveBoardId:()=>boardId,onError:report});
  let remoteTail=Promise.resolve(),closeEpoch=0;
  globalThis.__inkbridgeRemoteRequest=request=>{
    const task=remoteTail.catch(()=>{}).then(async()=>{
      const {method,cardId,payload}=request;
      if(method==='flush'){const epoch=closeEpoch;await flushAll();await shell.settle();await flushAll();if(epoch!==closeEpoch)throw Error('關閉已取消');if(request.freeze!==false)document.body.inert=true;return {saved:true};}
      if(method==='workspaceCommit'){
        await flushAll();const current=await window.inkbridge.load(),operations=payload.request.operations;
        for(const [editor,id]of modalEditors){if(editor.isComposing())throw Object.assign(Error('主視窗仍在組字；白板視窗草稿保留'),{code:'WORKSPACE_CONFLICT'});readLiveEditor(editor,id);}
        if(coordinator.pending.size)throw Object.assign(Error('主視窗有新的待保存內容；白板視窗草稿保留'),{code:'WORKSPACE_CONFLICT'});
        assertWindowExpectations(current,operations,payload.expected);
        for(const operation of operations)coordinator.stage(operation);
        applySharedGraph(projectWindowOperations(current,operations));
        const ack=await coordinator.flush(),saved=await window.inkbridge.load();
        for(const operation of operations)if(operation.type==='putContent'&&documentIdentity(saved.contents.find(row=>row.id===operation.data.id)?.document)!==documentIdentity(operation.data.document))throw Object.assign(Error('保存期間另一個視窗更新了卡片；此白板草稿保留'),{code:'WORKSPACE_CONFLICT'});
        return {ack:{...ack,requestId:payload.request.requestId},graph:saved};
      }
      if(method==='navigate'){await flushAll();return router.push(payload.href);}
      if(method==='service'){
        if(payload.name==='openCardInMainModal'){await flushAll();redux.dispatch(r(22676).aV({show:true,params:payload.payload}));return {success:true};}
        if(payload.name==='registerFiles')return writeNote('registerFiles',payload.payload);
        if(!standaloneServices.includes(payload.name)||!globalThis.__inkbridgeServices.has(payload.name))throw Error('Unsupported child editor service: '+payload.name);
        return globalThis.__inkbridgeServices.call(payload.name,payload.payload);
      }
      await flushAll();const currentGraph=await window.inkbridge.load(),current=currentGraph.contents.find(row=>row.id===cardId&&row.kind==='text'&&!currentGraph.cardMetadata?.some(meta=>meta.id===cardId&&meta.isTrashed));
      if(!current)throw Object.assign(Error('卡片已不存在或已移至回收站'),{code:'NOTE_UNAVAILABLE'});
      if(method==='loadNote')return {content:current,workspaceId:currentGraph.workspaceId};
      if(method!=='commitNote')throw Error('Unsupported remote note operation');
      const noteDoc=noteDocument({document:payload.document});
      // A native input may arrive while the SQLite read above is awaiting IPC.
      // Do not replace that newly typed main-window draft with a child snapshot.
      for(const [editor,id]of modalEditors)if(id===cardId){if(editor.isComposing())throw Object.assign(Error('主視窗仍在組字；子視窗草稿保留'),{code:'CONTENT_CONFLICT'});readLiveEditor(editor,id);}
      if(documentIdentity(contents.get(cardId)?.document)!==documentIdentity(current.document))throw Object.assign(Error('主視窗有較新的待保存內容；子視窗草稿保留'),{code:'CONTENT_CONFLICT'});
      if(checkNoteVersion(current,payload.expectedRevision,noteDoc)){
        replaceContentDocument(cardId,noteDoc);
        // Complete peer editor application before beforeFlush reads their state.
        for(const [editor,id]of modalEditors)if(id===cardId){editor.update(()=>{},{discrete:true,tag:'editor-force-update'});editorSnapshots.set(editor,JSON.stringify(bodyFromEditor(editor).document));}
        await writeNote('updateNoteCard',{id:cardId,updates:{content:noteDoc}});
      }
      const saved=(await window.inkbridge.load()).contents.find(row=>row.id===cardId);
      if(!saved||documentIdentity(saved.document)!==documentIdentity(noteDoc))throw Object.assign(Error('另一視窗在保存期間更新了卡片；子視窗草稿保留'),{code:'CONTENT_CONFLICT'});
      return {requestId:payload.requestId,revision:saved.revision,changed:saved.revision!==current.revision};
    });remoteTail=task;return task;
  };
  window.inkbridge.onBridgeRequest(request=>globalThis.__inkbridgeRemoteRequest(request));
  if(boardWindow){let refreshTail=Promise.resolve();window.inkbridge.onWorkspaceUpdated(()=>{const barrier=coordinator.flushTail;refreshTail=refreshTail.catch(()=>{}).then(()=>barrier.catch(()=>{})).then(async()=>{
    if(!state.ready||coordinator.pending.size||coordinator.inflight||[...modalEditors.keys()].some(editor=>editor.isComposing()))return;
    await navigationTail.catch(()=>{});const next=await window.inkbridge.load();for(const [editor,id]of modalEditors)readLiveEditor(editor,id);
    if(coordinator.pending.size||coordinator.inflight)return;
    applySharedGraph(next);persistedGraph=structuredClone(next);coordinator.revision=next.revision;coordinator.status();
  }).catch(report);});}
  shell.hydrate(graph);await shell.ready;if(!boards.get(boardId)?.attributes?.isTrashed)await shell.selected();else {state.home=true;shell.homeSelected();}updateBoardTitle();state.shellModules=shell.modules;state.switchBoard=switchBoard;
  function FlowAdapter(props){
    const editorRef=React.useRef(null);
    React.useEffect(()=>()=>{const editor=editorRef.current;if(editor){try{const value=bodyFromEditor(editor);acceptDocument(props.nodeId,value.document,value.body);}catch(error){report(error);}if(editors.get(props.nodeId)===editor)editors.delete(props.nodeId);}},[props.nodeId]);
    return React.createElement(Flow,{...props,onEditorReady:editor=>{editorRef.current=editor;editors.set(props.nodeId,editor);registerModalEditor(instances.get(props.nodeId)?.contentId,editor);state.lastEditorNode=props.nodeId;}});
  }
  function CanvasPasteListener(){
    if(typeof r(64744).InkBridgeUseCanvasPaste!=='function')throw Error('Native canvas paste hook is not exported');
    r(64744).InkBridgeUseCanvasPaste();
    return null;
  }
  function NativeZoomLod(){const zoom=React.useSyncExternalStore(originalStore.subscribe,()=>originalStore.getState().view.scale),lod=r(48626).InkBridgeUseZoomLod(zoom);React.useEffect(()=>lod.zoomchange({zoom}),[zoom]);return null;}
  // Native48626 mounts90214 under FlowContext and passes14153 to Canvas.
  // Keep that parent lifecycle: the hook owns outside-click, position and cleanup.
  function NativeCanvas({flowContextValue,...props}){
    const nativeWrites=r(99665).U(props.nodes);
    const nativeDrop=r(97101).y({whiteboardId:props.whiteboardId});
    const menu=r(90214).av({updateNodeDataById:flowContextValue.updateNodeDataById});
    return React.createElement(React.Fragment,null,
      React.createElement(Canvas,{...props,onDrop:event=>globalThis.__inkbridgeTrackOperation(()=>nativeDrop.handleDrop(event)).catch(report),onDragOver:nativeDrop.handleDragOver,onNodeDragEnd:nativeWrites.syncNodesPosition,onNodesDelete:nativeWrites.deleteNodes,onNodeTitleChange:(id,title)=>sections.sections.has(id)?sections.call('updateSection',{id,updates:{title}}).catch(report):undefined,onNodeContextMenu:menu.onNodeContextMenu,
        multiSelectionToolbar:selection=>React.createElement(r(14153)._,{...selection,
          whiteboardId:props.whiteboardId,nodes:props.nodes,
          setNodes:originalStore.getState().setNodes,setConnections:originalStore.getState().setConnections,
          fitView:state.controls.fitView,fitBounds:state.controls.fitBounds,
          pushUndoSnapshot:flowContextValue.pushUndoSnapshot})}),menu.renderMenu());
  }
  // Native48626 consumes23407.fitviewObjectParam after routing to a board.
  // Keep the original focus/selection contract against the owned Canvas store.
  function NativeReferenceFocus({home,nodes}){
    const request=React.useSyncExternalStore(redux.subscribe,()=>redux.getState().flow.fitviewObjectParam);
    React.useEffect(()=>{
      if(home||!request?.id)return;
      const requestedBoard=request.globalModalParams?.objectId;if(boards.has(requestedBoard)&&requestedBoard!==boardId)return;
      const target=nodes.find(node=>node.id===request.id||node.data?.objectId===request.id);
      if(!target)return;
      originalStore.getState().setSelectedNodeIds(new Set([target.id]));
      state.controls.fitView({nodes:[{id:target.id}],duration:400,maxZoom:1});
      redux.dispatch(r(23407)._z({id:''}));
    },[home,nodes,request]);return null;
  }
  function App(){
    const onlyTitle=React.useSyncExternalStore(redux.subscribe,()=>redux.getState().ui.onlyDisplayCardTitle),smallTextSize=React.useSyncExternalStore(redux.subscribe,()=>redux.getState().ui.textSizeAtSmallZoom);
    const nodes=React.useSyncExternalStore(originalStore.subscribe,()=>originalStore.getState().nodes),sceneConnections=React.useSyncExternalStore(originalStore.subscribe,()=>originalStore.getState().connections),mode=React.useSyncExternalStore(redux.subscribe,()=>redux.getState().flow.controlMode);state.setMode=value=>redux.dispatch(r(23407).Uw(value));state.controls=r(23).wf();
    const [activeBoardId,setActiveBoardId]=React.useState(boardId);state.renderActive=setActiveBoardId;
    const [home,setHome]=React.useState(!!state.home);state.renderHome=setHome;
    const [page,setPage]=React.useState(state.home?'home':'flow');state.renderPage=setPage;
    React.useEffect(()=>{$('#add-card').disabled=home;$('#add-card').hidden=home;$('#board').inert=home;$('#original-zoom-controls').inert=home;},[home]);
    const FlowContext=r(48626).FLowContext;
    const flowContextValue=React.useMemo(()=>({
      clickMention:()=>{},
      syncEditorContentToAllCardInstances:(contentId,doc,body)=>acceptContentDocument(contentId,doc,body),
      getCurrentNodeToFocusRef:()=>"",
      clearCurrentNodeToFocusRef:()=>{},
      updateNodeById:(id,updates)=>{
        originalStore.getState().setNodes(nodes=>nodes.map(n=>n.id===id?{...n,...updates}:n));
      },
      updateNodeDataById:(id,dataUpdates)=>{
        originalStore.getState().setNodes(nodes=>nodes.map(n=>n.id===id?{...n,data:{...n.data,...dataUpdates}}:n));
        writeNote('updateNoteCardInstance',{id,updates:dataUpdates}).catch(report);
      },
      updateNodeDataByObjectId:(objectId,dataUpdates)=>{
        originalStore.getState().setNodes(nodes=>nodes.map(n=>n.data?.objectId===objectId?{...n,data:{...n.data,...dataUpdates}}:n));
        for(const [id,item] of instances){
          if(item.contentId===objectId)writeNote('updateNoteCardInstance',{id,updates:dataUpdates}).catch(report);
        }
      },
      getAllEdges:connections.edges,
      getAllNodes:()=>originalStore.getState().nodes,
      getSelectedNodes:()=>originalStore.getState().nodes.filter(n=>originalStore.getState().selectedNodeIds.has(n.id)),
      updateEdgeById:(id,updates)=>connections.updateEdge(id,updates).catch(report),
      setNodes:originalStore.getState().setNodes,
      whiteboardId:activeBoardId,
      setCurrentNodeToFocus:()=>{},
      editMindmapGlobal:()=>{},
      router,
      setEdges:update=>{const edges=typeof update==='function'?update(connections.edges()):update;originalStore.getState().setConnections(edges.map(edge=>r(19281).YH.connectionToFlowConnection(r(19281).YH.edgeToConnection(edge,boardId))));},
      setConnections:originalStore.getState().setConnections,
      onDeleteNode:(objectOrNode,instanceId)=>{
        // Original85886 calls (objectId, instanceId); Canvas callers may pass a node.
        const id=instanceId||(typeof objectOrNode==='string'?objectOrNode:objectOrNode?.id);
        if(!id||!instances.has(id))return;
        return writeNote('deleteNoteCardInstance',id).catch(report);
      },
      onlyDisplayCardTitle:onlyTitle,
      textSizeAtSmallZoom:smallTextSize,
      onMindmapNodeChangeForUndo:()=>{},
      pushUndoSnapshot:()=>{},
      screenToFlowPosition:point=>state.controls?.screenToFlowPosition(point)||point,
      getNodes:()=>originalStore.getState().nodes,
      requestCanvasRender:()=>state.controls?.requestRender?.(),
    }),[activeBoardId,onlyTitle,smallTextSize]);
    return React.createElement(RouterContext.Provider,{value:router},React.createElement(Provider,{store:redux},React.createElement(Theme,{attribute:'class',defaultTheme:'light',enableSystem:false},React.createElement(CanvasProvider,null,
      React.createElement(FlowContext.Provider,{value:flowContextValue},
        React.createElement(React.Fragment,null,React.createElement(NativeCanvas,{flowContextValue,nodes,readOnly:home,initialDrawingStrokes:[],whiteboardId:activeBoardId,textEditorAdapter:FlowAdapter,controlMode:mode,canvasNavMode:'mouse',canvasBackground:'dots',locale:'zh-TW',defaultViewport:boards.get(activeBoardId)?.view||{x:80,y:60,zoom:.8},
          nodeToolbar:r(19395).z,
          connections:sceneConnections,
          onConnect:event=>connections.connect(event)?.catch(report),
          onConnectionsChange:connections.changed,
          onEdgesDelete:edges=>{for(const edge of edges)connections.call('deleteConnection',typeof edge==='string'?edge:edge.id).catch(report);},
          connectionToolbar:props=>React.createElement(r(32627).L,{...props,updateEdgeById:(id,updates)=>connections.updateEdge(id,updates).catch(report),setEdges:flowContextValue.setEdges,handleDeleteEdge:edges=>{for(const edge of edges)connections.call('deleteConnection',edge.id).catch(report);},clearSelectedEdge:()=>originalStore.getState().setSelectedConnectionId(null)}),
          labelEditor:r(75435).Z,
          pdfViewerComponent:r(96895).ZP,
          onNodeContentChange:(nodeId,document)=>acceptDocument(nodeId,document),
          onViewportChange:view=>{if(activeBoardId===boardId)stageBoardView(view);},
          onDoubleClick:(_event,point)=>{const id=addCard('','',point);originalStore.getState().setSelectedNodeIds(new Set([id]));requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('canvaskit-open-node-editor',{detail:{nodeId:id}})));},
          onLoadingChange:loading=>{if(!loading){$('#loading').hidden=true;state.ready=true;window.inkbridge.ready();}}
        }),React.createElement(shell.ShellPortals,{home,page}),React.createElement(CanvasPasteListener),React.createElement(NativeZoomLod),React.createElement(NativeReferenceFocus,{home,nodes})))))));
  }
  const Translated=r(1643).Jc(App);const reactRoot=ReactDOM.createRoot($('#board'));reactRoot.render(React.createElement(Translated,{pageProps:pageProps.pageProps}));
  originalStore.subscribe(current=>{const count=current.nodes.length;$('#card-count').textContent=count;$('#sidebar-count').textContent=count;$('#zoom-reset').textContent=`${Math.round(current.view.scale*100)}%`;$('#visible-count').textContent=count;$('#lod').textContent='原版';$('#render-stat').textContent='原版 Canvas / NoteCard / Lexical';const selected=current.nodes.find(node=>current.selectedNodeIds.has(node.id));$('#inspector').textContent=selected?helpers.LG(selected.data.content):'點卡片進入原版編輯器';});
  state.inspect=()=>({boardId,nodes:originalStore.getState().nodes,view:originalStore.getState().view,selectedNodeIds:[...originalStore.getState().selectedNodeIds],editingNodeId:originalStore.getState().editingNodeId,editors:[...editors.keys()],errors:state.errors});state.addCard=addCard;
  state.bounds=id=>engine.getNodeBounds(originalStore.getState().nodes.find(node=>node.id===id),graphContext());
  installStorageSettings();
  $('#save-workspace').addEventListener('click',()=>flushAll().catch(report));
  $('#open-trash').addEventListener('click',()=>showHome('trash').catch(report));
  $('#toggle-outline').onclick=()=>redux.dispatch(r(22676).yn({view:r(22676).XM.whiteboard}));
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();flushAll().catch(report);}},true);
  $('#select-tool').onclick=()=>state.setMode('move');$('#pan-tool').onclick=()=>state.setMode('hand');$('#zoom-in').onclick=()=>state.controls.zoomIn();$('#zoom-out').onclick=()=>state.controls.zoomOut();$('#zoom-reset').onclick=()=>state.controls.setViewport({zoom:1});$('#fit').onclick=()=>state.controls.fitView({getBounds:node=>engine.getNodeBounds(node,graphContext())});
  const dialog=$('#new-card-dialog');$('#add-card').onclick=()=>{dialog.showModal();$('#card-title').focus();};$('#cancel-card').onclick=()=>dialog.close();$('#new-card-form').onsubmit=event=>{event.preventDefault();addCard($('#card-title').value,$('#card-body').value);dialog.close();event.target.reset();};
  // The old self-written performance lab is unrelated to this original engine.
  $('.performance-panel')?.setAttribute('hidden','');
  window.inkbridge.onCloseRequested(async request=>{const epoch=++closeEpoch;try{await flushAll();await shell.settle();if(epoch!==closeEpoch)return;document.body.inert=true;await flushAll();if(epoch!==closeEpoch){document.body.inert=false;return;}window.inkbridge.closeResult({requestId:request.requestId,ok:true});}catch(error){document.body.inert=false;if(epoch===closeEpoch)window.inkbridge.closeResult({requestId:request.requestId,ok:false,error:error.message});}});
  window.inkbridge.onCloseCancelled(request=>{closeEpoch++;document.body.inert=false;report(Error(request.message));});
  await coordinator.flush();coordinator.status();
}
boot().catch(error=>{state.errors.push({message:error.message,stack:error.stack});$('#loading').textContent='原版白板接入失敗：'+error.message;});
