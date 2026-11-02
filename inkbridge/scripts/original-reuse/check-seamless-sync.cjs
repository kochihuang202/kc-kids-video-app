const {_electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../../src/main/database.cjs'),{createDatabaseClient}=require('../../src/main/database-client.cjs'),{createSyncSnapshots}=require('../../src/main/sync-snapshots.cjs');
const {createStorageSettings}=require('../../src/main/storage-settings.cjs');
(async()=>{
 const a=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-seamless-')),b=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-remote-')),exchange=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-seamless-exchange-'));
 await fs.mkdir(path.join(a,'Profile'));await fs.mkdir(path.join(a,'files'));await fs.mkdir(path.join(b,'Profile'));await fs.mkdir(path.join(b,'Workspace'));await fs.mkdir(path.join(b,'files'));
 const seed=new WorkspaceDatabase(path.join(a,'Workspace/inkbridge.sqlite3'));seed.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putContent',data:{id:'content-shared',title:'接力',body:'V1',kind:'text',tone:'sage'}},{type:'putInstance',data:{id:'instance-shared',contentId:'content-shared',boardId:'board-main',x:20,y:20,width:520,height:200,z:0}}]});seed.close();
 const dbA=createDatabaseClient({filename:path.join(a,'Workspace/inkbridge.sqlite3')}),snapA=createSyncSnapshots({localDirectory:a,database:dbA,getExchange:()=>exchange,resolveAttachment:()=>{throw Error('No fixture attachment');}});
 const v1=await snapA.create();await dbA.close();await fs.copyFile(path.join(exchange,'snapshots',v1.workspaceId,v1.snapshotId,'database.sqlite3'),path.join(b,'Workspace/inkbridge.sqlite3'));
 const copied=JSON.parse(await fs.readFile(path.join(a,'Profile/snapshot-state.json')));copied.deviceId=crypto.randomUUID();await fs.writeFile(path.join(b,'Profile/snapshot-state.json'),JSON.stringify(copied));
 const dbB=createDatabaseClient({filename:path.join(b,'Workspace/inkbridge.sqlite3')}),snapB=createSyncSnapshots({localDirectory:b,database:dbB,getExchange:()=>exchange,resolveAttachment:()=>{throw Error('No attachment');},deviceName:'公司電腦'});
 const remote=async body=>{const graph=await dbB.load();await dbB.commit({requestId:crypto.randomUUID(),baseRevision:graph.revision,operations:[{type:'putContent',data:{id:'content-shared',title:'接力',body,kind:'text',tone:'sage'}}]});return snapB.create();};
 const v2=await remote('V2 公司內容');
 createStorageSettings({filename:path.join(a,'Profile/storage-settings.json'),localDirectory:a,applicationDirectory:path.resolve(__dirname,'../..')}).save(exchange);
 const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:a};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const app=await _electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});let page;
 try{
  await app.evaluate(({dialog})=>dialog.showErrorBox=(title,message)=>console.error(title,message));page=await app.firstWindow();page.setDefaultTimeout(15000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
  assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V2 公司內容');
  const handle=await app.browserWindow(page).then(win=>win.evaluate(w=>w.getNativeWindowHandle().toString('hex'))),before=(await page.evaluate(()=>window.inkbridge.load())).revision;
  await page.evaluate(()=>window.__inkbridgeIntegrated.controls.setViewport({x:170,y:130,zoom:.8}));
  await expect.poll(()=>page.evaluate(()=>window.inkbridge.sync({method:'deviceRead'}).then(d=>d.boardViews?.['board-main']?.zoom))).toBe(.8);
  assert.equal((await page.evaluate(()=>window.inkbridge.load())).revision,before,'view changes must not commit shared DB');
  await page.evaluate(()=>window.inkbridge.openNoteWindow({cardId:'content-shared'}));await expect.poll(()=>app.windows().length).toBe(2);
  const child=app.windows().find(p=>p!==page);await child.waitForFunction(()=>window.__inkbridgeStandalone?.ready);
  const v3=await remote('V3 無感接力');
  await expect.poll(()=>page.evaluate(()=>window.inkbridge.load()).then(g=>g.contents[0].body),{timeout:30000}).toBe('V3 無感接力');
  await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await child.waitForFunction(()=>window.__inkbridgeStandalone?.ready);
  assert.equal(await app.browserWindow(page).then(win=>win.evaluate(w=>w.getNativeWindowHandle().toString('hex'))),handle);assert.equal(app.windows().length,2);
  await expect(child.locator('[contenteditable=true]')).toContainText('V3 無感接力');await expect(page.locator('#operation-notifications')).toContainText('已更新內容');
  await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().view.scale)).toBe(.8);
  // Exercise the real composition barrier before a remote replacement.
  await child.locator('[contenteditable=true]').click();
  await child.evaluate(()=>{const e=window.__inkbridgeStandalone.editor;window.__compositionWasActive=false;e._compositionKey='sync-test-composition';window.__compositionWasActive=e.isComposing();const root=e.getRootElement(),add=root.addEventListener;root.addEventListener=function(type,...args){if(type==='compositionend')window.__waitingComposition=true;return add.call(this,type,...args);};});
  assert.equal(await child.evaluate(()=>window.__compositionWasActive),true);
  await remote('V4 組字結束後接力');
  await expect.poll(()=>child.evaluate(()=>!!window.__waitingComposition),{timeout:15000}).toBe(true);
  assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'V3 無感接力','remote data cannot replace a composing editor');
  await child.evaluate(()=>{const e=window.__inkbridgeStandalone.editor;e._compositionKey=null;e.getRootElement().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));});
  await expect.poll(()=>page.evaluate(()=>window.inkbridge.load()).then(g=>g.contents[0].body),{timeout:30000}).toBe('V4 組字結束後接力');
  await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await child.waitForFunction(()=>window.__inkbridgeStandalone?.ready);
  // Deliberately deliver a pre-switch epoch to the actual main IPC handler.
  const rejected=await app.evaluate(async({ipcMain,BrowserWindow})=>{try{await ipcMain._invokeHandlers.get('inkbridge:commit')({sender:BrowserWindow.getAllWindows()[0].webContents},{operations:[]},0);return false;}catch(error){return error.code==='STALE_WORKSPACE_EPOCH';}});
  assert.equal(rejected,true,'late writes from a previous workspace must be rejected');
  // Latest local editor data must stop automatic replacement.
  await child.locator('[contenteditable=true]').click();await child.keyboard.press('End');await child.keyboard.insertText(' 本機變更');await child.keyboard.press('Control+s');
  await expect.poll(()=>page.evaluate(()=>window.inkbridge.load()).then(g=>g.contents[0].body)).toContain('本機變更');await remote('V5 遠端分支');
  await expect(page.locator('#operation-notifications')).toContainText('兩台都有新版本',{timeout:30000});assert.ok((await page.evaluate(()=>window.inkbridge.load())).contents[0].body.includes('本機變更'));
  await page.screenshot({path:path.join(a,'seamless-sync.png')});
  console.log(JSON.stringify({automaticStartup:true,automaticLiveUpdate:true,sameNativeWindow:true,multiwindowPreserved:true,viewIsLocal:true,viewPreserved:true,syntheticCompositionBarrier:true,lateEpochRejected:true,conflictDoesNotOverwrite:true,a,b,exchange,v2:v2.snapshotId,v3:v3.snapshotId}));
 }catch(error){console.error(error);console.error(await Promise.all(app.windows().map(p=>p.evaluate(()=>({url:location.href,standalone:window.__inkbridgeStandalone,main:window.__inkbridgeIntegrated?.errors})).catch(()=>({closed:true})))));app.process().kill();throw error;}finally{await dbB.close();await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
