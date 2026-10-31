// InkBridge SQLite/UI boundary only. Canvas, gestures, cache, flow overlay and
// editing behavior come from the complete original components and their store.
import {PersistenceCoordinator} from '/inkbridge-core/persistence-coordinator.mjs';
import {noteDocument} from '/inkbridge-core/rich-document.mjs';

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
  const boardId=graph.boards[0]?.id||'board-main',originalStore=r(23).gt,editors=new Map(),helpers=r(45828),engine=r(66597).L;
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
  if(!graph.boards.length)coordinator.stage({type:'putBoard',data:{id:boardId,title:'靈感白板',view:{x:80,y:60,zoom:.8}}});
  originalStore.getState().setNodes([...instances.values()].filter(item=>item.boardId===boardId&&contents.get(item.contentId)?.kind==='text').sort((a,b)=>a.z-b.z).map(toNode));originalStore.getState().setConnections([]);
  if(!instances.size){const contentId=crypto.randomUUID(),id=crypto.randomUUID(),document=noteDocument({title:'InkBridge 原版白板',body:'點卡片進入原版編輯器。\n雙擊空白處新增卡片。'});putContent({id:contentId,document,kind:'text',tone:'sage'});const item={id,contentId,boardId,x:20,y:20,width:520,height:200,z:0};instances.set(id,item);coordinator.stage({type:'putInstance',data:item});originalStore.getState().setNodes([toNode(item)]);}
  const pageProps=await fetch('/_next/data/LOq0EGi9XWnc3BD21aEGY/zh-TW/board.json').then(response=>response.json());window.__NEXT_DATA__={buildId:'LOq0EGi9XWnc3BD21aEGY',page:'/board',query:{},props:pageProps,isFallback:false};
  const RouterContext=r(29242).RouterContext,pageLoader=new(r(43867).default)(window.__NEXT_DATA__.buildId,'');
  const router=r(51648).createRouter('/board',{},'/board',{initialProps:pageProps,pageLoader,App:r(64744).default,Component:Canvas,wrapApp:component=>component,subscription:()=>{throw Error('Navigation has not been connected to the InkBridge shell');},isFallback:false,locale:'zh-TW',locales:['zh-TW','zh','en'],defaultLocale:'zh-TW',isPreview:false});
  function FlowAdapter(props){
    const editorRef=React.useRef(null);
    React.useEffect(()=>()=>{const editor=editorRef.current;if(editor){try{const value=bodyFromEditor(editor);acceptDocument(props.nodeId,value.document,value.body);}catch(error){report(error);}if(editors.get(props.nodeId)===editor)editors.delete(props.nodeId);}},[props.nodeId]);
    return React.createElement(Flow,{...props,onEditorReady:editor=>{editorRef.current=editor;editors.set(props.nodeId,editor);state.lastEditorNode=props.nodeId;}});
  }
  function App(){
    const nodes=React.useSyncExternalStore(originalStore.subscribe,()=>originalStore.getState().nodes);const [mode,setMode]=React.useState('move');state.setMode=setMode;state.controls=r(23).wf();
    return React.createElement(RouterContext.Provider,{value:router},React.createElement(Provider,{store:redux},React.createElement(Theme,{attribute:'class',defaultTheme:'light',enableSystem:false},React.createElement(CanvasProvider,null,
      React.createElement(Canvas,{nodes,connections:[],initialDrawingStrokes:[],whiteboardId:boardId,textEditorAdapter:FlowAdapter,controlMode:mode,canvasNavMode:'mouse',canvasBackground:'dots',locale:'zh-TW',defaultViewport:graph.boards[0]?.view||{x:80,y:60,zoom:.8},
        onNodeContentChange:(nodeId,document)=>acceptDocument(nodeId,document),
        onNodeDragEnd:(node,affected)=>{for(const item of affected?.length?affected:[node])persistGeometry(item);},
        onViewportChange:view=>coordinator.stage({type:'putBoard',data:{id:boardId,title:'靈感白板',view}}),
        onNodesDelete:nodes=>{for(const node of nodes){const id=typeof node==='string'?node:node.id;instances.delete(id);coordinator.stage({type:'deleteInstance',id});}},
        onDoubleClick:(_event,point)=>addCard('新卡片','',point),
        onLoadingChange:loading=>{if(!loading){$('#loading').hidden=true;state.ready=true;window.inkbridge.ready();}}
      })))));
  }
  const Translated=r(1643).Jc(App);const reactRoot=ReactDOM.createRoot($('#board'));reactRoot.render(React.createElement(Translated,{pageProps:pageProps.pageProps}));
  originalStore.subscribe(current=>{const count=current.nodes.length;$('#card-count').textContent=count;$('#sidebar-count').textContent=count;$('#zoom-reset').textContent=`${Math.round(current.view.scale*100)}%`;$('#visible-count').textContent=count;$('#lod').textContent='原版';$('#render-stat').textContent='原版 Canvas / NoteCard / Lexical';const selected=current.nodes.find(node=>current.selectedNodeIds.has(node.id));$('#inspector').textContent=selected?helpers.LG(selected.data.content):'點卡片進入原版編輯器';});
  state.inspect=()=>({nodes:originalStore.getState().nodes,view:originalStore.getState().view,selectedNodeIds:[...originalStore.getState().selectedNodeIds],editingNodeId:originalStore.getState().editingNodeId,editors:[...editors.keys()],errors:state.errors});state.addCard=addCard;
  state.bounds=id=>engine.getNodeBounds(originalStore.getState().nodes.find(node=>node.id===id),graphContext());
  $('#save-workspace').addEventListener('click',()=>coordinator.flush().catch(report));
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();coordinator.flush().catch(report);}},true);
  $('#select-tool').onclick=()=>state.setMode('move');$('#pan-tool').onclick=()=>state.setMode('hand');$('#zoom-in').onclick=()=>state.controls.zoomIn();$('#zoom-out').onclick=()=>state.controls.zoomOut();$('#zoom-reset').onclick=()=>state.controls.setViewport({zoom:1});$('#fit').onclick=()=>state.controls.fitView({getBounds:node=>engine.getNodeBounds(node,graphContext())});
  const dialog=$('#new-card-dialog');$('#add-card').onclick=()=>{dialog.showModal();$('#card-title').focus();};$('#cancel-card').onclick=()=>dialog.close();$('#new-card-form').onsubmit=event=>{event.preventDefault();addCard($('#card-title').value,$('#card-body').value);dialog.close();event.target.reset();};
  // The old self-written performance lab is unrelated to this original engine.
  $('.performance-panel')?.setAttribute('hidden','');
  window.inkbridge.onCloseRequested(async request=>{try{await coordinator.flush();window.inkbridge.closeResult({requestId:request.requestId,ok:true});}catch(error){window.inkbridge.closeResult({requestId:request.requestId,ok:false,error:error.message});}});
  window.inkbridge.onCloseCancelled(request=>report(Error(request.message)));
  await coordinator.flush();
}
boot().catch(error=>{state.errors.push({message:error.message,stack:error.stack});$('#loading').textContent='原版白板接入失敗：'+error.message;});
