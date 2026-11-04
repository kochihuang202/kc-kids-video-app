// Isolated host for original modules; never starts the original Electron main.
const {app,BrowserWindow,session,ipcMain,dialog,Menu,protocol,nativeImage,clipboard,ClipboardItem,shell,powerMonitor}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const crypto=require('node:crypto');
const {createDatabaseClient}=require('../../src/main/database-client.cjs');
const root=path.resolve(__dirname,'../../private-original-editor'),own=__dirname;
const project=path.resolve(__dirname,'../..'),boardMode=process.env.INKBRIDGE_ORIGINAL_VIEW==='board';
const portable=process.env.INKBRIDGE_PORTABLE==='1';
const portableData=path.resolve(process.env.LOCALAPPDATA||app.getPath('appData'),'InkBridge');
const data=portable?portableData:process.env.INKBRIDGE_ORIGINAL_PROBE_DATA||(app.isPackaged?path.join(root,'profiles','desktop'):null);if(!data)throw Error('A dedicated probe profile is required');
const resolvedData=path.resolve(data),tempRoot=require('node:os').tmpdir();
if(!(portable&&resolvedData===portableData)&&!resolvedData.startsWith(path.join(root,'profiles')+path.sep)&&!(path.dirname(resolvedData)===tempRoot&&path.basename(resolvedData).startsWith('inkbridge-original-modules-'))){console.error('Probe profile must be inside its private profiles or a dedicated temp directory');process.exit(1);}
app.setName('InkBridge Original Module Probe');
for(const [key,name]of Object.entries({userData:'Profile',sessionData:'Session',logs:'Logs',crashDumps:'Crashes'})){const target=path.join(data,name);fs.mkdirSync(target,{recursive:true});app.setPath(key,target);}
app.setAppUserModelId('org.inkbridge.original-module-preview');const acquired=app.requestSingleInstanceLock();if(!acquired)app.quit();
protocol.registerSchemesAsPrivileged([{scheme:'flexnote',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const types={'.js':'text/javascript','.mjs':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.woff2':'font/woff2','.pdf':'application/pdf','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
let server,window,database,databaseClient,liveSync,rendererReady=false,approvedClose=false,closeRequest=null,closeTimer,closing=false;
const queue=require('../../src/main/operation-queue.cjs').createOperationQueue();
const operations=new Map();
const editingStates=new Map();
app.on('web-contents-created',(_event,contents)=>{contents.on('did-start-navigation',(_e,_url,_inPlace,isMain)=>{if(isMain)editingStates.delete(contents.id);});contents.once('destroyed',()=>{editingStates.delete(contents.id);saveStateChanged();});});
function saveStateChanged(){if(closing)return;for(const w of BrowserWindow.getAllWindows())if(!w.isDestroyed()&&!w.webContents.isDestroyed())w.webContents.send('inkbridge:save-state-changed');}
function notify(value){if(value.key==='save'&&value.state!=='error')return;if(value.key!=='startup-retry')operations.set(value.key,value);for(const w of BrowserWindow.getAllWindows())if(!w.isDestroyed())w.webContents.send('inkbridge:operation',value);}
const handle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,listener)=>handle(channel,(event,payload,epoch)=>{if(liveSync&&channel.startsWith('inkbridge:'))liveSync.assertEpoch(epoch);return listener(event,payload,epoch);});
app.whenReady().then(async()=>{
  if(!acquired)return;
  const restore=require('../../src/main/workspace-restore.cjs');
  await restore.recoverRestore(data);
  const filename=path.join(data,'Workspace','inkbridge.sqlite3');fs.mkdirSync(path.dirname(filename),{recursive:true});databaseClient=createDatabaseClient({filename});
  database=Object.fromEntries(['load','summary','commit','history','snapshot','close'].map(name=>[name,(...args)=>databaseClient[name](...args)]));
  database.commit=async(...args)=>{const ack=await databaseClient.commit(...args);saveStateChanged();return ack;};
  const filesDir=path.join(data,'files');fs.mkdirSync(filesDir,{recursive:true});
  const attachments=require('../../src/main/attachment-store.cjs').createAttachmentStore(filesDir,bytes=>nativeImage.createFromBuffer(bytes).getSize());
  const exportsService=require('../../src/main/original-exports.cjs').createOriginalExports({directory:path.join(data,'exports'),load:()=>database.load(),attachments});
  protocol.handle('flexnote',async request=>{try{const {bytes,ext}=attachments.readUrl(request.url);return new Response(bytes,{headers:{'Content-Type':types[ext]||'image/png','Access-Control-Allow-Origin':'*'}});}catch{return new Response('Not found',{status:404});}});
  server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/standalone'){
      response.setHeader('Content-Type','text/html; charset=utf-8');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' flexnote:; img-src 'self' data: blob: flexnote:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'");response.end(fs.readFileSync(path.join(own,'standalone-card.html'),'utf8'));return;
    }
    if(pathname==='/'||pathname==='/board-window'){
      response.setHeader('Content-Type','text/html; charset=utf-8');
      response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' flexnote:; img-src 'self' data: blob: flexnote:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'");
      const originalScripts='<script src="/runtime.js"></script><script src="/register-original.js"></script><script src="/_next/static/LOq0EGi9XWnc3BD21aEGY/_buildManifest.js"></script><script src="/_next/static/LOq0EGi9XWnc3BD21aEGY/_ssgManifest.js"></script>';
      if(boardMode){
        let html=fs.readFileSync(path.join(project,'src/renderer/index.html'),'utf8');
        html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace('href="styles.css"','href="/inkbridge-ui/styles.css"').replace('<link rel="stylesheet" href="editor.css">','');
        html=html.replace('<link rel="stylesheet" href="/inkbridge-ui/styles.css">','<link rel="stylesheet" href="/_next/static/css/0a3dd850c67b254e.css">');
        html=html.replace(/<canvas id="board"[^>]*><\/canvas>/,'<div id="board" role="application" aria-label="InkBridge 原版白板" style="position:absolute;inset:0;width:100%;height:100%"></div>');
        html=html.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/,'<aside class="original-sidebar flex min-h-0 shrink-0 flex-col border-r border-default-200 bg-content1 p-2" style="width:280px"><div id="original-board-list" class="min-h-0 flex-1" aria-label="白板清單"></div><small id="board-navigation-status" role="status"></small><button id="open-trash" class="mt-2 rounded-md px-2 py-1 text-left text-xs text-default-600" title="回收站">回收站</button><div id="persistence-status" class="px-2 py-1 text-xs text-default-500">正在載入…</div><b id="sidebar-count" hidden></b><div id="inspector" hidden></div></aside>');
        const brand=html.match(/<div class="brand">[\s\S]*?<\/div>/)?.[0];if(!brand)throw Error('InkBridge brand not found');html=html.replace(brand,'<div id="original-navigation-controls"></div>');
        html=html.replace(/<button id="add-card"[\s\S]*?<\/button>/,'<button id="toggle-outline" aria-label="切換卡片列表" aria-expanded="false" title="卡片列表">☷</button>');
        html=html.replace('<div id="original-board-list"','<div class="sidebar-brand-row">'+brand+'<button id="add-card" aria-label="新增卡片" title="新增卡片">＋</button><span id="original-new-card-launcher"></span></div><div id="original-sidebar-navigation"></div><div id="original-board-list"');
        const save=html.match(/<button id="save-workspace"[^>]*>[\s\S]*?<\/button>/)?.[0];html=html.replace(save,'');html=html.replace('<div id="persistence-status"',save+'<div id="persistence-status"');
        html=html.replace('<button id="open-trash"','<div class="sidebar-footer"><button id="open-trash"').replace('正在載入…</div><b id="sidebar-count"','正在載入…</div></div><b id="sidebar-count"');
        html=html.replace('<div class="sidebar-footer">','<div class="sidebar-footer"><div id="sidebar-footer-ui"></div>');
        html=html.replace('<div class="breadcrumb">','<div id="original-history-tabs" style="flex:1;min-width:0"></div><div class="breadcrumb" style="display:none" hidden>');
        html=html.replace('<button id="toggle-outline"','<div id="original-top-views"></div><button id="toggle-outline"');
        html=html.replace('</main>','</main><aside id="original-flow-outline" aria-label="卡片列表" style="width:280px;min-width:280px;background:white;border-left:1px solid #e1e4dc;display:flex;min-height:0"></aside>');
        html=html.replace('<div class="zoom-controls">','<div id="original-board-home" style="display:contents"></div><div id="original-board-caption"></div><div id="original-native-tools"></div><div id="original-undo-controls"></div><div id="original-zoom-controls"></div><div class="zoom-controls" hidden>');
        html=html.replace('id="original-flow-outline"','id="original-flow-outline" hidden');
        html=html.replace('</head>','<link rel="stylesheet" href="/integration/compact-shell.css"></head>');
        html=html.replace('</head>','<style>.canvas-wrap{isolation:isolate}#board-navigation-status{display:block;color:#a54235;font-size:11px}#original-zoom-controls{display:contents}.zoom-controls[hidden]{display:none}.board-heading h2{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style></head>');
        html=html.replace('<script src="vendor/canvaskit.js"></script><script type="module" src="workspace.mjs"></script>',originalScripts+'<script type="module" src="/integration/board.mjs"></script>');
        response.end(html);return;
      }
      response.end('<!doctype html><html lang="zh-TW"><meta charset="utf-8"><title>InkBridge — original module isolation probe</title><link rel="stylesheet" href="/_next/static/css/0a3dd850c67b254e.css"><style>body{margin:20px;background:#eee;font-family:sans-serif}#editor-host{width:520px;background:white;min-height:300px}canvas{background:white;margin-top:20px}#status{white-space:pre-wrap}</style><body><h1>InkBridge 原版模組隔離驗證</h1><pre id="status">正在載入原版模組…</pre><div id="editor-host"></div><canvas id="original-canvas" width="620" height="1400"></canvas>'+originalScripts+'<script src="/probe.js"></script></body></html>');return;
    }
    let file;
    if(pathname==='/integration/compact-shell.css')file=path.join(own,'compact-shell.css');
    else if(pathname==='/probe.js')file=path.join(own,'probe.js');
    else if(pathname.startsWith('/integration/')&&pathname.endsWith('.mjs')){
      file=path.resolve(own,'.'+pathname.slice('/integration'.length));if(!file.startsWith(own+path.sep)){response.writeHead(403);response.end();return;}
    }
    else if(pathname==='/inkbridge-ui/styles.css')file=path.join(project,'src/renderer/styles.css');
    else if(pathname==='/inkbridge-core/persistence-coordinator.mjs')file=path.resolve(own,'../../src/core/persistence-coordinator.mjs');
    else if(pathname==='/inkbridge-core/rich-document.mjs')file=path.resolve(own,'../../src/core/rich-document.mjs');
    else if(pathname==='/inkbridge-core/card-height.mjs')file=path.resolve(own,'../../src/core/card-height.mjs');
    else if(pathname==='/inkbridge-core/original-drawings.mjs')file=path.resolve(own,'../../src/core/original-drawings.mjs');
    else if(pathname==='/inkbridge-core/original-mindmaps.mjs')file=path.resolve(own,'../../src/core/original-mindmaps.mjs');
    else if(pathname==='/inkbridge-core/mindmap-appearance.mjs')file=path.resolve(own,'../../src/core/mindmap-appearance.mjs');
    else if(pathname==='/inkbridge-core/mindmap-keyboard.mjs')file=path.resolve(own,'../../src/core/mindmap-keyboard.mjs');
    else if(pathname==='/inkbridge-core/original-catalog.mjs')file=path.resolve(own,'../../src/core/original-catalog.mjs');
    else if(pathname==='/inkbridge-core/workspace-window-sync.mjs')file=path.resolve(own,'../../src/core/workspace-window-sync.mjs');
    else if(pathname==='/inkbridge-core/note-version.mjs')file=path.resolve(own,'../../src/core/note-version.mjs');
    else if(pathname==='/inkbridge-core/original-sections.mjs')file=path.resolve(own,'../../src/core/original-sections.mjs');
    else if(pathname==='/inkbridge-core/original-note-writes.mjs')file=path.resolve(own,'../../src/core/original-note-writes.mjs');
    else if(pathname==='/inkbridge-core/original-folder-writes.mjs')file=path.resolve(own,'../../src/core/original-folder-writes.mjs');
    else if(pathname==='/inkbridge-core/original-tags.mjs')file=path.resolve(own,'../../src/core/original-tags.mjs');
    else if(pathname==='/inkbridge-core/original-bookmarks.mjs')file=path.resolve(own,'../../src/core/original-bookmarks.mjs');
    else if(pathname==='/inkbridge-core/original-pdf.mjs')file=path.resolve(own,'../../src/core/original-pdf.mjs');
    else if(pathname==='/inkbridge-core/original-connections.mjs')file=path.resolve(own,'../../src/core/original-connections.mjs');
    else if(pathname==='/inkbridge-core/original-search.mjs')file=path.resolve(own,'../../src/core/original-search.mjs');
    else if(pathname.startsWith('/files/'))file=path.join(filesDir,path.basename(pathname));
    else if(pathname==='/runtime.js'||pathname==='/register-original.js')file=path.join(root,path.basename(pathname));
    else{
      const assetRoot=path.join(root,'vendor/app');file=path.resolve(assetRoot,'.'+pathname);
      if(!file.startsWith(assetRoot+path.sep)){response.writeHead(403);response.end();return;}
    }
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));
  });
  // A stable origin per isolated profile preserves the native localStorage
  // preferences. Never fall back to a different origin if its port is busy.
  const endpointFile=path.join(data,'local-endpoint.json');
  const storedPort=fs.existsSync(endpointFile)?JSON.parse(fs.readFileSync(endpointFile,'utf8')).port:0;
  if(!Number.isInteger(storedPort)||storedPort!==0&&(storedPort<1024||storedPort>65535))throw Error('Invalid workspace endpoint');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(storedPort,'127.0.0.1',resolve);});const origin=`http://127.0.0.1:${server.address().port}`;
  if(!storedPort)fs.writeFileSync(endpointFile,JSON.stringify({port:server.address().port}),'utf8');
  const blocked=[];session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const allowed=details.url.startsWith(origin+'/')||details.url==='about:blank'||details.url.startsWith('flexnote://');if(!allowed)blocked.push(details.url.split('?')[0]);callback({cancel:!allowed});});
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  const standalone=require('../../src/main/standalone-windows.cjs').installStandaloneWindows({ipcMain,BrowserWindow,origin,data,preload:path.resolve(own,'../../src/main/preload.cjs'),getMain:()=>window,load:()=>database.load(),assertEpoch:value=>liveSync?.assertEpoch(value),getEpoch:()=>liveSync?.epoch||0});
  const allowed=event=>event.sender===window?.webContents&&event.senderFrame?.url.startsWith(origin+'/');
  const readable=event=>allowed(event)||!!standalone.child(event);
  const storageSettings=require('../../src/main/storage-settings.cjs').createStorageSettings({filename:path.join(data,'Profile','storage-settings.json'),localDirectory:data,applicationDirectory:project});
  const selectedExchangeDirectories=new Set();
  const snapshots=require('../../src/main/sync-snapshots.cjs').createSyncSnapshots({localDirectory:data,database,getExchange:()=>storageSettings.read().exchangeDirectory,resolveAttachment:attachments.resolvePath});
  ipcMain.handle('inkbridge:editing-state',(event,value)=>{if(!readable(event)||!Number.isSafeInteger(value?.serial)||typeof value.dirty!=='boolean')throw Error('Invalid editing state');const old=editingStates.get(event.sender.id);if(!old||value.serial>=old.serial)editingStates.set(event.sender.id,{...value});saveStateChanged();return {ok:true};});
  ipcMain.handle('inkbridge:save-state',async event=>{if(!readable(event))throw Error('Unexpected sender');const ids=new Set(BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()).map(w=>w.webContents.id));return {...await snapshots.status(),editing:[...editingStates].some(([id,s])=>ids.has(id)&&s.dirty),ownDirty:!!editingStates.get(event.sender.id)?.dirty};});
  let snapshotTask;
  const createSnapshot=(reason,alreadyFlushed=false)=>{
    if(snapshotTask)return snapshotTask;
    snapshotTask=(async()=>{const edits=new Map([...editingStates].map(([id,s])=>[id,s.serial]));if(!alreadyFlushed)await standalone.flushForSettings();if(!storageSettings.read().exchangeDirectory){saveStateChanged();return {configured:false,created:false};}const result=await snapshots.create(reason);for(const [id,serial]of edits)if(editingStates.get(id)?.serial===serial)editingStates.get(id).dirty=false;for(const w of BrowserWindow.getAllWindows())if(!w.isDestroyed())w.webContents.send('inkbridge:snapshot-saved',result);saveStateChanged();return result;})().finally(()=>{snapshotTask=null;});
    return snapshotTask;
  };
  ipcMain.handle('inkbridge:create-snapshot',(event,_request,epoch)=>{if(!readable(event)||closing||applyingSettings)throw Error('目前無法建立快照');liveSync.assertEpoch(epoch);return queue.run('save',()=>{liveSync.assertEpoch(epoch);return createSnapshot('manual');}).catch(error=>{notify({key:'save',state:'error',title:'保存未完成',message:error.message});throw error;});});
  let applyingSettings=false;
  liveSync=require('../../src/main/live-sync.cjs').installLiveSync({app,powerMonitor,localDirectory:data,database,snapshots,getExchange:()=>storageSettings.read().exchangeDirectory,queue,notify,save:createSnapshot,canRun:()=>rendererReady&&!closing&&!applyingSettings&&standalone.allReady(),
    windows:{list:()=>standalone.list(),pause:()=>standalone.prepareAll(),resume:()=>standalone.resumeAll()},
    startupStatus:async(rows,current)=>{const h=await snapshots.status();return require('../../src/main/startup-snapshot-status.cjs').startupSnapshotStatus({rows,workspaceId:current.workspaceId,localRevision:current.revision,head:h.baseSnapshotId?{snapshotId:h.baseSnapshotId,revision:h.baseRevision}:null});},
    swap:async(m,initial,session)=>{
      const staged=await restore.stageRestore({local:data,exchange:storageSettings.read().exchangeDirectory,workspaceId:m.workspaceId,snapshotId:m.snapshotId,snapshots,sharedAssets:true});
      await database.close();
      try{await restore.switchRestore({local:data,staged,snapshots});databaseClient=createDatabaseClient({filename});await database.load();
        if(!initial){session.advance();session.resetReady();rendererReady=false;await session.wait();}
      }catch(error){await database.close().catch(()=>{});await restore.rollbackRestore(data,staged);databaseClient=createDatabaseClient({filename});await database.load();if(!initial){session.advance();session.resetReady();await session.wait();}throw error;}
    }});
  ipcMain.on('inkbridge:epoch',event=>event.returnValue=liveSync.epoch);
  ipcMain.handle('inkbridge:sync',(event,request,epoch)=>{if(!readable(event))throw Error('Unexpected sender');liveSync.assertEpoch(epoch);return liveSync.call(request);});
  ipcMain.handle('inkbridge:operations',event=>{if(!readable(event))throw Error('Unexpected sender');return [...operations.values()];});
  const updater=require('../../src/main/program-updates.cjs').createProgramUpdates({installRoot:path.dirname(project),localDirectory:data,getExchange:()=>storageSettings.read().exchangeDirectory,portable,notify,queue,
    prepareClose:async()=>{try{if(rendererReady)await standalone.prepareAll();await createSnapshot('before-program-update',true);}catch(error){if(rendererReady)await standalone.resumeAll();throw error;}},
    resume:()=>standalone.resumeAll(),exit:async()=>{closing=true;await database.close();approvedClose=true;standalone.destroyAll();app.exit(0);}});
  ipcMain.handle('inkbridge:program-update',(event,request)=>{if(!readable(event))throw Error('Unexpected sender');return updater.call(request);});
  ipcMain.handle('inkbridge:storage-settings',async(event,request)=>{
    if(!readable(event))throw Error('Unexpected sender');
    const method=request?.method;
    if(method==='read')return storageSettings.read();
    if(method==='startup')return snapshots.startup();
    if(method==='snapshotStatus')return snapshots.status();
    if(method==='scan')return snapshots.scan();
    if(method==='restore'){
      if(applyingSettings||closing||snapshotTask)throw Error('正在保存或關閉，請稍後再試');
      const exchange=storageSettings.read().exchangeDirectory;
      if(!exchange)throw Error('尚未設定交換資料夾');
      const rows=await snapshots.scan(),selected=rows.find(row=>row.workspaceId===request.workspaceId&&row.snapshotId===request.snapshotId&&row.integrity==='complete');
      if(!selected)throw Error('選定快照尚未完整到達或驗證失敗，請重新掃描');
      const answer=await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender),{type:'question',buttons:['取消','保存目前資料並載入'],defaultId:0,cancelId:0,title:'載入工作區快照',message:'將保存目前資料並重新啟動 InkBridge',detail:`工作區：${selected.workspaceId}\n版本：v${selected.manifest.revision}\n快照：${selected.snapshotId}\n建立時間：${selected.manifest.createdAt}\n原本工作資料將保留在本機 Restore 備份目錄，其他快照不會刪除。`});
      if(answer.response!==1)return {cancelled:true};
      return liveSync.call({method:'select',workspaceId:selected.workspaceId,snapshotId:selected.snapshotId});
    }
    if(method==='choose'){
      const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{title:'選擇 OneDrive 交換資料夾',properties:['openDirectory','createDirectory']});
      if(result.canceled||!result.filePaths[0])return {cancelled:true};
      const directory=fs.realpathSync(result.filePaths[0]);selectedExchangeDirectories.add(directory);return {directory};
    }
    if(method==='openLocal'||method==='openExchange'){
      const directory=method==='openLocal'?data:storageSettings.read().exchangeDirectory;
      if(!directory)throw Error('尚未設定交換資料夾');
      const error=await shell.openPath(directory);if(error)throw Error(error);return {success:true};
    }
    if(method!=='check'&&method!=='apply')throw Error('Unknown settings operation');
    const directory=request.directory;
    if(!selectedExchangeDirectories.has(directory)&&directory!==storageSettings.read().exchangeDirectory)throw Error('請先按瀏覽選擇資料夾');
    if(method==='check')return storageSettings.check(directory);
    if(applyingSettings||closing||snapshotTask)throw Error('正在保存或關閉，請稍後再試');
    applyingSettings=true;
    try{return await queue.run('settings',async()=>{await standalone.flushForSettings();if(closing)throw Error('程式正在關閉');const result=storageSettings.save(directory);liveSync.watch();return result;});}finally{applyingSettings=false;}
  });
  ipcMain.handle('inkbridge:open-attachment',async(event,id)=>{if(!readable(event))throw Error('Unexpected sender');const graph=await database.load();if(!graph.files?.some(row=>row.id===id))throw Error('Attachment is not registered');const error=await shell.openPath(attachments.resolvePath(id));if(error)throw Error(error);return {success:true};});
  ipcMain.handle('inkbridge:export-artifact',async(event,request)=>{if(!readable(event)||!exportsService.has(request?.name))throw Error('Unexpected export request');return exportsService.call(request.name,request.payload);});
  ipcMain.handle('inkbridge:info',event=>{if(!readable(event))throw Error('Unexpected sender');return {product:'InkBridge',version:require('../../package.json').version,isTest:!portable,dataRoot:data,databasePath:filename};});
  ipcMain.handle('inkbridge:load',event=>{if(!readable(event))throw Error('Unexpected sender');return database.load();});
  ipcMain.handle('inkbridge:history',(event,request)=>{if(!readable(event))throw Error('Unexpected sender');return database.history(request);});
  ipcMain.handle('inkbridge:commit',async(event,request)=>{if(!allowed(event))throw Error('Unexpected sender');try{return {ok:true,ack:await database.commit(request)};}catch(error){return {ok:false,error:{message:error.message,code:error.code}};}});
  ipcMain.handle('inkbridge:savePastedImageBuffers',async(event,{items})=>{
    if(!readable(event))throw Error('Unexpected sender');
    if(!Array.isArray(items)||items.length>100)throw Error('Invalid image batch');
    return items.map(item=>attachments.prepare(item.arrayBuffer,item.fileName));
  });
  ipcMain.handle('inkbridge:savePureBase64Image',async(event,{items})=>{
    if(!readable(event))throw Error('Unexpected sender');
    if(!Array.isArray(items)||items.length>100)throw Error('Invalid image batch');
    return items.map(item=>{const match=/^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=\s]+)$/.exec(item.base64Image||'');if(!match)throw Error('Invalid image data URL');return attachments.prepare(Buffer.from(match[1],'base64'),item.fileName);});
  });
  ipcMain.handle('inkbridge:uploadFile',async(event,request)=>{if(!readable(event))throw Error('Unexpected sender');const source=typeof request==='string'?request:request?.filePath;if(typeof source!=='string'||!path.isAbsolute(source))throw Error('Invalid selected file');const stat=fs.statSync(source);if(!stat.isFile()||stat.size>64*1024*1024)throw Error('Invalid selected file size');const item=attachments.prepare(fs.readFileSync(source),path.basename(source));return {success:true,file:{...item.fileRecord,metadata:item.metadata,destPath:item.filePath},fileRecord:item.fileRecord};});
  ipcMain.handle('inkbridge:inspectFiles',async(event,files)=>{if(!readable(event)||!Array.isArray(files)||files.length>100)throw Error('Invalid file inspection');return files.map(file=>{if(typeof file.path!=='string'||!path.isAbsolute(file.path)||fs.statSync(file.path).size>64*1024*1024)throw Error('Invalid selected file');return {path:file.path,sha256:crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex')};});});
  ipcMain.handle('inkbridge:writeClipboardTextAndHtml',async(event,payload)=>{if(!readable(event))throw Error('Unexpected sender');if(typeof payload?.text!=='string'||typeof payload?.html!=='string'||payload.text.length+payload.html.length>8*1024*1024)throw Error('Invalid clipboard payload');await clipboard.write([new ClipboardItem({'text/plain':payload.text,'text/html':payload.html})]);return {success:true};});
  ipcMain.on('inkbridge:renderer-ready',(event,epoch)=>{if(epoch!==liveSync.epoch)return;if(allowed(event)){rendererReady=true;updater.health().catch(()=>{});updater.check().catch(()=>{});}standalone.markReady(event);liveSync.markedReady(event.sender.id);});
  const finishClose=async()=>{if(snapshotTask)await snapshotTask;if(rendererReady){await standalone.prepareAll();await createSnapshot('close',true);}await database.close();standalone.destroyAll();approvedClose=true;window.close();};
  ipcMain.on('inkbridge:close-result',async(event,result)=>{if(!allowed(event)||result.requestId!==closeRequest)return;clearTimeout(closeTimer);closeRequest=null;if(result.ok){try{await finishClose();}catch(error){closing=false;window.webContents.send('inkbridge:close-cancelled',{message:error.message});await standalone.cancelAll();dialog.showErrorBox('InkBridge 尚未保存',error.message+'；所有視窗保留。');}}else {closing=false;dialog.showErrorBox('InkBridge 尚未保存',result.error||'原版編輯器／SQLite保存未完成');}});
  Menu.setApplicationMenu(null);
  window=new BrowserWindow({width:1200,height:960,title:'InkBridge 墨橋',...(boardMode?{titleBarStyle:'hidden',titleBarOverlay:{color:'#eeeef0',symbolColor:'#3f3f46',height:36}}:{}),webPreferences:{preload:path.resolve(own,'../../src/main/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
  window.on('close',event=>{if(approvedClose)return;event.preventDefault();if(closing)return;if(queue.active){queue.settle().then(()=>{if(!window.isDestroyed())window.close();});return;}closing=true;if(!rendererReady){finishClose().catch(error=>{closing=false;dialog.showErrorBox('InkBridge 尚未保存',error.message);});return;}closeRequest=crypto.randomUUID();window.webContents.send('inkbridge:prepare-close',{requestId:closeRequest});closeTimer=setTimeout(()=>{const requestId=closeRequest;closeRequest=null;closing=false;window.webContents.send('inkbridge:close-cancelled',{requestId,message:'保存確認逾時'});dialog.showErrorBox('InkBridge 尚未保存','保存確認逾時；保留工作區。');},10000);});
  globalThis.__inkbridgeOriginalProbe={dataRoot:data,origin,blocked,preload:'existing InkBridge limited preload; no original window.ipc',nodeIntegration:false,originalMainExecuted:false};
  await window.loadURL(origin+'/');
  const stopSnapshotTimer=require('../../src/main/snapshot-scheduler.cjs').startSnapshotScheduler({ready:()=>rendererReady&&!closing&&!applyingSettings&&!queue.active,save:()=>queue.run('timer-save',()=>createSnapshot('timer')),onError:error=>notify({key:'save',state:'error',title:'自動保存未完成',message:error.message})});
  let blurTimer;app.on('browser-window-blur',()=>{clearTimeout(blurTimer);blurTimer=setTimeout(()=>{if(!BrowserWindow.getFocusedWindow()&&rendererReady&&!closing&&!queue.active)queue.run('background-save',()=>createSnapshot('background')).catch(error=>notify({key:'save',state:'error',title:'背景保存未完成',message:error.message}));},500);});
  window.once('closed',()=>{stopSnapshotTimer();clearTimeout(blurTimer);liveSync.dispose();});
  app.on('second-instance',()=>{if(window.isMinimized())window.restore();window.show();window.focus();});
  app.on('browser-window-focus',()=>{if(rendererReady)updater.check().catch(()=>{});});
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{if(approvedClose)server?.close();});
