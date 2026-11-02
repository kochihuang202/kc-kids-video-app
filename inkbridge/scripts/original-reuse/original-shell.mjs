import {searchGraph,searchBlocks} from '/inkbridge-core/original-search.mjs';
// Original components are loaded unchanged from the private factory registry.
// This module only maps the existing InkBridge database and routing boundary.
import {cardsByFilters,boardPreviews,noteRecord,attachmentRecord} from '/inkbridge-core/original-catalog.mjs';
export function connectOriginalShell({sections,requireOriginal:r,React,ReactDOM,redux,router,flush,flushAll,registerModalEditor,writeNote,tags,bookmarks,pdf,connections,switchBoard,showHome,showNote,showPdf,writeWhiteboard,writeCatalog,getActiveBoardId,onError}){
  const sidebarContent=document.querySelector('.original-sidebar'),leftHost=document.createElement('div'),sidebarParking=document.createElement('div');leftHost.id='original-left-frame';sidebarContent.before(leftHost);sidebarParking.hidden=true;document.body.appendChild(sidebarParking);sidebarParking.appendChild(sidebarContent);
  function SidebarContent(){const ref=React.useRef(null);React.useLayoutEffect(()=>{ref.current.appendChild(sidebarContent);return ()=>sidebarParking.appendChild(sidebarContent);},[]);return React.createElement('div',{ref,style:{height:'100%',minHeight:0}});}
  function NativeLeftSidebar(){const shown=r(16125).v9(state=>state.ui.leftSidebarShow);React.useEffect(()=>{document.body.classList.toggle('sidebar-closed',!shown);},[shown]);React.useEffect(()=>{const width=()=>document.documentElement.style.setProperty('--inkbridge-left-width',(localStorage.getItem('sidebar_left_width')||260)+'px');width();window.addEventListener('sidebar-left-width',width);return ()=>window.removeEventListener('sidebar-left-width',width);},[]);return React.createElement(r(1201).yE,{inkbridgeUiOnly:true,inkbridgeRenderContent:()=>React.createElement(SidebarContent)});}
  function NativeRightSidebar(){const shown=r(16125).v9(state=>state.ui.rightSidebarShow),width=r(16125).v9(state=>state.ui.rightSidebarWidth);React.useLayoutEffect(()=>document.documentElement.style.setProperty('--inkbridge-right-width',(shown?width:0)+'px'),[shown,width]);React.useLayoutEffect(()=>{document.querySelector('#original-flow-outline').hidden=!shown;document.body.classList.toggle('outline-open',shown);document.querySelector('#toggle-outline').setAttribute('aria-expanded',String(shown));window.dispatchEvent(new Event('inkbridge:outline-visibility'));},[shown]);return React.createElement('div',{id:'original-card-sidebar',style:{display:'contents'}},React.createElement(r(41).n));}
  const ListView=r(74582).ListView,SidebarTree=r(79509).SortableTree,ZoomControls=r(46979).OO,HistoryTabs=r(23733).InkBridgeHistoryTabs,FlowOutline=r(41).InkBridgeFlowOutline;
  const SidebarNavigation=r(78507).InkBridgeSidebarNavigation,NativeFlowUi=r(48626);
  if(!SidebarNavigation||!NativeFlowUi.InkBridgeCreationToolbar)throw Error('Apply native shell UI export patches first');
  // Open the supported original whiteboard view, through its own saved view key.
  // Collections have a separate native catalog, not the history-tab table.
  if(!localStorage.getItem(r(39641).hS))localStorage.setItem(r(39641).hS,'whiteboards');
  if(!HistoryTabs)throw Error('Apply the original history-tab export patch first');
  const tabActions=r(90561),historyNames=new Set(['getHistoryTabs','createHistoryTab','touchHistoryTab','deleteHistoryTab','updateHistoryTab','updateHistoryTabsOrder']);
  const ImportExportHost=r(64744).InkBridgeImportExportHost;
  const pendingHistory=new Set();
  const history=(method,payload)=>{const task=window.inkbridge.history({method,payload});pendingHistory.add(task);task.then(()=>pendingHistory.delete(task),()=>pendingHistory.delete(task));return task;};
  async function settle(){while(pendingHistory.size)await Promise.all([...pendingHistory]);}
  const actions=r(17070),folderActions=r(39044);
  const records=graph=>graph.boards.filter(board=>!board.attributes?.isTrashed).map(board=>({color:'white',icon:null,...board.attributes,id:board.id,name:board.title}));
  const catalog=graph=>{const boards=records(graph),folders=[...(graph.folders||[])].sort((a,b)=>(a.order||0)-(b.order||0)),ids=new Set(folders.flatMap(folder=>folder.whiteboardInstanceIds)),refs=graph.whiteboardInstances||[],live=refs.filter(ref=>!ref.isTrashed),attached=refs.filter(ref=>ids.has(ref.id)),boardIds=new Set(attached.map(ref=>ref.whiteboardId));return {folders,whiteboardInstances:attached,whiteboardList:boards.filter(board=>boardIds.has(board.id)),allWhiteboardInstances:live,allWhiteboards:boards,unAttachedWhiteboards:boards.filter(board=>!ids.has(board.id)&&!live.some(ref=>ref.whiteboardId===board.id))};};
  function hydrate(graph){const data=catalog(graph);redux.dispatch(folderActions.Tc(data.folders));redux.dispatch(actions.Dq({boardList:data.whiteboardList,instances:data.whiteboardInstances,allWhiteboardInstances:data.allWhiteboardInstances,allWhiteboards:data.allWhiteboards,unAttachedWhiteboards:data.unAttachedWhiteboards}));}
  const management=new Set(['createWhiteboard','updateBoard','deleteWhiteboard','addBoard','restoreWhiteboard']);
  const catalogServices=new Set(['addFolder','updateFolder','deleteWhiteboardFolder','updateFoldersOrder','createWhiteboardInstance','updateWhiteboardInstance']);
  const libraryReads=new Set(['batchGetInstanceListByWhiteboardId','getAllWhiteboards','getTagList','getCardsByFilters','getBoardListPreviewByWhiteboardIds']);
  const noteReads=new Set(['getTag','getNoteCardById','getTagsByCardId','getWhiteboardsByCardId','getCardLinks','getTagPropertyList','getCardRemark']);
  const cardInstanceWrites=new Set(['restoreNoteCardContentVersion','batchCreateNoteCards','batchCreateNoteCardInstances','addNoteCardInstance','batchDeleteNoteCardInstances','updateNoteCardInstance','batchUpdateCardInstances','batchUpdateMediaCardInstances','deleteNoteCardInstance','addMediaCard','addMediaCardInstance']);
  globalThis.__inkbridgeControlledNoteSaves=true;window.onGlobalModalClose=async()=>{await flushAll();redux.dispatch(r(22676).aV({show:false}));redux.dispatch(r(11473).f4());};
  globalThis.__inkbridgeServices={has:name=>name==='openFileInShell'||sections.has(name)||['exportNoteCardToMarkdown','saveDocxFromXml','resolveExportImages'].includes(name)||['globalSearch','searchBlocksWithIds'].includes(name)||connections.has(name)||['checkExistingUploadFiles','getMediaCardById','getMediaCardByFileId'].includes(name)||pdf.has(name)||name==='updateTabConfig'||bookmarks.has(name)||tags.has(name)||name==='writeClipboardTextAndHtml'||noteReads.has(name)||cardInstanceWrites.has(name)||['batchInsertCardInstances','batchDeleteCardsByType','addNoteCard','updateNoteCard','upsertCardRemark','getWhiteboardsByCardId','getNoteCardContentVersions','openNoteCardWindow','savePastedImageBuffers','savePureBase64Image','uploadFile','getFileById'].includes(name)||libraryReads.has(name)||['getBoardListByIds','getFolders','getWhiteboard','getTrash','restoreCard','findTargetsByCardIdAndType'].includes(name)||management.has(name)||catalogServices.has(name)||historyNames.has(name),call:async(name,payload)=>{
    if(name==='openFileInShell')return window.inkbridge.openAttachment(typeof payload==='string'?payload:payload.id);
    if(sections.has(name))return sections.call(name,payload);
    if(['exportNoteCardToMarkdown','saveDocxFromXml','resolveExportImages'].includes(name)){await flushAll();const result=await window.inkbridge.exportArtifact({name,payload});if(name!=='resolveExportImages')r(55153).fz({title:'InkBridge 匯出完成',description:result.zipPath||result.filePath,color:'success'});return result;}
    if(name==='globalSearch'||name==='searchBlocksWithIds'){await flush();const graph=await window.inkbridge.load();return name==='globalSearch'?searchGraph(graph,payload):searchBlocks(graph,payload.keyword);}
    if(connections.has(name))return connections.call(name,payload);
    if(name==='checkExistingUploadFiles'){await flush();const graph=await window.inkbridge.load(),files=await window.inkbridge.inspectFiles(payload.files);return {existingPaths:files.filter(file=>graph.contents.some(content=>content.kind===payload.cardType&&graph.cardMetadata?.some(meta=>meta.id===content.id&&meta.fileId===file.sha256))).map(file=>file.path)};}
    if(name==='getMediaCardById'||name==='getMediaCardByFileId'){await flush();const graph=await window.inkbridge.load(),content=graph.contents.find(row=>row.kind==='image'&&(name==='getMediaCardById'?row.id===payload:graph.cardMetadata?.some(meta=>meta.id===row.id&&meta.fileId===payload)));return {success:!!content,mediaCard:content?attachmentRecord(graph,content):null};}
    if(pdf.has(name)){const result=await pdf.call(name,payload);if(name==='addPdfCard')window.dispatchEvent(new Event(r(92344).kB));return result;}
    if(name==='updateTabConfig'){
      await flush();const saved=(await window.inkbridge.load()).savedTabs?.find(tab=>tab.id===payload.id);
      if(saved)return bookmarks.call('updateTab',{id:saved.id,config:{...saved.config,...payload.config}});
      const current=(await history('getHistoryTabs',{})).data.find(tab=>tab.id===payload.id);
      return current?history('updateHistoryTab',{id:current.id,config:{...current.config,...payload.config}}):{success:false,tab:null};
    }
    if(bookmarks.has(name))return bookmarks.call(name,payload);
    if(tags.has(name))return tags.call(name,payload);
    if(name==='writeClipboardTextAndHtml')return window.inkbridge.writeClipboardTextAndHtml(payload);
    if(name==='batchInsertCardInstances'||name==='batchDeleteCardsByType'||name==='addNoteCard'||name==='updateNoteCard'||name==='upsertCardRemark'){const result=await writeNote(name,payload);if(name==='addNoteCard'||name==='batchDeleteCardsByType'||name==='batchInsertCardInstances')window.dispatchEvent(new Event(r(92344).kB));return result;}
    if(cardInstanceWrites.has(name))return writeNote(name,payload);
    if(name==='getNoteCardContentVersions'){await flush();return ((await window.inkbridge.load()).contentVersions||[]).filter(row=>row.noteCardId===payload.noteCardId).sort((a,b)=>b.createdTime.localeCompare(a.createdTime));}
    if(name==='openNoteCardWindow'){await flushAll();return window.inkbridge.openNoteWindow(payload);}
    if(name==='savePastedImageBuffers'||name==='savePureBase64Image')return globalThis.__inkbridgeTrackOperation(async()=>{const res=await window.inkbridge[name](payload);await writeNote('registerFiles',{files:res.map(item=>item.fileRecord)});return res;});
    if(name==='uploadFile'){const result=await window.inkbridge.uploadFile(payload);await writeNote('registerFiles',{files:[result.fileRecord]});return result;}
    if(name==='getFileById'){await flush();const file=((await window.inkbridge.load()).files||[]).find(f=>f.id===(typeof payload==='string'?payload:payload.id));return {success:!!file,file:file?{...file,metadata:typeof file.metadata==='string'?JSON.parse(file.metadata):file.metadata}:undefined};}
    if(name==='getTag'){await flush();return {data:((await window.inkbridge.load()).tags||[]).find(tag=>tag.id===payload)||null};}
    if(noteReads.has(name)){await flush();const graph=await window.inkbridge.load(),id=typeof payload==='string'?payload:payload.cardId||payload.objectId,content=graph.contents.find(c=>c.id===id),record=content?noteRecord(graph,content):null;if(name==='getNoteCardById')return record;if(name==='getTagsByCardId')return {success:true,data:(graph.tags||[]).filter(tag=>(graph.cardTags||[]).some(link=>link.tagId===tag.id&&link.cardId===id))};if(name==='getWhiteboardsByCardId')return {success:true,data:record?.apprearedInWhiteboards||[]};if(name==='getCardRemark')return (graph.cardRemarks||[]).find(row=>row.id===id)||{content:''};if(name==='getTagPropertyList')return {data:{propertyList:[],propertyValues:[]}};return {whiteboardLinks:record?.apprearedInWhiteboards||[],appearInMindmaps:[],linksInNoteCards:[],linksInDailyNotes:[],linksInMindmaps:[],linksInPdfHighlights:[],linksInVideoHighlights:[],linksInNoteHighlights:[],selfCard:record,fileRecord:null,linksInRelations:[]};}
    if(libraryReads.has(name)){await flush();const graph=await window.inkbridge.load();if(name==='batchGetInstanceListByWhiteboardId')return {list:graph.instances.filter(row=>row.boardId===payload.whiteboardId).map(row=>({...row.attributes,id:row.id,objectId:row.contentId,whiteboardId:row.boardId,x:row.x,y:row.y,width:row.width,height:row.height}))};if(name==='getAllWhiteboards')return {whiteboards:records(graph)};if(name==='getTagList')return {success:true,data:graph.tags||[]};if(name==='getBoardListPreviewByWhiteboardIds')return boardPreviews(graph,Array.isArray(payload)?payload:[payload]);return cardsByFilters(graph,payload);}
    if(name==='getBoardListByIds'){await flush();return {whiteboards:records(await window.inkbridge.load()).filter(board=>payload.includes(board.id))};}
    if(name==='getFolders'){await flush();return catalog(await window.inkbridge.load());}
    if(name==='getWhiteboard'){await flush();const board=(await window.inkbridge.load()).boards.find(board=>board.id===payload);if(!board)throw Error('白板不存在');return {whiteboard:{color:'white',icon:null,...board.attributes,id:board.id,name:board.title}};}
    if(name==='getTrash'){await flush();const graph=await window.inkbridge.load();return {noteCards:graph.contents.filter(c=>c.kind==='text').map(c=>noteRecord(graph,c)).filter(c=>c.isTrashed),mindMaps:[],pdfCards:graph.contents.filter(c=>c.kind==='pdf').map(c=>attachmentRecord(graph,c)).filter(c=>c.isTrashed),highlights:[],videoHighlights:[],audioHighlights:[],noteHighlights:[],mediaCards:graph.contents.filter(c=>c.kind==='image').map(c=>attachmentRecord(graph,c)).filter(c=>c.isTrashed),websiteCards:[],whiteboards:graph.boards.filter(board=>board.attributes?.isTrashed).map(board=>({...board.attributes,id:board.id,name:board.title}))};}
    if(name==='restoreCard'){if(['NoteCard','PDFCard','MediaCard','image'].includes(payload.type)){const result=await writeNote(payload.type==='NoteCard'?'restoreNoteCard':'restoreAttachmentCard',payload);window.dispatchEvent(new Event(r(92344).kB));return result;}if(payload.type!=='Whiteboard')throw Error('尚未接入此類型的復原');await writeWhiteboard(payload.id,{restore:true});hydrate(await window.inkbridge.load());return {success:true};}
    if(catalogServices.has(name)){await writeCatalog(name,payload);if(name==='createWhiteboardInstance')return {success:true,relatedWhiteboards:records(await window.inkbridge.load()).filter(board=>board.id===payload.whiteboardId)};return true;}
    if(name==='findTargetsByCardIdAndType'){
      await flush();const graph=await window.inkbridge.load(),ids=new Set(payload.cardIds);
      if(payload.cardType==='File')return (graph.files||[]).filter(row=>ids.has(row.id));
      if(payload.cardType==='NodeGroup')return (graph.sections||[]).filter(row=>ids.has(row.id)&&graph.boards.some(board=>board.id===row.whiteboardId&&!board.attributes?.isTrashed));
      if(payload.cardType==='Whiteboard')return graph.boards.filter(board=>ids.has(board.id)).map(board=>({...board.attributes,id:board.id,name:board.title}));
      if(['PDFCard','MediaCard','image'].includes(payload.cardType))return graph.contents.filter(content=>ids.has(content.id)&&['image','pdf'].includes(content.kind)).map(content=>attachmentRecord(graph,content));
      if(payload.cardType==='NoteCard')return graph.contents.filter(content=>ids.has(content.id)&&content.kind==='text').map(content=>noteRecord(graph,content));
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
    if(/\/pdf\/?$/.test(url.pathname)){await showPdf(url.searchParams.get('pdfId'));return true;}
    if(/\/note-detail\/?$/.test(url.pathname)){await showNote(url.searchParams.get('id'));return true;}
    if(/\/home\/?$/.test(url.pathname)){try{await showHome();return true;}catch(error){onError(error);return false;}}
    if(/\/(?:board|card-list)\/?$/.test(url.pathname)){try{await showHome(url.pathname.endsWith('card-list')?'card-list':'board');return true;}catch(error){onError(error);return false;}}
    if(/\/trash\/?$/.test(url.pathname)){try{await showHome('trash');return true;}catch(error){onError(error);return false;}}
    if(!/\/(?:flow)\/?$/.test(url.pathname)||!id)throw Error('This original route is not connected: '+url.pathname);
    const previousQuery=router.state.query;router.state.query=Object.fromEntries(url.searchParams);
    try{await switchBoard(id);return true;}catch(error){router.state.query=previousQuery;onError(error);return false;}
  };
  // Native 48626.n0 consumes rename=1, then removes it with shallow replace.
  // Keep that lifecycle inside this host; never invoke Next's page loader.
  router.replace=async(destination,as,options)=>{if(!options?.shallow)return router.push(destination);const url=new URL(typeof destination==='string'?destination:destination.pathname+'?'+new URLSearchParams(destination.query),location.origin);if(url.pathname!==router.pathname||url.searchParams.get('whiteboardId')!==getActiveBoardId())throw Error('Unsupported shallow workspace transition');Object.assign(router.state,{query:Object.fromEntries(url.searchParams),asPath:url.pathname+url.search});return true;};
  router.replace=async(destination,_as,options)=>{const url=new URL(typeof destination==='string'?destination:destination.pathname+'?'+new URLSearchParams(destination.query),location.origin);if(options?.shallow&&url.pathname===router.pathname){router.state.query=Object.fromEntries(url.searchParams);return true;}return router.push(destination);};
  function TrashView(){const root=React.useRef(null);React.useLayoutEffect(()=>{const disable=()=>{const t=key=>r(1643).ag.t(key,{ns:'common'});for(const button of root.current.querySelectorAll('button'))if(button.getAttribute('aria-label')===t('deletePermanently')||button.textContent.trim()===t('emptyTrash')){button.disabled=true;button.title='本階段只提供復原，永久刪除尚未接入';}};disable();const observer=new MutationObserver(disable);observer.observe(root.current,{childList:true,subtree:true});return ()=>observer.disconnect();},[]);return React.createElement('div',{ref:root,className:'h-full'},React.createElement(r(69193).default));}
  const createInFolder=folderId=>window.dispatchEvent(new CustomEvent(r(39641).GO,{detail:{folderId}}));
  const pendingUi=component=>React.createElement('fieldset',{disabled:true,title:'UI 已移植；此工具的資料與操作流程將逐項接入',onMouseDownCapture:event=>{event.preventDefault();event.stopPropagation();}},React.createElement(component,{inkbridgeUiOnly:true}));
  function NativeTools(){const root=React.useRef(null),allowed=new Set(['viewControls.create selection','viewControls.pan','canvasNav.title','connectingTips'].map(key=>r(1643).ag.t(key,{ns:'common'})));React.useLayoutEffect(()=>{const gate=()=>{for(const button of root.current.querySelectorAll('button'))button.disabled=!allowed.has(button.getAttribute('aria-label'));};gate();const observer=new MutationObserver(gate);observer.observe(root.current,{childList:true,subtree:true});return ()=>observer.disconnect();},[]);return React.createElement('div',{className:'native-tools-gate',ref:root,onMouseDownCapture:event=>{if(!allowed.has(event.target.closest('button')?.getAttribute('aria-label'))){event.preventDefault();event.stopPropagation();}}},React.createElement(NativeFlowUi.InkBridgeCreationToolbar,{inkbridgeUiOnly:true}));}
  function NativeNewCard(){const [open,setOpen]=React.useState(false),{t,i18n}=r(1643).$G('common'),Menu=r(31167),Popover=r(41278).j,Trigger=r(16938).b,Content=r(48933).g,Button=r(17015).A;return React.createElement(Popover,{isOpen:open,onOpenChange:setOpen,placement:'bottom'},React.createElement(Trigger,null,React.createElement(Button,{id:'native-new-card',isIconOnly:true,size:'sm',variant:'light','aria-label':t('newCard'),className:'h-7 min-w-7 w-7 p-0'},'＋')),React.createElement(Content,null,open?React.createElement(Menu.TS,{inFlowPage:false,position:{x:0,y:0},clickPosition:{x:0,y:0},t,i18n,hideActions:Object.values(Menu.wR).filter(value=>!['newNoteCard','newPDFCard'].includes(value)),onClose:()=>setOpen(false),onNewCardCreated:(type,note)=>{setOpen(false);redux.dispatch(r(11473).f4());redux.dispatch(r(22676).aV({show:true,params:{card:{...note,type,autoFocus:true}}}));}}):null));}
  function AddToWhiteboard(){const state=r(16125).v9(state=>state.ui.addToWhiteboard);return state.show?React.createElement(r(84974).Z,{show:true}):null;}
  function NativeCardOverlays(){const pinned=r(16125).v9(state=>state.ui.pinnedGlobalModalCard)||[];return React.createElement(React.Fragment,null,React.createElement(r(34060).GZ),...pinned.map((card,index)=>React.createElement(r(64744).InkBridgeCardModal,{key:card.id,isPinned:true,pinnedCard:card,floatingIndex:index,onBeforeClose:flushAll,onEditorReady:registerModalEditor,inkbridgeNoAi:true})));}
  function ShellPortals({home,page}){const [outlineOpen,setOutlineOpen]=React.useState(false);React.useEffect(()=>{const update=()=>setOutlineOpen(!document.querySelector('#original-flow-outline').hidden);window.addEventListener('inkbridge:outline-visibility',update);return ()=>window.removeEventListener('inkbridge:outline-visibility',update);},[]);return React.createElement(React.Fragment,null,
    React.createElement(r(55153).VW,{toastOffset:50,maxVisibleToasts:1,placement:'top-right',regionProps:{className:'flexnote-global-toast-region'}}),
    React.createElement(r(64744).InkBridgeCardModal,{onBeforeClose:flushAll,onEditorReady:registerModalEditor,inkbridgeNoAi:true}),
    React.createElement(NativeCardOverlays),React.createElement(ImportExportHost),
    React.createElement(r(64744).InkBridgeTagManager),
    React.createElement(r(64744).InkBridgeCollectionPicker),
    React.createElement(r(64744).InkBridgeImageGallery),
    React.createElement(r(64744).InkBridgeCardPopover),
    ReactDOM.createPortal(React.createElement(NativeLeftSidebar),leftHost),
    ReactDOM.createPortal(React.createElement(NativeRightSidebar),document.querySelector('#original-flow-outline')),
    React.createElement(AddToWhiteboard),
    home?ReactDOM.createPortal(React.createElement(NativeNewCard),document.querySelector('#original-new-card-launcher')):null,
    ReactDOM.createPortal(React.createElement(r(23733).InkBridgeNavigationControls,{onToggleSidebar:()=>redux.dispatch(r(22676).y9(!redux.getState().ui.leftSidebarShow))}),document.querySelector('#original-navigation-controls')),
    ReactDOM.createPortal(React.createElement(SidebarNavigation,{selectedKey:page==='card-list'?'card-list':'board',enabledKeys:['board','card-list'],onNavigate:key=>{if(key==='board'||key==='card-list')showHome(key).catch(onError);}}),document.querySelector('#original-sidebar-navigation')),
    ReactDOM.createPortal(React.createElement(SidebarNavigation,{horizontal:true,keys:['board','card-list','highlight','quick-notes'],selectedKey:outlineOpen?'board':'',enabledKeys:['board'],onNavigate:key=>{if(key==='board')document.querySelector('#toggle-outline').click();}}),document.querySelector('#original-top-views')),
    !home?ReactDOM.createPortal(React.createElement(NativeTools),document.querySelector('#original-native-tools')):null,
    !home?ReactDOM.createPortal(pendingUi(NativeFlowUi.InkBridgeUndoControls),document.querySelector('#original-undo-controls')):null,
    !home?ReactDOM.createPortal(React.createElement(NativeFlowUi.InkBridgeBoardCaption,{isReadOnly:false}),document.querySelector('#original-board-caption')):null,
    ReactDOM.createPortal(React.createElement('div',{onClickCapture:event=>{const button=event.target.closest('[aria-label]');if(button?.getAttribute('aria-label')===r(1643).ag.t('newTab',{ns:'common'})){event.preventDefault();event.stopPropagation();document.querySelector('#board-navigation-status').textContent='新增分頁的其他卡片服務尚未接入；可從清單開啟白板。';}}},React.createElement(HistoryTabs)),document.querySelector('#original-history-tabs')),
    React.createElement(r(64744).InkBridgeCreateWhiteboard),
    React.createElement(r(64744).InkBridgeCreateFolder),
    home?ReactDOM.createPortal(React.createElement('div',{className:'flex h-full min-h-0 flex-col',style:{position:'absolute',inset:0,zIndex:300,overflow:'auto',background:'white'}},page==='trash'?React.createElement(TrashView):page==='note-detail'?React.createElement(r(58439).default,{onEditorReady:registerModalEditor}):page==='pdf'?React.createElement(r(89091).default):React.createElement(page==='card-list'?r(57152).default:r(13177).default)),document.querySelector('#original-board-home')):null,
    ReactDOM.createPortal(React.createElement('div',{className:'flex h-full min-h-0 flex-col'},React.createElement(SidebarTree)),document.querySelector('#original-board-list')),
    ReactDOM.createPortal(React.createElement(ZoomControls),document.querySelector('#original-zoom-controls')));
  }
  function homeSelected(page='home'){Object.assign(router.state,{pathname:'/'+page,route:'/'+page,asPath:'/zh-TW/'+page});}
  async function selected(){router.query.whiteboardId=getActiveBoardId();Object.assign(router.state,{pathname:'/flow',route:'/flow',asPath:'/zh-TW/flow?whiteboardId='+encodeURIComponent(getActiveBoardId())});const graph=await window.inkbridge.load(),board=graph.boards.find(board=>board.id===getActiveBoardId());
    const value=r(19281).YH.newTab({title:board.title,type:r(81638).R.Whiteboard,sourceId:board.id,parentTabId:'',tabGroupId:'default',icon:'',color:''});
    const result=await history('createHistoryTab',value);if(result.deletedTabId)redux.dispatch(tabActions.ff(result.deletedTabId));redux.dispatch(tabActions.AO(result.tab));
  }
  const ready=history('getHistoryTabs',{}).then(result=>redux.dispatch(tabActions.AY(result.data)));
  async function selectedNote(id,title,type=r(81638).R.NoteCard){const value=r(19281).YH.newTab({title,type,sourceId:id,parentTabId:'',tabGroupId:'default',icon:'',color:''}),result=await history('createHistoryTab',value);if(result.deletedTabId)redux.dispatch(tabActions.ff(result.deletedTabId));redux.dispatch(tabActions.AO(result.tab));}
  return {ShellPortals,FlowOutline,hydrate,selected,selectedNote,homeSelected,ready,settle,modules:{sidebar:79509,list:74582,zoom:46979,service:58850,tabs:23733,outline:41}};
}
