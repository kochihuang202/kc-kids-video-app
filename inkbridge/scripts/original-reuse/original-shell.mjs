// Original components are loaded unchanged from the private factory registry.
// This module only maps the existing InkBridge database and routing boundary.
export function connectOriginalShell({requireOriginal:r,React,ReactDOM,redux,router,flush,switchBoard,showHome,writeWhiteboard,writeCatalog,getActiveBoardId,onError}){
  const ListView=r(74582).ListView,SidebarTree=r(79509).SortableTree,ZoomControls=r(46979).OO,HistoryTabs=r(23733).InkBridgeHistoryTabs,FlowOutline=r(41).InkBridgeFlowOutline;
  const SidebarNavigation=r(78507).InkBridgeSidebarNavigation,NativeFlowUi=r(48626);
  if(!SidebarNavigation||!NativeFlowUi.InkBridgeCreationToolbar)throw Error('Apply native shell UI export patches first');
  // Open the supported original whiteboard view, through its own saved view key.
  // Collections have a separate native catalog, not the history-tab table.
  localStorage.setItem(r(39641).hS,'whiteboards');
  if(!HistoryTabs)throw Error('Apply the original history-tab export patch first');
  const tabActions=r(90561),historyNames=new Set(['getHistoryTabs','createHistoryTab','touchHistoryTab','deleteHistoryTab','updateHistoryTab','updateHistoryTabsOrder']);
  const pendingHistory=new Set();
  const history=(method,payload)=>{const task=window.inkbridge.history({method,payload});pendingHistory.add(task);task.then(()=>pendingHistory.delete(task),()=>pendingHistory.delete(task));return task;};
  async function settle(){while(pendingHistory.size)await Promise.all([...pendingHistory]);}
  const actions=r(17070),folderActions=r(39044);
  const records=graph=>graph.boards.filter(board=>!board.attributes?.isTrashed).map(board=>({color:'white',icon:null,...board.attributes,id:board.id,name:board.title}));
  const catalog=graph=>{const boards=records(graph),folders=[...(graph.folders||[])].sort((a,b)=>(a.order||0)-(b.order||0)),ids=new Set(folders.flatMap(folder=>folder.whiteboardInstanceIds)),refs=graph.whiteboardInstances||[],live=refs.filter(ref=>!ref.isTrashed),attached=refs.filter(ref=>ids.has(ref.id)),boardIds=new Set(attached.map(ref=>ref.whiteboardId));return {folders,whiteboardInstances:attached,whiteboardList:boards.filter(board=>boardIds.has(board.id)),allWhiteboardInstances:live,allWhiteboards:boards,unAttachedWhiteboards:boards.filter(board=>!ids.has(board.id)&&!live.some(ref=>ref.whiteboardId===board.id))};};
  function hydrate(graph){const data=catalog(graph);redux.dispatch(folderActions.Tc(data.folders));redux.dispatch(actions.Dq({boardList:data.whiteboardList,instances:data.whiteboardInstances,allWhiteboardInstances:data.allWhiteboardInstances,allWhiteboards:data.allWhiteboards,unAttachedWhiteboards:data.unAttachedWhiteboards}));}
  const management=new Set(['createWhiteboard','updateBoard','deleteWhiteboard','addBoard','restoreWhiteboard']);
  const catalogServices=new Set(['addFolder','updateFolder','updateFoldersOrder','createWhiteboardInstance','updateWhiteboardInstance']);
  globalThis.__inkbridgeServices={has:name=>['getBoardListByIds','getTabs','getTabGroups','getFolders','getWhiteboard','getTrash','restoreCard','findTargetsByCardIdAndType'].includes(name)||management.has(name)||catalogServices.has(name)||historyNames.has(name),call:async(name,payload)=>{
    if(name==='getBoardListByIds'){await flush();return {whiteboards:records(await window.inkbridge.load()).filter(board=>payload.includes(board.id))};}
    // No collection tabs/groups have been implemented or imported in this own
    // workspace. Report their actual empty catalog; never map history as favorites.
    if(name==='getTabs'||name==='getTabGroups')return {data:[]};
    if(name==='getFolders'){await flush();return catalog(await window.inkbridge.load());}
    if(name==='getWhiteboard'){await flush();const board=(await window.inkbridge.load()).boards.find(board=>board.id===payload);if(!board)throw Error('白板不存在');return {whiteboard:{color:'white',icon:null,...board.attributes,id:board.id,name:board.title}};}
    if(name==='getTrash'){await flush();const graph=await window.inkbridge.load();return {noteCards:[],mindMaps:[],pdfCards:[],highlights:[],videoHighlights:[],audioHighlights:[],noteHighlights:[],mediaCards:[],websiteCards:[],whiteboards:graph.boards.filter(board=>board.attributes?.isTrashed).map(board=>({...board.attributes,id:board.id,name:board.title}))};}
    if(name==='restoreCard'){if(payload.type!=='Whiteboard')throw Error('尚未接入此類型的復原');await writeWhiteboard(payload.id,{restore:true});hydrate(await window.inkbridge.load());return {success:true};}
    if(catalogServices.has(name)){await writeCatalog(name,payload);if(name==='createWhiteboardInstance')return {success:true,relatedWhiteboards:records(await window.inkbridge.load()).filter(board=>board.id===payload.whiteboardId)};return true;}
    if(name==='findTargetsByCardIdAndType'){
      await flush();const graph=await window.inkbridge.load(),ids=new Set(payload.cardIds);
      if(payload.cardType==='Whiteboard')return graph.boards.filter(board=>ids.has(board.id)).map(board=>({...board.attributes,id:board.id,name:board.title}));
      if(payload.cardType==='NoteCard')return graph.contents.filter(content=>ids.has(content.id)&&content.kind==='text').map(content=>({...content,content:content.document}));
      throw Error('尚未接入此引用類型：'+payload.cardType);
    }
    if(management.has(name)){
      try{const result=await writeWhiteboard(name==='addBoard'?payload.board:payload,{create:name==='createWhiteboard'||name==='addBoard',trash:name==='deleteWhiteboard',restore:name==='restoreWhiteboard',folderId:name==='addBoard'?payload.folderId:undefined});hydrate(await window.inkbridge.load());if(name==='deleteWhiteboard'&&payload===getActiveBoardId())await showHome();return name==='addBoard'?{boardInstance:result.boardInstance}:true;}
      catch(error){hydrate(await window.inkbridge.load());onError(error);throw error;}
    }
    if(historyNames.has(name)){await flush();return history(name,payload);}
    throw Error('Unsupported InkBridge service: '+name);
  }};
  // Retain the original row's navigation behavior; map its route into our own
  // workspace only after the previous editor and SQLite have acknowledged save.
  router.push=async destination=>{
    const url=new URL(typeof destination==='string'?destination:destination.pathname+'?'+new URLSearchParams(destination.query),location.origin);
    const id=url.searchParams.get('whiteboardId');
    if(/\/home\/?$/.test(url.pathname)){try{await showHome();return true;}catch(error){onError(error);return false;}}
    if(/\/trash\/?$/.test(url.pathname)){try{await showHome('trash');return true;}catch(error){onError(error);return false;}}
    if(!/\/(?:flow)\/?$/.test(url.pathname)||!id)throw Error('This original route is not connected: '+url.pathname);
    try{await switchBoard(id);return true;}catch(error){onError(error);return false;}
  };
  function TrashView(){const root=React.useRef(null);React.useLayoutEffect(()=>{const disable=()=>{const t=key=>r(1643).ag.t(key,{ns:'common'});for(const button of root.current.querySelectorAll('button'))if(button.getAttribute('aria-label')===t('deletePermanently')||button.textContent.trim()===t('emptyTrash')){button.disabled=true;button.title='本階段只提供復原，永久刪除尚未接入';}};disable();const observer=new MutationObserver(disable);observer.observe(root.current,{childList:true,subtree:true});return ()=>observer.disconnect();},[]);return React.createElement('div',{ref:root,className:'h-full'},React.createElement(r(69193).default));}
  const createInFolder=folderId=>window.dispatchEvent(new CustomEvent(r(39641).GO,{detail:{folderId}}));
  const pendingUi=component=>React.createElement('fieldset',{disabled:true,title:'UI 已移植；此工具的資料與操作流程將逐項接入',onMouseDownCapture:event=>{event.preventDefault();event.stopPropagation();}},React.createElement(component,{inkbridgeUiOnly:true}));
  function ShellPortals({home,page}){const [outlineOpen,setOutlineOpen]=React.useState(false);React.useEffect(()=>{const update=()=>setOutlineOpen(!document.querySelector('#original-flow-outline').hidden);window.addEventListener('inkbridge:outline-visibility',update);return ()=>window.removeEventListener('inkbridge:outline-visibility',update);},[]);return React.createElement(React.Fragment,null,
    ReactDOM.createPortal(React.createElement(r(23733).InkBridgeNavigationControls,{onToggleSidebar:()=>{const sidebar=document.querySelector('.original-sidebar');sidebar.hidden=!sidebar.hidden;document.body.classList.toggle('sidebar-closed',sidebar.hidden);}}),document.querySelector('#original-navigation-controls')),
    ReactDOM.createPortal(React.createElement(SidebarNavigation,{onNavigate:key=>{if(key==='board')showHome().catch(onError);}}),document.querySelector('#original-sidebar-navigation')),
    ReactDOM.createPortal(React.createElement(SidebarNavigation,{horizontal:true,keys:['board','card-list','highlight','quick-notes'],selectedKey:outlineOpen?'board':'',enabledKeys:['board'],onNavigate:key=>{if(key==='board')document.querySelector('#toggle-outline').click();}}),document.querySelector('#original-top-views')),
    !home?ReactDOM.createPortal(pendingUi(NativeFlowUi.InkBridgeCreationToolbar),document.querySelector('#original-native-tools')):null,
    !home?ReactDOM.createPortal(pendingUi(NativeFlowUi.InkBridgeUndoControls),document.querySelector('#original-undo-controls')):null,
    !home?ReactDOM.createPortal(React.createElement(NativeFlowUi.InkBridgeBoardCaption,{isReadOnly:true}),document.querySelector('#original-board-caption')):null,
    ReactDOM.createPortal(React.createElement('div',{onClickCapture:event=>{const button=event.target.closest('[aria-label]');if(button?.getAttribute('aria-label')===r(1643).ag.t('newTab',{ns:'common'})){event.preventDefault();event.stopPropagation();document.querySelector('#board-navigation-status').textContent='新增分頁的其他卡片服務尚未接入；可從清單開啟白板。';}}},React.createElement(HistoryTabs)),document.querySelector('#original-history-tabs')),
    React.createElement(r(64744).InkBridgeCreateWhiteboard),
    React.createElement(r(64744).InkBridgeCreateFolder),
    home?ReactDOM.createPortal(React.createElement('div',{style:{position:'absolute',inset:0,zIndex:300,overflow:'auto',background:'white'}},page==='trash'?React.createElement(TrashView):React.createElement(ListView,{hideOperation:true,onAddWhiteboard:createInFolder,sortBy:'default'})),document.querySelector('#original-board-home')):null,
    ReactDOM.createPortal(React.createElement('div',{className:'flex h-full min-h-0 flex-col',onClickCapture:event=>{const tab=event.target.closest('[role="tab"]');if(tab?.getAttribute('aria-label')===r(1643).ag.t('collections',{ns:'common'})){event.preventDefault();event.stopPropagation();document.querySelector('#board-navigation-status').textContent='收藏資料服務尚未接入；目前保留白板檢視。';}}},React.createElement(SidebarTree)),document.querySelector('#original-board-list')),
    ReactDOM.createPortal(React.createElement(r(32367).w,{className:'h-full w-full rounded-none bg-transparent shadow-none'},React.createElement(FlowOutline)),document.querySelector('#original-flow-outline')),
    ReactDOM.createPortal(React.createElement(ZoomControls),document.querySelector('#original-zoom-controls')));
  }
  function homeSelected(page='home'){Object.assign(router.state,{pathname:'/'+page,route:'/'+page,asPath:'/zh-TW/'+page});}
  async function selected(){router.query.whiteboardId=getActiveBoardId();Object.assign(router.state,{pathname:'/flow',route:'/flow',asPath:'/zh-TW/flow?whiteboardId='+encodeURIComponent(getActiveBoardId())});const graph=await window.inkbridge.load(),board=graph.boards.find(board=>board.id===getActiveBoardId());
    const value=r(19281).YH.newTab({title:board.title,type:r(81638).R.Whiteboard,sourceId:board.id,parentTabId:'',tabGroupId:'default',icon:'',color:''});
    const result=await history('createHistoryTab',value);if(result.deletedTabId)redux.dispatch(tabActions.ff(result.deletedTabId));redux.dispatch(tabActions.AO(result.tab));
  }
  const ready=history('getHistoryTabs',{}).then(result=>redux.dispatch(tabActions.AY(result.data)));
  return {ShellPortals,FlowOutline,hydrate,selected,homeSelected,ready,settle,modules:{sidebar:79509,list:74582,zoom:46979,service:58850,tabs:23733,outline:41}};
}
