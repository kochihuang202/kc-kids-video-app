const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-settings-')),exchange=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-exchange-settings-'));
  const {WorkspaceDatabase}=require('../../src/main/database.cjs');
  const db=new WorkspaceDatabase(path.join(data,'Workspace','inkbridge.sqlite3'));
  db.commit({requestId:require('node:crypto').randomUUID(),baseRevision:0,operations:[{type:'putBoard',data:{id:'board-main',title:'設定驗收',view:{x:0,y:0,zoom:1}}}]});db.close();
  const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  const launch=async()=>{const instance=await _electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});await instance.evaluate(({dialog})=>{dialog.showErrorBox=(title,message)=>{console.error('TEST ERROR DIALOG',title,message);};});return instance;};
  let app=await launch(),page;
  try{
    page=await app.firstWindow();page.setDefaultTimeout(10000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    const board=await page.locator('#board').boundingBox();await page.mouse.dblclick(board.x+200,board.y+180);
    await expect(page.locator('#board [contenteditable=true]').first()).toBeFocused();await page.keyboard.insertText('設定前的未保存內容');
    await page.getByRole('button',{name:'設定',exact:true}).click();await expect(page.locator('#exchange-directory')).toHaveValue('');
    await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
    await page.locator('#browse-exchange').click();await expect(page.locator('#exchange-directory')).toHaveValue('');
    await app.evaluate(({dialog},directory)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[directory]});},exchange);
    await page.locator('#browse-exchange').click();await expect(page.locator('#exchange-directory')).toHaveValue(exchange);
    await page.locator('#check-exchange').click();await expect(page.locator('#storage-settings-status')).toContainText('本機可讀寫');
    // A failed editor barrier must keep the old setting and the dialog usable.
    await page.evaluate(()=>{window.__settingsSavedHandler=window.__inkbridgeRemoteRequest;window.__inkbridgeRemoteRequest=()=>Promise.reject(Error('測試保存失敗'));});
    await page.locator('#apply-storage-settings').click();await expect(page.locator('#storage-settings-status')).toContainText('測試保存失敗');
    assert.equal((await page.evaluate(()=>window.inkbridge.storageSettings({method:'read'}))).exchangeDirectory,'');
    await page.evaluate(()=>{window.__inkbridgeRemoteRequest=window.__settingsSavedHandler;});
    await page.locator('#apply-storage-settings').click();await expect(page.locator('#storage-settings-status')).toContainText('已保存本機設定');
    assert.equal(await page.evaluate(()=>document.body.inert),false);
    const graph=await page.evaluate(()=>window.inkbridge.load());assert.equal(graph.contents[0].body,'設定前的未保存內容');
    await page.locator('#cancel-storage-settings').click();
    await page.evaluate(cardId=>window.__inkbridgeServices.call('openNoteCardWindow',{cardId}),graph.contents[0].id);
    await expect.poll(()=>app.windows().length).toBe(2);
    const child=app.windows().find(p=>p!==page);await child.waitForFunction(()=>window.__inkbridgeStandalone?.ready);
    await child.locator('[contenteditable=true]').first().click();await child.keyboard.press('End');await child.keyboard.insertText('，子視窗也保存');
    await page.getByRole('button',{name:'設定',exact:true}).click();
    await page.locator('#apply-storage-settings').click();await expect(page.locator('#storage-settings-status')).toContainText('已保存本機設定');
    assert.equal(await child.evaluate(()=>document.body.inert),false);
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'設定前的未保存內容，子視窗也保存');
    await page.locator('#create-workspace-snapshot').click();await expect(page.locator('#storage-settings-status')).toContainText('快照已建立並驗證');
    const snapshotDirectory=path.join(exchange,'snapshots',graph.workspaceId);
    const complete=async()=>{const entries=await fs.readdir(snapshotDirectory);const out=[];for(const entry of entries){try{out.push(JSON.parse(await fs.readFile(path.join(snapshotDirectory,entry,'manifest.json'))));}catch{}}return out;};
    const first=(await complete())[0];assert.equal(first.parentSnapshotId,null);
    await page.locator('#create-workspace-snapshot').click();await expect(page.locator('#storage-settings-status')).toContainText('沒有變更');assert.equal((await complete()).length,1);
    await child.locator('[contenteditable=true]').first().click();await child.keyboard.press('End');await child.keyboard.insertText('，CtrlS快照');await child.keyboard.press('Control+s');
    await expect.poll(async()=>(await complete()).length).toBe(2);
    const second=(await complete()).find(m=>m.snapshotId!==first.snapshotId);assert.equal(second.parentSnapshotId,first.snapshotId);
    const {DatabaseSync}=require('node:sqlite');const inspection=new DatabaseSync(path.join(snapshotDirectory,second.snapshotId,'database.sqlite3'),{readOnly:true});
    try{assert.equal(inspection.prepare('SELECT body FROM contents WHERE id=?').get(graph.contents[0].id).body,'設定前的未保存內容，子視窗也保存，CtrlS快照');}finally{inspection.close();}
    await page.screenshot({path:path.join(data,'storage-settings.png')});
    await child.locator('[contenteditable=true]').first().click();await child.keyboard.press('End');await child.keyboard.insertText('，關閉前補存');
    await app.evaluate(({shell})=>{shell.openPath=async p=>{global.__settingsOpened=p;return '';};});
    await page.locator('#open-local-data').click();await expect.poll(()=>app.evaluate(()=>global.__settingsOpened)).toBe(data);
    await page.locator('#cancel-storage-settings').click();await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    await page.getByRole('button',{name:'設定',exact:true}).click();await expect(page.locator('#exchange-directory')).toHaveValue(exchange);
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'設定前的未保存內容，子視窗也保存，CtrlS快照，關閉前補存');
    const closed=(await complete()).find(m=>m.reason==='close'&&m.parentSnapshotId===second.snapshotId);assert.ok(closed,'normal close must create a snapshot of final unsaved edits');
    const closeDB=new DatabaseSync(path.join(snapshotDirectory,closed.snapshotId,'database.sqlite3'),{readOnly:true});try{assert.ok(closeDB.prepare('SELECT body FROM contents').get().body.endsWith('關閉前補存'));}finally{closeDB.close();}
    assert.deepEqual((await fs.readdir(exchange)).sort(),['assets','snapshots']);
    await page.locator('#scan-workspace-snapshots').click();await expect(page.locator('#workspace-snapshot-list')).toContainText('目前版本');
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
    await page.locator(`[data-snapshot-id="${first.snapshotId}"]`).click();await expect(page.locator('#storage-settings-status')).toContainText('已取消載入');
    await app.evaluate(({dialog,app})=>{dialog.showMessageBox=async()=>({response:1});app.relaunch=()=>{};});
    const closedEvent=app.waitForEvent('close',{timeout:15000});
    await page.locator(`[data-snapshot-id="${first.snapshotId}"]`).click().catch(()=>{});await closedEvent;
    app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'設定前的未保存內容，子視窗也保存');
    await page.getByRole('button',{name:'設定',exact:true}).click();await page.locator('#scan-workspace-snapshots').click();await expect(page.locator('#workspace-snapshot-list')).toContainText('同一版本鏈的較新版本');
    assert.ok((await complete()).some(m=>m.snapshotId===second.snapshotId),'loading old version must preserve newer snapshot');
    console.log(JSON.stringify({browseCancel:true,readWriteProbe:true,failedFlushPreservesSettings:true,commitBeforeApply:true,restartRetainsMachinePath:true,realChildCtrlSSnapshot:true,backupContainsLatestText:true,noDuplicateSnapshot:true,closeSnapshot:true,scanClassifiesVersions:true,cancelLoad:true,controlledRestartRestore:true,newerVersionPreserved:true,data,exchange}));
  }finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
