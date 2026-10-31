// Original components are loaded unchanged from the private factory registry.
// This module only maps the existing InkBridge database and routing boundary.
export function connectOriginalShell({requireOriginal:r,React,ReactDOM,redux,router,flush,switchBoard,showHome,getActiveBoardId,onError}){
  const ListView=r(74582).ListView,ZoomControls=r(46979).OO,HistoryTabs=r(23733).InkBridgeHistoryTabs,FlowOutline=r(41).InkBridgeFlowOutline;
  if(!HistoryTabs)throw Error('Apply the original history-tab export patch first');
  const tabActions=r(90561),historyNames=new Set(['getHistoryTabs','createHistoryTab','touchHistoryTab','deleteHistoryTab','updateHistoryTab','updateHistoryTabsOrder']);
  const pendingHistory=new Set();
  const history=(method,payload)=>{const task=window.inkbridge.history({method,payload});pendingHistory.add(task);task.then(()=>pendingHistory.delete(task),()=>pendingHistory.delete(task));return task;};
  async function settle(){while(pendingHistory.size)await Promise.all([...pendingHistory]);}
  const actions=r(17070),folderActions=r(39044);
  const records=graph=>graph.boards.map(board=>({id:board.id,name:board.title,color:'white',icon:null}));
  const catalog=graph=>{const boards=records(graph);return {folders:[],whiteboardInstances:[],whiteboardList:boards,allWhiteboardInstances:[],allWhiteboards:boards,unAttachedWhiteboards:boards};};
  function hydrate(graph){const data=catalog(graph);redux.dispatch(folderActions.Tc(data.folders));redux.dispatch(actions.Dq({boardList:data.whiteboardList,instances:[],allWhiteboardInstances:[],allWhiteboards:data.allWhiteboards,unAttachedWhiteboards:data.unAttachedWhiteboards}));}
  globalThis.__inkbridgeServices={has:name=>name==='getFolders'||name==='getWhiteboard'||historyNames.has(name),call:async(name,payload)=>{
    if(name==='getFolders'){await flush();return catalog(await window.inkbridge.load());}
    if(name==='getWhiteboard'){await flush();const board=(await window.inkbridge.load()).boards.find(board=>board.id===payload);if(!board)throw Error('白板不存在');return {whiteboard:{id:board.id,name:board.title,color:'white',icon:null}};}
    if(historyNames.has(name)){await flush();return history(name,payload);}
    throw Error('Unsupported InkBridge service: '+name);
  }};
  // Retain the original row's navigation behavior; map its route into our own
  // workspace only after the previous editor and SQLite have acknowledged save.
  router.push=async destination=>{
    const url=new URL(typeof destination==='string'?destination:destination.pathname+'?'+new URLSearchParams(destination.query),location.origin);
    const id=url.searchParams.get('whiteboardId');
    if(/\/home\/?$/.test(url.pathname)){try{await showHome();return true;}catch(error){onError(error);return false;}}
    if(!/\/(?:flow)\/?$/.test(url.pathname)||!id)throw Error('This original route is not connected: '+url.pathname);
    try{await switchBoard(id);return true;}catch(error){onError(error);return false;}
  };
  function ShellPortals({home}){return React.createElement(React.Fragment,null,
    ReactDOM.createPortal(React.createElement('div',{onClickCapture:event=>{const button=event.target.closest('[aria-label]');if(button?.getAttribute('aria-label')===r(1643).ag.t('newTab',{ns:'common'})){event.preventDefault();event.stopPropagation();document.querySelector('#board-navigation-status').textContent='新增分頁的其他卡片服務尚未接入；可從清單開啟白板。';}}},React.createElement(HistoryTabs)),document.querySelector('#original-history-tabs')),
    home?ReactDOM.createPortal(React.createElement('div',{style:{position:'absolute',inset:0,zIndex:300,overflow:'auto',background:'white'},onContextMenuCapture:event=>{event.preventDefault();event.stopPropagation();}},React.createElement(ListView,{hideOperation:true,sortBy:'name',sortOrder:'asc'})),document.querySelector('#original-board-home')):null,
    ReactDOM.createPortal(React.createElement('div',{onContextMenuCapture:event=>{event.preventDefault();event.stopPropagation();document.querySelector('#board-navigation-status').textContent='目前支援開啟白板；管理操作尚未接入。';}},React.createElement(ListView,{compact:true,hideOperation:true,sortBy:'name',sortOrder:'asc',classNames:{root:'inkbridge-original-board-tree'}})),document.querySelector('#original-board-list')),
    ReactDOM.createPortal(React.createElement(r(32367).w,{className:'h-full w-full rounded-none bg-transparent shadow-none'},React.createElement(FlowOutline)),document.querySelector('#original-flow-outline')),
    ReactDOM.createPortal(React.createElement(ZoomControls),document.querySelector('#original-zoom-controls')));
  }
  function homeSelected(){Object.assign(router.state,{pathname:'/home',route:'/home',asPath:'/zh-TW/home'});}
  async function selected(){router.query.whiteboardId=getActiveBoardId();Object.assign(router.state,{pathname:'/flow',route:'/flow',asPath:'/zh-TW/flow?whiteboardId='+encodeURIComponent(getActiveBoardId())});const graph=await window.inkbridge.load(),board=graph.boards.find(board=>board.id===getActiveBoardId());
    const value=r(19281).YH.newTab({title:board.title,type:r(81638).R.Whiteboard,sourceId:board.id,parentTabId:'',tabGroupId:'default',icon:'',color:''});
    const result=await history('createHistoryTab',value);if(result.deletedTabId)redux.dispatch(tabActions.ff(result.deletedTabId));redux.dispatch(tabActions.AO(result.tab));
  }
  const ready=history('getHistoryTabs',{}).then(result=>redux.dispatch(tabActions.AY(result.data)));
  return {ShellPortals,FlowOutline,hydrate,selected,homeSelected,ready,settle,modules:{list:74582,zoom:46979,service:58850,tabs:23733,outline:41}};
}
