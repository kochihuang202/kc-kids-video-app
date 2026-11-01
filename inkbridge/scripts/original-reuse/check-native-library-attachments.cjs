// Narrow real-UI regression for attachment library operations, not a paste rerun.
const {_electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
const {createAttachmentStore}=require('../../src/main/attachment-store.cjs');
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-library-assets-'));
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII=','base64');
  const file=createAttachmentStore(path.join(data,'Workspace/files'),()=>({width:1,height:1})).prepare(bytes,'Library Picture.png');
  const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
  db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[
    {type:'putContent',data:{id:'image-test',kind:'image',title:'Library Picture',body:'',document:null,tone:'sage'}},
    {type:'putCatalog',kind:'file',data:{...file.fileRecord,filePath:'Workspace/files/'+path.basename(file.fileRecord.filePath)}},
    {type:'putCatalog',kind:'card',data:{id:'image-test',type:'MediaCard',fileId:file.fileId,fileSuffix:'png',width:1,height:1,isTrashed:false}}
  ]});db.close();
  const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
  const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});
  let app=await launch(),page;
  try{
    page=await app.firstWindow();page.setDefaultTimeout(8000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    const t=key=>page.evaluate(key=>window.__originalRequire(1643).ag.t(key,{ns:'common'}),key);
    const load=()=>page.evaluate(()=>window.inkbridge.load());
    const library=()=>page.locator('#original-sidebar-navigation').getByRole('tab',{name:/卡片[庫库]/}).click();
    const main=page.locator('#original-board-home'),item=()=>main.locator('[id="image-test"].card-list-page-item');
    await library();await expect(item()).toBeVisible();
    const search=main.locator('input[aria-label]').first();await search.fill('missing-image');await expect(item()).toHaveCount(0);
    await search.fill('Library Picture');await expect(item()).toBeVisible();await search.fill('');
    await item().click({button:'right'});await page.locator('.context-menu-root').getByText(await t('AddToWhiteboard'),{exact:true}).click();
    await page.getByRole('dialog').getByRole('option',{name:'靈感白板',exact:true}).click();
    await expect.poll(async()=>(await load()).instances.filter(row=>row.contentId==='image-test').length).toBe(1);
    await item().click({button:'right'});await page.locator('.context-menu-root').getByText(await t('Delete'),{exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:await t('Confirm'),exact:true}).click();
    await expect(item()).toHaveCount(0);await expect.poll(async()=>(await load()).cardMetadata.find(row=>row.id==='image-test').isTrashed).toBe(true);
    assert.equal((await load()).instances.length,0);
    await page.locator('#open-trash').click();await expect(main.getByText('Library Picture',{exact:true})).toBeVisible();
    await main.getByRole('button',{name:await t('Restore'),exact:true}).click();
    await expect.poll(async()=>(await load()).cardMetadata.find(row=>row.id==='image-test').isTrashed).toBe(false);
    await library();await expect(item()).toBeVisible();
    assert.equal((await load()).instances.length,0,'native restore restores content, not deleted placements');
    assert.deepEqual(await fs.readFile(path.join(data,'Workspace/files',path.basename(file.fileRecord.filePath))),bytes);
    const saved=await load();await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
    assert.deepEqual((await load()).cardMetadata,saved.cardMetadata);assert.deepEqual((await load()).files,saved.files);
    assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
    console.log(JSON.stringify({nativeImageSearch:true,nativeAddToBoard:true,nativeTrashRestore:true,casBytesRetained:true,restartRetained:true}));
  }catch(error){if(page&&!page.isClosed()){console.log(await page.locator('body').innerText());console.log(await page.evaluate(()=>window.__inkbridgeIntegrated.errors));}await app.evaluate(({app})=>app.exit(1)).catch(()=>{});throw error;}
  finally{await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
