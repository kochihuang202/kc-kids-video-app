const {app,BrowserWindow,protocol,net,ipcMain,session,dialog}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createDatabaseClient}=require('./database-client.cjs');
const crypto=require('node:crypto');
const project=path.resolve(__dirname,'../..');
const isTest=process.env.INKBRIDGE_TEST==='1';
const closeTimeoutMs=isTest?Math.max(50,Number(process.env.INKBRIDGE_TEST_CLOSE_TIMEOUT_MS)||10000):10000;
app.setName('InkBridge');
const dataRoot=isTest&&process.env.INKBRIDGE_TEST_DATA?path.resolve(process.env.INKBRIDGE_TEST_DATA):path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'InkBridge');
if(/flexnote|onedrive/i.test(dataRoot))throw Error('InkBridge requires its own local data root');
for(const [key,leaf]of Object.entries({userData:'Profile',sessionData:'Session',logs:'Logs',crashDumps:'Crashes'})){
  const target=path.join(dataRoot,leaf);fs.mkdirSync(target,{recursive:true});app.setPath(key,target);
}
app.setAppUserModelId('org.inkbridge.desktop');
protocol.registerSchemesAsPrivileged([{scheme:'inkbridge',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,codeCache:true}}]);
if(!app.requestSingleInstanceLock()){app.quit();}else{
  let window,database,rendererReady=false,approvedClose=false,closeRequest=null,closeTimer;
  const senderAllowed=event=>event.sender===window?.webContents&&event.senderFrame?.url.startsWith('inkbridge://app/');
  function closeFailed(message){
    clearTimeout(closeTimer);const requestId=closeRequest;closeRequest=null;
    window?.webContents.send('inkbridge:close-cancelled',{requestId,message});
    dialog.showErrorBox('InkBridge 尚未保存',message+'\n工作區仍保持開啟，未回報保存成功。');
  }
  async function finishClose(){await database?.close();approvedClose=true;window?.close();}
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(async()=>{
    protocol.handle('inkbridge',async request=>{
      try{
        const url=new URL(request.url);if(url.host!=='app')return new Response('Not found',{status:404});
        const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');let file;
        if(relative==='vendor/canvaskit.js'||relative==='vendor/canvaskit.wasm')file=path.join(project,'node_modules/canvaskit-wasm/bin/full',path.basename(relative));
        else if(relative==='vendor/editor.mjs')file=path.join(project,'build/editor.mjs');
        else if(relative==='fonts/ui'){
          file=['msjh.ttc','segoeui.ttf'].map(name=>path.join(process.env.SystemRoot||'C:/Windows','Fonts',name)).find(p=>fs.existsSync(p));
        }else if(relative==='fonts/bold'){
          file=['msjhbd.ttc','segoeuib.ttf'].map(name=>path.join(process.env.SystemRoot||'C:/Windows','Fonts',name)).find(p=>fs.existsSync(p));
        }else if(relative==='fonts/emoji'){
          file=path.join(process.env.SystemRoot||'C:/Windows','Fonts','seguiemj.ttf');
        }else if(relative==='fonts/mono'){
          file=['consola.ttf','cour.ttf'].map(name=>path.join(process.env.SystemRoot||'C:/Windows','Fonts',name)).find(p=>fs.existsSync(p));
        }else{
          const root=relative.startsWith('core/')?path.join(project,'src/core'):path.join(project,'src/renderer');
          const logical=relative.startsWith('core/')?relative.slice(5):relative||'index.html';
          file=path.resolve(root,logical);if(!file.startsWith(root+path.sep))return new Response('Forbidden',{status:403});
        }
        if(!file)return new Response('System font unavailable',{status:404});
        const response=await net.fetch(pathToFileURL(file).toString());const headers=new Headers(response.headers);
        if(/\.(mjs|js)$/.test(file))headers.set('Content-Type','application/javascript');
        if(file.endsWith('.wasm'))headers.set('Content-Type','application/wasm');
        return new Response(response.body,{status:response.status,headers});
      }catch{return new Response('Not found',{status:404});}
    });
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    const filename=path.join(dataRoot,'Workspace','inkbridge.sqlite3');fs.mkdirSync(path.dirname(filename),{recursive:true});
    database=createDatabaseClient({filename});
    ipcMain.handle('inkbridge:load',event=>{if(!senderAllowed(event))throw Error('Unexpected sender');return database.load();});
    ipcMain.handle('inkbridge:commit',async(event,request)=>{
      if(!senderAllowed(event))throw Error('Unexpected sender');
      try{return {ok:true,ack:await database.commit(request)};}catch(error){return {ok:false,error:{message:error.message,code:error.code,details:error.details||null}};}
    });
    ipcMain.on('inkbridge:renderer-ready',event=>{if(senderAllowed(event))rendererReady=true;});
    ipcMain.on('inkbridge:close-result',async(event,result)=>{
      if(!senderAllowed(event)||!closeRequest||result.requestId!==closeRequest)return;
      clearTimeout(closeTimer);
      if(!result.ok){closeFailed(result.error||'保存失敗');return;}
      try{await finishClose();}catch(error){closeFailed(error.message);}
    });
    const os=require('node:os');
    ipcMain.handle('inkbridge:info',async event=>{
      if(!event.senderFrame.url.startsWith('inkbridge://app/'))throw Error('Unexpected sender');
      const metrics=app.getAppMetrics();
      return {product:'InkBridge',version:app.getVersion(),isTest,dataRoot,databasePath:filename,versions:process.versions,gpu:app.getGPUFeatureStatus(),gpuInfo:await app.getGPUInfo('basic'),
        hardware:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryMiB:Math.round(os.totalmem()/1048576),osRelease:os.release(),arch:os.arch()},
        memory:metrics.map(p=>({type:p.type,...p.memory})),cpu:metrics.map(p=>({type:p.type,...p.cpu}))};
    });
    window=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:640,title:'InkBridge 墨橋',backgroundColor:'#f4f3ee',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('inkbridge://app/'))event.preventDefault();});
    window.webContents.on('render-process-gone',(_event,details)=>console.error('renderer gone',details.reason));
    window.on('close',event=>{
      if(approvedClose)return;event.preventDefault();
      if(closeRequest)return;closeRequest=crypto.randomUUID();
      if(!rendererReady){finishClose().catch(error=>closeFailed(error.message));return;}
      window.webContents.send('inkbridge:prepare-close',{requestId:closeRequest});
      closeTimer=setTimeout(()=>closeFailed('未能取得編輯器及 SQLite 的保存確認。'),closeTimeoutMs);
    });
    await window.loadURL('inkbridge://app/index.html');
    window.show();
    window.focus();
  }).catch(error=>{console.error(error);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(window&&!window.isDestroyed()&&!approvedClose){event.preventDefault();window.close();}});
}
