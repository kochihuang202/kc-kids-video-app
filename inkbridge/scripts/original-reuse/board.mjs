// InkBridge SQLite/UI boundary only. Canvas, gestures, cache, flow overlay and
// editing behavior come from the complete original components and their store.
import {PersistenceCoordinator} from '/inkbridge-core/persistence-coordinator.mjs';
import {noteDocument} from '/inkbridge-core/rich-document.mjs';
import {connectOriginalShell} from './original-shell.mjs';

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
  const graph=await window.inkbridge.load(),info=await window.inkbridge.info(),contents=new Map(graph.contents.map(content=>[content.id,content])),instances=new Map(graph.instances.map(instance=>[instance.id,instance]));
  r(19281).YH.init('inkbridge-local',graph.workspaceId);
  let boardId=graph.boards.find(board=>!board.attributes?.isTrashed)?.id||graph.boards[0]?.id||'board-main',navigationChanging=false,navigationTail=Promise.resolve(),shell;
  const boards=new Map(graph.boards.map(board=>[board.id,board])),originalStore=r(23).gt,editors=new Map(),helpers=r(45828),engine=r(66597).L;
  function stageBoardView(view,id=boardId){if(state.home||navigationChanging||!boards.has(id))return;const board={...boards.get(id),view};boards.set(id,board);coordinator.stage({type:'putBoard',data:board});}
  const graphContext=()=>({CanvasKit:K,fontMgr:fonts.getFontMgr(),view:originalStore.getState().view,theme:'light',locale:'zh-TW'});
  const bodyFromEditor=editor=>editor.read(()=>({document:JSON.parse(JSON.stringify(editor.getEditorState().toJSON())),body:r(41570).GvG().getTextContent()}));
  function putContent(content,body){
    const document=JSON.parse(JSON.stringify(content.document)),title=helpers.LG(document),next={...content,document,title,body:body??helpers.Vj(document)};
    const previous=contents.get(content.id);if(previous&&previous.title===next.title&&previous.body===next.body&&JSON.stringify(previous.document)===JSON.stringify(document))return;
    contents.set(next.id,next);coordinator.stage({type:'putContent',data:next});
  }
  function persistGeometry(node){
    const item=instances.get(node.id);if(!item)return;
    const bounds=engine.getNodeBounds(node,graphContext()),next={...item,x:node.position.x,y:node.position.y,width:node.width||bounds.width,height:bounds.height};
    if(JSON.stringify(next)===JSON.stringify(item))return;instances.set(next.id,next);coordinator.stage({type:'putInstance',data:next});
  }
  function acceptDocument(nodeId,document,body){
    const item=instances.get(nodeId);if(!item)return;const content=contents.get(item.contentId);if(!content)return;
    putContent({...content,document},body);
    const current=originalStore.getState();
    if(current.nodes.some(node=>node.data.objectId===content.id&&JSON.stringify(node.data.content)!==JSON.stringify(document))){
      current.setNodes(nodes=>nodes.map(node=>node.data.objectId===content.id?{...node,data:{...node.data,content:document,title:helpers.LG(document),lastEditedTime:new Date().toISOString()}}:node));
    }
    for(const node of originalStore.getState().nodes)if(node.data.objectId===content.id)persistGeometry(node);
  }
  const coordinator=new PersistenceCoordinator({revision:graph.revision,commit:async request=>{const result=await window.inkbridge.commit(request);if(!result.ok)throw Error(result.error.message);state.lastAck=result.ack;return result.ack;},
    beforeFlush:async()=>{
      for(const [nodeId,editor]of [...editors]){
        if(editor.isComposing())await new Promise(resolve=>editor.getRootElement().addEventListener('compositionend',()=>queueMicrotask(resolve),{once:true}));
        const value=bodyFromEditor(editor);acceptDocument(nodeId,value.document,value.body);
      }
    },onStatus:value=>{state.persistence=value;$('#persistence-status').textContent=value.error?`未保存：${value.error}`:value.saving?'正在保存…':value.dirty?'有待保存內容':`已保存 · v${value.revision}`;}});
  state.flush=()=>coordinator.flush();state.load=()=>window.inkbridge.load();
  function toNode(item){const content=contents.get(item.contentId);return {id:item.id,type:'NoteCard',position:{x:item.x,y:item.y},width:item.width,data:{id:content.id,objectId:content.id,title:content.title,content:noteDocument(content),scale:1,isAutoHeight:true,color:'white',lastEditedTime:String(content.revision||0)}};}
  function addCard(title='新卡片',body='',point){
    const controls=state.controls,box=$('#board').getBoundingClientRect();point??=controls.screenToFlowPosition({x:box.x+box.width/2,y:box.y+box.height/2});
    const contentId=crypto.randomUUID(),instanceId=crypto.randomUUID(),content={id:contentId,title,body,document:noteDocument({title,body}),kind:'text',tone:'sage'};
    putContent(content,body);const item={id:instanceId,contentId,boardId,x:point.x,y:point.y,width:520,height:200,z:instances.size};instances.set(item.id,item);coordinator.stage({type:'putInstance',data:item});
    originalStore.getState().addNodes([toNode(item)]);return instanceId;
  }
  if(!graph.boards.length){const board={id:boardId,title:'靈感白板',view:{x:80,y:60,zoom:.8}};boards.set(boardId,board);coordinator.stage({type:'putBoard',data:board});}
  originalStore.getState().setNodes([...instances.values()].filter(item=>item.boardId===boardId&&contents.get(item.contentId)?.kind==='text').sort((a,b)=>a.z-b.z).map(toNode));originalStore.getState().setConnections([]);
  if(!instances.size){const contentId=crypto.randomUUID(),id=crypto.randomUUID(),document=noteDocument({title:'InkBridge 原版白板',body:'點卡片進入原版編輯器。\n雙擊空白處新增卡片。'});putContent({id:contentId,document,kind:'text',tone:'sage'});const item={id,contentId,boardId,x:20,y:20,width:520,height:200,z:0};instances.set(id,item);coordinator.stage({type:'putInstance',data:item});originalStore.getState().setNodes([toNode(item)]);}
  const pageProps=await fetch('/_next/data/LOq0EGi9XWnc3BD21aEGY/zh-TW/board.json').then(response=>response.json());window.__NEXT_DATA__={buildId:'LOq0EGi9XWnc3BD21aEGY',page:'/board',query:{},props:pageProps,isFallback:false};
  const RouterContext=r(29242).RouterContext,pageLoader=new(r(43867).default)(window.__NEXT_DATA__.buildId,'');
  const router=r(51648).createRouter('/flow',{whiteboardId:boardId},'/zh-TW/flow?whiteboardId='+encodeURIComponent(boardId),{initialProps:pageProps,pageLoader,App:r(64744).default,Component:Canvas,wrapApp:component=>component,subscription:()=>{throw Error('Navigation has not been connected to the InkBridge shell');},isFallback:false,locale:'zh-TW',locales:['zh-TW','zh','en'],defaultLocale:'zh-TW',isPreview:false});
  function navigate(operation){const task=navigationTail.catch(()=>{}).then(operation);navigationTail=task;return task;}
  function updateBoardTitle(){const title=boards.get(boardId)?.title||'';$('.breadcrumb strong').textContent=title;$('.board-heading h2').firstChild.textContent=title;}
  function switchBoard(id){return navigate(async()=>{
    if(!boards.has(id)||boards.get(id).attributes?.isTrashed)throw Error('白板不存在或已移至回收站');if(id===boardId&&!state.home)return;
    $('#board-navigation-status').textContent='正在保存並切換…';
    try{
      await coordinator.flush();
      ReactDOM.flushSync(()=>originalStore.getState().setEditingNode(null));await coordinator.flush();
      navigationChanging=true;boardId=id;
      ReactDOM.flushSync(()=>{originalStore.getState().setSelectedNodeIds(new Set());originalStore.getState().setNodes([...instances.values()].filter(item=>item.boardId===id&&contents.get(item.contentId)?.kind==='text').sort((a,b)=>a.z-b.z).map(toNode));state.renderActive(id);state.home=false;state.renderHome(false);state.page='flow';state.renderPage('flow');});
      await state.controls.setViewport(boards.get(id).view,{duration:0});await shell.selected();updateBoardTitle();
    }finally{navigationChanging=false;$('#board-navigation-status').textContent='';}
  });}
  function showHome(page='home'){return navigate(async()=>{await coordinator.flush();ReactDOM.flushSync(()=>{originalStore.getState().setEditingNode(null);originalStore.getState().setSelectedNodeIds(new Set());});await coordinator.flush();shell.homeSelected(page);ReactDOM.flushSync(()=>{state.home=true;state.renderHome(true);state.page=page;state.renderPage(page);});});}
  const catalogOperation=(kind,data)=>({type:'putCatalog',kind,data:JSON.parse(JSON.stringify(data))});
  function writeCatalog(method,payload){return navigate(async()=>{
    await coordinator.flush();const current=await window.inkbridge.load(),folders=current.folders||[],refs=current.whiteboardInstances||[],now=new Date().toISOString();let ops=[];
    if(method==='updateFoldersOrder'){ops=payload.map((id,order)=>{const folder=folders.find(folder=>folder.id===id);if(!folder)throw Error('分組不存在');return catalogOperation('folder',{...folder,order,lastEditedTime:now});});}
    else{const kind=method.includes('Folder')?'folder':'whiteboard-instance',rows=kind==='folder'?folders:refs,previous=rows.find(row=>row.id===payload.id);
      if((method==='addFolder'||method==='createWhiteboardInstance')&&previous)throw Error('目錄ID已存在');
      if((method==='updateFolder'||method==='updateWhiteboardInstance')&&!previous)throw Error('目錄項目不存在');
      ops=[catalogOperation(kind,{...previous,...payload,lastEditedTime:now})];}
    for(const operation of ops)coordinator.stage(operation);await coordinator.flush();return true;
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
    if(trash||restore){for(const ref of affected)ops.push(catalogOperation('whiteboard-instance',{...ref,isTrashed:trash,lastEditedTime:now}));
      const ids=new Set(affected.map(ref=>ref.id));
      if(trash){const folder=folders.find(folder=>folder.whiteboardInstanceIds.some(id=>ids.has(id)));if(folder)ops.push(catalogOperation('folder',{...folder,whiteboardInstanceIds:folder.whiteboardInstanceIds.filter(id=>!ids.has(id)),lastEditedTime:now}));}
      else{const ref=affected.find(ref=>ref.containerType==='folder');if(ref){const folder=folders.find(folder=>folder.id===ref.containerId);if(!folder)throw Error('原分組不存在；未變更資料');ops.push(catalogOperation('folder',{...folder,whiteboardInstanceIds:[...folder.whiteboardInstanceIds,ref.id],lastEditedTime:now}));}}}
    for(const operation of ops)coordinator.stage(operation);await coordinator.flush();boards.set(id,board);
    if(id===boardId)updateBoardTitle();return {board,boardInstance};
  });}
  shell=connectOriginalShell({requireOriginal:r,React,ReactDOM,redux,router,flush:()=>coordinator.flush(),switchBoard,showHome,writeWhiteboard,writeCatalog,getActiveBoardId:()=>boardId,onError:report});
  shell.hydrate(graph);await shell.ready;if(!boards.get(boardId)?.attributes?.isTrashed)await shell.selected();else {state.home=true;shell.homeSelected();}updateBoardTitle();state.shellModules=shell.modules;state.switchBoard=switchBoard;
  function FlowAdapter(props){
    const editorRef=React.useRef(null);
    React.useEffect(()=>()=>{const editor=editorRef.current;if(editor){try{const value=bodyFromEditor(editor);acceptDocument(props.nodeId,value.document,value.body);}catch(error){report(error);}if(editors.get(props.nodeId)===editor)editors.delete(props.nodeId);}},[props.nodeId]);
    return React.createElement(Flow,{...props,onEditorReady:editor=>{editorRef.current=editor;editors.set(props.nodeId,editor);state.lastEditorNode=props.nodeId;}});
  }
  function App(){
    const nodes=React.useSyncExternalStore(originalStore.subscribe,()=>originalStore.getState().nodes);const [mode,setMode]=React.useState('move');state.setMode=setMode;state.controls=r(23).wf();
    const [activeBoardId,setActiveBoardId]=React.useState(boardId);state.renderActive=setActiveBoardId;
    const [home,setHome]=React.useState(!!state.home);state.renderHome=setHome;
    const [page,setPage]=React.useState(state.home?'home':'flow');state.renderPage=setPage;
    React.useEffect(()=>{$('#add-card').disabled=home;$('#board').inert=home;$('#original-flow-outline').inert=home;$('#original-zoom-controls').inert=home;},[home]);
    return React.createElement(RouterContext.Provider,{value:router},React.createElement(Provider,{store:redux},React.createElement(Theme,{attribute:'class',defaultTheme:'light',enableSystem:false},React.createElement(CanvasProvider,null,
      React.createElement(React.Fragment,null,React.createElement(Canvas,{nodes,connections:[],readOnly:home,initialDrawingStrokes:[],whiteboardId:activeBoardId,textEditorAdapter:FlowAdapter,controlMode:mode,canvasNavMode:'mouse',canvasBackground:'dots',locale:'zh-TW',defaultViewport:graph.boards[0]?.view||{x:80,y:60,zoom:.8},
        onNodeContentChange:(nodeId,document)=>acceptDocument(nodeId,document),
        onNodeDragEnd:(node,affected)=>{for(const item of affected?.length?affected:[node])persistGeometry(item);},
        onViewportChange:view=>{if(activeBoardId===boardId)stageBoardView(view);},
        onNodesDelete:nodes=>{for(const node of nodes){const id=typeof node==='string'?node:node.id;instances.delete(id);coordinator.stage({type:'deleteInstance',id});}},
        onDoubleClick:(_event,point)=>addCard('新卡片','',point),
        onLoadingChange:loading=>{if(!loading){$('#loading').hidden=true;state.ready=true;window.inkbridge.ready();}}
      }),React.createElement(shell.ShellPortals,{home,page}))))));
  }
  const Translated=r(1643).Jc(App);const reactRoot=ReactDOM.createRoot($('#board'));reactRoot.render(React.createElement(Translated,{pageProps:pageProps.pageProps}));
  originalStore.subscribe(current=>{const count=current.nodes.length;$('#card-count').textContent=count;$('#sidebar-count').textContent=count;$('#zoom-reset').textContent=`${Math.round(current.view.scale*100)}%`;$('#visible-count').textContent=count;$('#lod').textContent='原版';$('#render-stat').textContent='原版 Canvas / NoteCard / Lexical';const selected=current.nodes.find(node=>current.selectedNodeIds.has(node.id));$('#inspector').textContent=selected?helpers.LG(selected.data.content):'點卡片進入原版編輯器';});
  state.inspect=()=>({boardId,nodes:originalStore.getState().nodes,view:originalStore.getState().view,selectedNodeIds:[...originalStore.getState().selectedNodeIds],editingNodeId:originalStore.getState().editingNodeId,editors:[...editors.keys()],errors:state.errors});state.addCard=addCard;
  state.bounds=id=>engine.getNodeBounds(originalStore.getState().nodes.find(node=>node.id===id),graphContext());
  $('#save-workspace').addEventListener('click',()=>coordinator.flush().catch(report));
  $('#open-trash').addEventListener('click',()=>showHome('trash').catch(report));
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();coordinator.flush().catch(report);}},true);
  $('#select-tool').onclick=()=>state.setMode('move');$('#pan-tool').onclick=()=>state.setMode('hand');$('#zoom-in').onclick=()=>state.controls.zoomIn();$('#zoom-out').onclick=()=>state.controls.zoomOut();$('#zoom-reset').onclick=()=>state.controls.setViewport({zoom:1});$('#fit').onclick=()=>state.controls.fitView({getBounds:node=>engine.getNodeBounds(node,graphContext())});
  const dialog=$('#new-card-dialog');$('#add-card').onclick=()=>{dialog.showModal();$('#card-title').focus();};$('#cancel-card').onclick=()=>dialog.close();$('#new-card-form').onsubmit=event=>{event.preventDefault();addCard($('#card-title').value,$('#card-body').value);dialog.close();event.target.reset();};
  // The old self-written performance lab is unrelated to this original engine.
  $('.performance-panel')?.setAttribute('hidden','');
  window.inkbridge.onCloseRequested(async request=>{try{await navigationTail.catch(()=>{});await coordinator.flush();await shell.settle();window.inkbridge.closeResult({requestId:request.requestId,ok:true});}catch(error){window.inkbridge.closeResult({requestId:request.requestId,ok:false,error:error.message});}});
  window.inkbridge.onCloseCancelled(request=>report(Error(request.message)));
  await coordinator.flush();coordinator.status();
}
boot().catch(error=>{state.errors.push({message:error.message,stack:error.stack});$('#loading').textContent='原版白板接入失敗：'+error.message;});
