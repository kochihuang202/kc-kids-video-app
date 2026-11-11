// Real native share dialog / SQLite flow. This test never opens formal notes.
const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-share-panel-')),graph=await require('../../tests/helpers/web-share-fixture.cjs')(data),db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 const operations=[...graph.boards.map(data=>({type:'putBoard',data})),...graph.contents.map(data=>({type:'putContent',data:{tone:'sage',body:'',...data}})),...graph.instances.map(data=>({type:'putInstance',data})),...graph.cardMetadata.map(data=>({type:'putCatalog',kind:'card',data})),...graph.files.map(data=>({type:'putCatalog',kind:'file',data})),...graph.whiteboardInstances.map(data=>({type:'putCatalog',kind:'whiteboard-instance',data}))];
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations});db.close();
 const online=!!process.env.INKBRIDGE_TEST_SHARE_DEVICE;let pairing;
 if(online){
  const helperEnv={...process.env};delete helperEnv.ELECTRON_RUN_AS_NODE;
  // safeStorage is bound to the originating profile. Pair the isolated test
  // device through the real one-use endpoint instead of copying credentials.
  const result=await require('node:util').promisify(require('node:child_process').execFile)(require('electron'),[path.join(__dirname,'create-test-pairing.cjs')],{env:helperEnv,windowsHide:true});
  pairing=JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
 }
 const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const app=await _electron.launch({args:[path.join(__dirname,'../original-reuse/host.cjs')],executablePath:require('electron'),env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>console.error('PAGEERROR',e));await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await page.evaluate(()=>window.__inkbridgeIntegrated.switchBoard('root'));await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();
  // A pending real Lexical edit must be included even when export is initiated
  // by the new native share entry rather than a separate Save command.
  const point=await page.evaluate(()=>{const s=window.__inkbridgeIntegrated.inspect(),n=s.nodes.find(n=>n.id==='note-instance'),b=document.querySelector('#board').getBoundingClientRect();return{x:b.x+s.view.translateX+(n.position.x+50)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+50)*s.view.scale};});
  await page.mouse.dblclick(point.x,point.y);const editor=page.locator('#board [contenteditable=true]').first();await expect(editor).toBeVisible();await editor.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.insertText('原版分享面板最新內容');
  await expect(page.locator('#export-web-share')).toHaveCount(0);await page.getByRole('button',{name:'分享白板',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  if(online){
   await page.getByRole('textbox',{name:'分享網站網址'}).fill(pairing.baseUrl);await page.getByRole('textbox',{name:'裝置配對碼'}).fill(pairing.code);await page.getByRole('button',{name:'連接裝置',exact:true}).click();pairing=null;
   const tree=page.getByTestId('share-board-tree');await expect(tree).toBeVisible();
   const box=id=>tree.locator('[data-board-id="'+id+'"]').getByRole('checkbox');
   await expect(box('root')).toBeChecked();await expect(box('child')).not.toBeChecked();await expect(box('grand')).not.toBeChecked();await expect(tree).not.toContainText('PRIVATE');
   await box('grand').check();await expect(box('child')).toBeChecked();await box('child').uncheck();await expect(box('grand')).not.toBeChecked();await tree.getByRole('button',{name:'全選子孫',exact:true}).click();await expect(box('grand')).toBeChecked();
  }else{await expect(page.getByTestId('share-connection')).toBeVisible();await expect(page.getByRole('textbox',{name:'分享網站網址'})).toBeVisible();}
  await page.getByText('更多選項',{exact:true}).click();await page.getByRole('button',{name:'匯出離線網頁包',exact:true}).click();await expect(page.getByRole('button',{name:'開啟網頁包資料夾',exact:true})).toBeVisible({timeout:60000});
  const dir=path.join(data,'exports/web'),names=(await fs.readdir(dir)).filter(n=>!n.startsWith('.'));assert.equal(names.length,1);const publication=JSON.parse(await fs.readFile(path.join(dir,names[0],'share.json')));
  assert.deepEqual(publication.boardIds,online?['root','child','grand']:['root']);assert(JSON.stringify(publication).includes('原版分享面板最新內容'));assert(!JSON.stringify(publication).includes('SECRET_NOT_PUBLISHED'));
  const persisted=await page.evaluate(()=>window.inkbridge.load());assert(JSON.stringify(persisted.contents.find(c=>c.id==='note').document).includes('原版分享面板最新內容'));
  let receipt=null;
  if(online){
   const label=await page.evaluate(()=>window.__originalRequire(1643).ag.t('share.settings.publishToWeb',{ns:'common'}));await page.getByRole('button',{name:label,exact:true}).click();
   await expect.poll(async()=>{receipt=await page.evaluate(()=>window.inkbridge.webShare({method:'status',boardId:'root'}));return !!receipt.url;},{timeout:120000}).toBe(true);
   const json=await(await fetch(new URL('share.json',receipt.url))).json();assert.deepEqual(new Set(json.boardIds),new Set(['root','child','grand']));assert(!JSON.stringify(json).includes('SECRET_NOT_PUBLISHED'));
   const oldUrl=receipt.url,oldVersion=receipt.version,updateLabel=await page.evaluate(()=>window.__originalRequire(1643).ag.t('share.settings.updatePublish',{ns:'common'}));
   // Modal may show the original transient success label after publish.
   const publishButton=page.getByRole('button').filter({hasText:updateLabel});
   const successLabel=await page.evaluate(()=>window.__originalRequire(1643).ag.t('share.settings.publishUpdated',{ns:'common'}));
   await page.getByRole('button',{name:successLabel,exact:true}).or(publishButton).first().click();
   await expect.poll(async()=>{receipt=await page.evaluate(()=>window.inkbridge.webShare({method:'status',boardId:'root'}));return receipt.version;},{timeout:120000}).not.toBe(oldVersion);assert.equal(receipt.url,oldUrl);
  }
  assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);await page.screenshot({path:path.join(data,'native-share-panel.png')});
  await page.getByRole('button',{name:/close|關閉/i}).last().click();await expect(page.getByRole('dialog')).toHaveCount(0);
  console.log(JSON.stringify({data,nativeShareEntry:true,nativeCompleteModal:true,connectionRequired:!online,offlineUnderMore:true,initialRootOnly:true,realLexicalCommit:true,formalDataUntouched:true,online,publication:receipt?{url:receipt.url,version:receipt.version}:null}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
