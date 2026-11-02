const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-settings-')),exchange=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-exchange-settings-'));
  const {WorkspaceDatabase}=require('../../src/main/database.cjs');
  const db=new WorkspaceDatabase(path.join(data,'Workspace','inkbridge.sqlite3'));
  db.commit({requestId:require('node:crypto').randomUUID(),baseRevision:0,operations:[{type:'putBoard',data:{id:'board-main',title:'設定驗收',view:{x:0,y:0,zoom:1}}}]});db.close();
  const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});
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
    await page.screenshot({path:path.join(data,'storage-settings.png')});
    await app.evaluate(({shell})=>{shell.openPath=async p=>{global.__settingsOpened=p;return '';};});
    await page.locator('#open-local-data').click();await expect.poll(()=>app.evaluate(()=>global.__settingsOpened)).toBe(data);
    await page.locator('#cancel-storage-settings').click();await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    await page.getByRole('button',{name:'設定',exact:true}).click();await expect(page.locator('#exchange-directory')).toHaveValue(exchange);
    assert.equal((await page.evaluate(()=>window.inkbridge.load())).contents[0].body,'設定前的未保存內容，子視窗也保存');
    assert.deepEqual(await fs.readdir(exchange),[]);
    console.log(JSON.stringify({browseCancel:true,readWriteProbe:true,failedFlushPreservesSettings:true,commitBeforeApply:true,restartRetainsMachinePath:true,noDataMigration:true,data,exchange}));
  }finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
