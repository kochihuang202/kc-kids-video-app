// Original components are loaded unchanged from the private factory registry.
// This module only maps the existing InkBridge database and routing boundary.
export function connectOriginalShell({requireOriginal:r,React,ReactDOM,redux,router,flush,switchBoard,getActiveBoardId,onError}){
  const ListView=r(74582).ListView,ZoomControls=r(46979).OO;
  const actions=r(17070),folderActions=r(39044);
  const records=graph=>graph.boards.map(board=>({id:board.id,name:board.title,color:'white',icon:null}));
  const catalog=graph=>{const boards=records(graph);return {folders:[],whiteboardInstances:[],whiteboardList:boards,allWhiteboardInstances:[],allWhiteboards:boards,unAttachedWhiteboards:boards};};
  function hydrate(graph){const data=catalog(graph);redux.dispatch(folderActions.Tc(data.folders));redux.dispatch(actions.Dq({boardList:data.whiteboardList,instances:[],allWhiteboardInstances:[],allWhiteboards:data.allWhiteboards,unAttachedWhiteboards:data.unAttachedWhiteboards}));}
  globalThis.__inkbridgeServices={has:name=>name==='getFolders',call:async(name)=>{
    if(name==='getFolders'){await flush();return catalog(await window.inkbridge.load());}
    throw Error('Unsupported InkBridge service: '+name);
  }};
  // Retain the original row's navigation behavior; map its route into our own
  // workspace only after the previous editor and SQLite have acknowledged save.
  router.push=async destination=>{
    const url=new URL(typeof destination==='string'?destination:destination.pathname+'?'+new URLSearchParams(destination.query),location.origin);
    const id=url.searchParams.get('whiteboardId');
    if(!/\/(?:flow)\/?$/.test(url.pathname)||!id)throw Error('This original route is not connected: '+url.pathname);
    try{await switchBoard(id);return true;}catch(error){onError(error);return false;}
  };
  function ShellPortals(){return React.createElement(React.Fragment,null,
    ReactDOM.createPortal(React.createElement('div',{onContextMenuCapture:event=>{event.preventDefault();event.stopPropagation();document.querySelector('#board-navigation-status').textContent='目前支援開啟白板；管理操作尚未接入。';}},React.createElement(ListView,{compact:true,hideOperation:true,sortBy:'name',sortOrder:'asc',classNames:{root:'inkbridge-original-board-tree'}})),document.querySelector('#original-board-list')),
    ReactDOM.createPortal(React.createElement(ZoomControls),document.querySelector('#original-zoom-controls')));
  }
  function selected(){router.query.whiteboardId=getActiveBoardId();}
  return {ShellPortals,hydrate,selected,modules:{list:74582,zoom:46979,service:58850}};
}
