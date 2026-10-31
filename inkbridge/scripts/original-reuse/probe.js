// Host glue only. All editor, store, Skia layout and draw logic are original.
(async()=>{
  const state=window.__originalProbe={phase:'modules',errors:[],failedModules:[],loaded:[],changes:[],editorReady:false,renderReady:false};
  const status=document.querySelector('#status'),require=window.__originalRequire;require.p='/_next/';
  const refresh=()=>{status.textContent=JSON.stringify({renderReady:state.renderReady,editorReady:state.editorReady,persistence:state.persistence,errors:state.errors.map(error=>({stage:error.stage,message:error.message}))},null,2);};
  for(const id of Object.keys(require.m)){const factory=require.m[id];require.m[id]=function(...args){state.loaded.push(id);try{return factory.apply(this,args);}catch(error){state.failedModules.push({id,message:error.message});throw error;}};}
  window.addEventListener('error',event=>state.errors.push({message:event.message,stack:event.error?.stack}));
  window.addEventListener('unhandledrejection',event=>state.errors.push({message:String(event.reason),stack:event.reason?.stack}));
  const text=value=>({type:'text',version:1,text:value,format:0,style:'',detail:0,mode:'normal'});
  const paragraph=value=>({type:'paragraph',version:1,children:[text(value)],direction:null,format:'',indent:0,textFormat:0,textStyle:''});
  const graph=await window.inkbridge.load(),saved=graph.contents.find(content=>content.id==='probe-note');
  const ast=saved?.document||{root:{type:'root',version:1,children:[{...paragraph('原版完整編輯器與渲染器'),type:'heading',tag:'h2'},...Array.from({length:24},(_,i)=>paragraph(`第${i+1}段：原版長文渲染，中文與 English。`))],direction:null,format:'',indent:0}};
  state.document=ast;
  const {PersistenceCoordinator}=await import('/inkbridge-core/persistence-coordinator.mjs');
  let stagedDocument=saved?JSON.stringify(saved.document):null,compositionWait=null;
  function acceptDocument(document,body){
    document=JSON.parse(JSON.stringify(document));state.document=document;
    const serialized=JSON.stringify(document);if(serialized===stagedDocument)return;stagedDocument=serialized;
    const helpers=require(45828);coordinator.stage({type:'putContent',data:{id:'probe-note',title:helpers.LG(document),body:body??helpers.Vj(document),document,kind:'text',tone:'sage'}});
    if(window.__originalRender)window.__originalRender.draw(document);
  }
  const coordinator=new PersistenceCoordinator({revision:graph.revision,commit:async request=>{const result=await window.inkbridge.commit(request);if(!result.ok)throw Error(result.error.message);state.lastAck=result.ack;return result.ack;},
    beforeFlush:async()=>{
      const editor=window.__originalLexical;if(!editor)return;
      if(editor.isComposing()){
        compositionWait??=new Promise(resolve=>editor.getRootElement().addEventListener('compositionend',()=>queueMicrotask(()=>{compositionWait=null;resolve();}),{once:true}));await compositionWait;
      }
      // Original public editor.read(fn) defaults to force-commit; do not treat
      // its throttled onChange or a fixed delay as a database acknowledgement.
      const snapshot=editor.read(()=>({document:editor.getEditorState().toJSON(),body:require(41570).GvG().getTextContent()}));
      acceptDocument(snapshot.document,snapshot.body);
    },onStatus:value=>{state.persistence=value;refresh();}});
  window.__originalBridge={flush:()=>coordinator.flush()};
  window.inkbridge.onCloseRequested(async request=>{try{await coordinator.flush();window.inkbridge.closeResult({requestId:request.requestId,ok:true});}catch(error){window.inkbridge.closeResult({requestId:request.requestId,ok:false,error:error.message});}});
  window.inkbridge.onCloseCancelled(request=>state.errors.push({stage:'close',message:request.message}));
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();coordinator.flush().catch(error=>state.errors.push({stage:'save',message:error.message}));}},true);
  if(!saved){
    coordinator.stage({type:'putBoard',data:{id:'original-porting-board',title:'原版模組移植驗證',view:{x:0,y:0,zoom:1}}});acceptDocument(ast);
    coordinator.stage({type:'putInstance',data:{id:'original-porting-instance',contentId:'probe-note',boardId:'original-porting-board',x:0,y:0,width:520,height:900,z:0}});await coordinator.flush();
  }
  try{
    state.phase='render-module';const {c:TextDrawer}=require(71560),{n:NoteCardDrawer}=require(74137);state.renderExports={TextDrawer:typeof TextDrawer,NoteCardDrawer:typeof NoteCardDrawer};
    state.phase='canvaskit';const kit=require(37757),K=await kit.zj();kit.nY(K);state.kitLoaded=true;
    state.phase='fonts';const fontService=require(65857).fO;
    await new Promise((resolve,reject)=>{fontService.init(K,resolve).catch(reject);});
    state.fontsReady=fontService.areBuiltinFontsReady();const fontMgr=fontService.getFontMgr();
    const canvas=document.querySelector('#original-canvas'),surface=K.MakeCanvasSurface(canvas);if(!surface)throw Error('Original CanvasKit surface unavailable');
    const drawer=new NoteCardDrawer(),context={CanvasKit:K,fontMgr,skCanvas:surface.getCanvas(),view:{scale:1},theme:'light',onlyDisplayCardTitle:false,locale:'zh',selectedNodeIds:new Set()};
    const node={id:'probe-note',type:'NoteCard',x:0,y:0,width:520,data:{content:ast,lastEditedTime:'probe-v1',scale:1,isAutoHeight:true,title:'原版完整編輯器與渲染器',color:'white'}};
    state.phase='draw';const measured=drawer.getCardLayout(node,context);state.measurement={height:measured?.height,keys:Object.keys(measured||{})};
    context.skCanvas.clear(K.WHITE);drawer.draw(null,node,context);surface.flush();state.renderReady=true;
    window.__originalRender={K,drawer,surface,node,context,draw(document){node.data.content=document;node.data.lastEditedTime=String(Date.now());context.skCanvas.clear(K.WHITE);drawer.draw(null,node,context);surface.flush();}};
  }catch(error){state.errors.push({stage:state.phase,message:error.message,stack:error.stack});}
  try{
    state.phase='app-module-order';require(64744);
    state.phase='editor-module';const React=require(27378),ReactDOM=require(31542),{zt:Provider}=require(16125),store=require(63268).Z,Editor=require(73866).default;
    const props=await fetch('/_next/data/LOq0EGi9XWnc3BD21aEGY/zh-TW/board.json').then(response=>response.json());
    window.__NEXT_DATA__={buildId:'LOq0EGi9XWnc3BD21aEGY',page:'/board',query:{},props,isFallback:false};
    const PageLoader=require(43867).default,pageLoader=new PageLoader(window.__NEXT_DATA__.buildId,''),routerModule=require(51648),RouterContext=require(29242).RouterContext;
    state.phase='mount';const Host=()=>React.createElement(RouterContext.Provider,{value:router},React.createElement(Provider,{store},React.createElement(Editor,{editorBlocks:ast,cardId:'probe-note',cardType:'NoteCard',position:'importModal',autoFocus:false,disabled:false,
      onChange:document=>{state.changes.push(document);acceptDocument(document);},
      onEditorReady:editor=>{window.__originalLexical=editor;state.editorReady=true;window.inkbridge.ready();refresh();}})));
    const router=routerModule.createRouter('/board',{},'/board',{initialProps:props,pageLoader,App:Host,Component:Host,wrapApp:component=>component,subscription:()=>{throw Error('Navigation requires the application host; editor-only isolation probe does not handle navigation');},isFallback:false,locale:'zh-TW',locales:['zh-TW','zh','en'],defaultLocale:'zh-TW',isPreview:false});
    const Translated=require(1643).Jc(Host);window.__originalRoot=ReactDOM.createRoot(document.querySelector('#editor-host'));window.__originalRoot.render(React.createElement(Translated,{pageProps:props.pageProps}));
  }catch(error){state.errors.push({stage:state.phase,message:error.message,stack:error.stack});}
  state.phase='mount-requested';refresh();
})();
