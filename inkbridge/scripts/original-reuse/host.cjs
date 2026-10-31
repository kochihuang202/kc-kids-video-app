// Isolated host for original modules; never starts the original Electron main.
const {app,BrowserWindow,session,ipcMain,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const crypto=require('node:crypto');
const {createDatabaseClient}=require('../../src/main/database-client.cjs');
const root=path.resolve(__dirname,'../../private-original-editor'),own=__dirname;
const project=path.resolve(__dirname,'../..'),boardMode=process.env.INKBRIDGE_ORIGINAL_VIEW==='board';
const data=process.env.INKBRIDGE_ORIGINAL_PROBE_DATA||(app.isPackaged?path.join(root,'profiles','desktop'):null);if(!data)throw Error('A dedicated probe profile is required');
const resolvedData=path.resolve(data),tempRoot=require('node:os').tmpdir();
if(!resolvedData.startsWith(path.join(root,'profiles')+path.sep)&&!(path.dirname(resolvedData)===tempRoot&&path.basename(resolvedData).startsWith('inkbridge-original-modules-')))throw Error('Probe profile must be inside its private profiles or a dedicated temp directory');
app.setName('InkBridge Original Module Probe');
for(const [key,name]of Object.entries({userData:'Profile',sessionData:'Session',logs:'Logs',crashDumps:'Crashes'})){const target=path.join(data,name);fs.mkdirSync(target,{recursive:true});app.setPath(key,target);}
app.setAppUserModelId('org.inkbridge.original-module-preview');const acquired=app.requestSingleInstanceLock();if(!acquired)app.quit();
const types={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
let server,window,database,rendererReady=false,approvedClose=false,closeRequest=null,closeTimer;
app.whenReady().then(async()=>{
  if(!acquired)return;
  const filename=path.join(data,'Workspace','inkbridge.sqlite3');fs.mkdirSync(path.dirname(filename),{recursive:true});database=createDatabaseClient({filename});
  server=http.createServer((request,response)=>{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(pathname==='/'){
      response.setHeader('Content-Type','text/html; charset=utf-8');
      response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'");
      const originalScripts='<script src="/runtime.js"></script><script src="/register-original.js"></script><script src="/_next/static/LOq0EGi9XWnc3BD21aEGY/_buildManifest.js"></script><script src="/_next/static/LOq0EGi9XWnc3BD21aEGY/_ssgManifest.js"></script>';
      if(boardMode){
        let html=fs.readFileSync(path.join(project,'src/renderer/index.html'),'utf8');
        html=html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'').replace('href="styles.css"','href="/inkbridge-ui/styles.css"').replace('<link rel="stylesheet" href="editor.css">','');
        html=html.replace('<link rel="stylesheet" href="/inkbridge-ui/styles.css">','<link rel="stylesheet" href="/_next/static/css/0a3dd850c67b254e.css"><link rel="stylesheet" href="/inkbridge-ui/styles.css">');
        html=html.replace(/<canvas id="board"[^>]*><\/canvas>/,'<div id="board" role="application" aria-label="InkBridge 原版白板" style="position:absolute;inset:0;width:100%;height:100%"></div>');
        html=html.replace(/<aside class="sidebar">[\s\S]*?<\/aside>/,'<aside class="original-sidebar flex min-h-0 shrink-0 flex-col border-r border-default-200 bg-content1 p-2" style="width:280px"><div id="original-board-list" class="min-h-0 flex-1" aria-label="白板清單"></div><small id="board-navigation-status" role="status"></small><button id="open-trash" class="mt-2 rounded-md px-2 py-1 text-left text-xs text-default-600" title="回收站">回收站</button><div id="persistence-status" class="px-2 py-1 text-xs text-default-500">正在載入…</div><b id="sidebar-count" hidden></b><div id="inspector" hidden></div></aside>');
        html=html.replace('<div class="breadcrumb">','<div id="original-history-tabs" style="flex:1;min-width:0"></div><div class="breadcrumb" style="display:none" hidden>');
        html=html.replace('</main>','</main><aside id="original-flow-outline" aria-label="卡片列表" style="width:280px;min-width:280px;background:white;border-left:1px solid #e1e4dc;display:flex;min-height:0"></aside>');
        html=html.replace('<div class="zoom-controls">','<div id="original-board-home" style="display:contents"></div><div id="original-zoom-controls"></div><div class="zoom-controls" hidden>');
        html=html.replace('</head>','<style>.canvas-wrap{isolation:isolate}#board-navigation-status{display:block;color:#a54235;font-size:11px}#original-zoom-controls{display:contents}.zoom-controls[hidden]{display:none}.board-heading h2{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style></head>');
        html=html.replace('<script src="vendor/canvaskit.js"></script><script type="module" src="workspace.mjs"></script>',originalScripts+'<script type="module" src="/integration/board.mjs"></script>');
        response.end(html);return;
      }
      response.end('<!doctype html><html lang="zh-TW"><meta charset="utf-8"><title>InkBridge — original module isolation probe</title><link rel="stylesheet" href="/_next/static/css/0a3dd850c67b254e.css"><style>body{margin:20px;background:#eee;font-family:sans-serif}#editor-host{width:520px;background:white;min-height:300px}canvas{background:white;margin-top:20px}#status{white-space:pre-wrap}</style><body><h1>InkBridge 原版模組隔離驗證</h1><pre id="status">正在載入原版模組…</pre><div id="editor-host"></div><canvas id="original-canvas" width="620" height="1400"></canvas>'+originalScripts+'<script src="/probe.js"></script></body></html>');return;
    }
    let file;
    if(pathname==='/probe.js')file=path.join(own,'probe.js');
    else if(pathname.startsWith('/integration/')&&pathname.endsWith('.mjs')){
      file=path.resolve(own,'.'+pathname.slice('/integration'.length));if(!file.startsWith(own+path.sep)){response.writeHead(403);response.end();return;}
    }
    else if(pathname==='/inkbridge-ui/styles.css')file=path.join(project,'src/renderer/styles.css');
    else if(pathname==='/inkbridge-core/persistence-coordinator.mjs')file=path.resolve(own,'../../src/core/persistence-coordinator.mjs');
    else if(pathname==='/inkbridge-core/rich-document.mjs')file=path.resolve(own,'../../src/core/rich-document.mjs');
    else if(pathname==='/runtime.js'||pathname==='/register-original.js')file=path.join(root,path.basename(pathname));
    else{
      const assetRoot=path.join(root,'vendor/app');file=path.resolve(assetRoot,'.'+pathname);
      if(!file.startsWith(assetRoot+path.sep)){response.writeHead(403);response.end();return;}
    }
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const blocked=[];session.defaultSession.webRequest.onBeforeRequest((details,callback)=>{const allowed=details.url.startsWith(origin+'/')||details.url==='about:blank';if(!allowed)blocked.push(details.url.split('?')[0]);callback({cancel:!allowed});});
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  const allowed=event=>event.sender===window?.webContents&&event.senderFrame?.url.startsWith(origin+'/');
  ipcMain.handle('inkbridge:info',event=>{if(!allowed(event))throw Error('Unexpected sender');return {product:'InkBridge Original Module Probe',version:'private-porting',isTest:true,dataRoot:data,databasePath:filename};});
  ipcMain.handle('inkbridge:load',event=>{if(!allowed(event))throw Error('Unexpected sender');return database.load();});
  ipcMain.handle('inkbridge:history',(event,request)=>{if(!allowed(event))throw Error('Unexpected sender');return database.history(request);});
  ipcMain.handle('inkbridge:commit',async(event,request)=>{if(!allowed(event))throw Error('Unexpected sender');try{return {ok:true,ack:await database.commit(request)};}catch(error){return {ok:false,error:{message:error.message,code:error.code}};}});
  ipcMain.on('inkbridge:renderer-ready',event=>{if(allowed(event))rendererReady=true;});
  const finishClose=async()=>{await database.close();approvedClose=true;window.close();};
  ipcMain.on('inkbridge:close-result',async(event,result)=>{if(!allowed(event)||result.requestId!==closeRequest)return;clearTimeout(closeTimer);closeRequest=null;if(result.ok)await finishClose();else dialog.showErrorBox('InkBridge 尚未保存',result.error||'原版編輯器／SQLite保存未完成');});
  window=new BrowserWindow({width:1200,height:960,title:'InkBridge 原版模組隔離驗證',webPreferences:{preload:path.resolve(own,'../../src/main/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(origin+'/'))event.preventDefault();});
  window.on('close',event=>{if(approvedClose)return;event.preventDefault();if(closeRequest)return;if(!rendererReady){finishClose().catch(error=>dialog.showErrorBox('InkBridge 尚未保存',error.message));return;}closeRequest=crypto.randomUUID();window.webContents.send('inkbridge:prepare-close',{requestId:closeRequest});closeTimer=setTimeout(()=>{const requestId=closeRequest;closeRequest=null;window.webContents.send('inkbridge:close-cancelled',{requestId,message:'保存確認逾時'});dialog.showErrorBox('InkBridge 尚未保存','保存確認逾時；保留工作區。');},10000);});
  globalThis.__inkbridgeOriginalProbe={dataRoot:data,origin,blocked,preload:'existing InkBridge limited preload; no original window.ipc',nodeIntegration:false,originalMainExecuted:false};
  await window.loadURL(origin+'/');
  app.on('second-instance',()=>{if(window.isMinimized())window.restore();window.show();window.focus();});
});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>server?.close());
