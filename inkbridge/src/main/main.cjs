const {app,BrowserWindow,protocol,net,ipcMain,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'../..');
const isTest=process.env.INKBRIDGE_TEST==='1';
app.setName('InkBridge');
const dataRoot=isTest&&process.env.INKBRIDGE_TEST_DATA?path.resolve(process.env.INKBRIDGE_TEST_DATA):path.join(app.getPath('appData'),'InkBridge','Development');
if(/flexnote|onedrive/i.test(dataRoot))throw Error('InkBridge requires its own local data root');
for(const [key,leaf]of Object.entries({userData:'Profile',sessionData:'Session',logs:'Logs',crashDumps:'Crashes'})){
  const target=path.join(dataRoot,leaf);fs.mkdirSync(target,{recursive:true});app.setPath(key,target);
}
app.setAppUserModelId('org.inkbridge.desktop');
protocol.registerSchemesAsPrivileged([{scheme:'inkbridge',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,codeCache:true}}]);
if(!app.requestSingleInstanceLock()){app.quit();}else{
  let window;
  app.on('second-instance',()=>{window?.restore();window?.focus();});
  app.whenReady().then(async()=>{
    protocol.handle('inkbridge',async request=>{
      try{
        const url=new URL(request.url);if(url.host!=='app')return new Response('Not found',{status:404});
        const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');let file;
        if(relative==='vendor/canvaskit.js'||relative==='vendor/canvaskit.wasm')file=path.join(project,'node_modules/canvaskit-wasm/bin/full',path.basename(relative));
        else if(relative==='fonts/ui'){
          file=['msjh.ttc','seguiemj.ttf','segoeui.ttf'].map(name=>path.join(process.env.SystemRoot||'C:/Windows','Fonts',name)).find(p=>fs.existsSync(p));
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
    const os=require('node:os');
    ipcMain.handle('inkbridge:info',async event=>{
      if(!event.senderFrame.url.startsWith('inkbridge://app/'))throw Error('Unexpected sender');
      return {product:'InkBridge',version:app.getVersion(),isTest,dataRoot,versions:process.versions,gpu:app.getGPUFeatureStatus(),gpuInfo:await app.getGPUInfo('basic'),
        hardware:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryMiB:Math.round(os.totalmem()/1048576),osRelease:os.release(),arch:os.arch()},
        memory:app.getAppMetrics().map(p=>({type:p.type,...p.memory}))};
    });
    window=new BrowserWindow({width:1440,height:960,minWidth:960,minHeight:640,title:'InkBridge 墨橋',backgroundColor:'#f4f3ee',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('inkbridge://app/'))event.preventDefault();});
    window.webContents.on('render-process-gone',(_event,details)=>console.error('renderer gone',details.reason));
    await window.loadURL('inkbridge://app/index.html');
  }).catch(error=>{console.error(error);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
}
