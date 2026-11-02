const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs'),{createAttachmentStore}=require('../../src/main/attachment-store.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-reference-types-')),{noteDocument}=await import('../../src/core/rich-document.mjs');
 const store=createAttachmentStore(path.join(data,'files'),()=>({width:1,height:1})),picture=store.prepare(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3sAAAAASUVORK5CYII=','base64'),'asset.png'),pdf=store.prepare(require('../../tests/helpers/pdf-fixture.cjs')(2),'document.pdf');
 const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[
  {type:'putBoard',data:{id:'board-other',title:'REF_BOARD',view:{x:0,y:0,zoom:1}}},
  {type:'putContent',data:{id:'source',title:'SOURCE',body:'SOURCE',kind:'text',tone:'sage',document:noteDocument({title:'SOURCE',body:'SOURCE'})}},
  {type:'putInstance',data:{id:'source-instance',contentId:'source',boardId:'board-main',x:100,y:150,width:450,height:300,z:0}},
  ...[['picture','image','REF_PICTURE',picture],['pdf','pdf','REF_PDF',pdf]].flatMap(([id,kind,title,file])=>[
   {type:'putContent',data:{id,title,kind,body:'',document:null,tone:'sage'}},
   {type:'putCatalog',kind:'file',data:file.fileRecord},
   {type:'putCatalog',kind:'card',data:{id,title,type:kind==='pdf'?'PDFCard':'MediaCard',fileId:file.fileId,fileSuffix:kind==='pdf'?'pdf':'png',...(kind==='pdf'?{totalPages:2}:{}),isTrashed:false}}
  ])
 ]});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});let app=await launch(),page;
 try{
  page=await app.firstWindow();page.setDefaultTimeout(10000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();await app.evaluate(({shell})=>{global.__attachmentOpenRequests=[];shell.openPath=async file=>{global.__attachmentOpenRequests.push(file);return '';};});
  const p=await page.evaluate(()=>{const s=window.__inkbridgeIntegrated.inspect(),b=document.querySelector('#board').getBoundingClientRect(),n=s.nodes[0];return {x:b.x+s.view.translateX+(n.position.x+80)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+60)*s.view.scale};});await page.mouse.dblclick(p.x,p.y);
  const editor=page.locator('#board [contenteditable=true]').first();await expect(editor).toBeVisible();await editor.press('Control+End');
  for(const name of ['REF_PICTURE','REF_PDF','REF_BOARD','asset.png']){await editor.press('Control+End');await page.keyboard.insertText(' [['+name);const picker=page.getByRole('dialog').last();await picker.getByRole('option',{name,exact:true}).click();await page.keyboard.press('Enter');}
  await page.keyboard.press('Control+s');
  for(const id of ['picture','pdf','board-other'])await expect(editor.locator('[data-inline-mention-object-id="'+id+'"]').first()).toBeVisible();
  await editor.locator('[data-inline-mention-object-type="File"]').first().click();await expect.poll(()=>app.evaluate(()=>global.__attachmentOpenRequests.length)).toBe(1);assert.deepEqual(await fs.readFile((await app.evaluate(()=>global.__attachmentOpenRequests))[0]),store.readUrl('flexnote://file/'+picture.fileId).bytes);
  await editor.locator('[data-inline-mention-object-id="pdf"]').first().click();await expect.poll(()=>page.evaluate(()=>window.__originalRequire(63268).Z.getState().ui.globalModalParams.card?.id)).toBe('pdf');await expect.poll(()=>page.getByRole('dialog').last().locator('canvas').count()).toBeGreaterThan(0);await page.keyboard.press('Escape');
  await editor.locator('[data-inline-mention-object-id="picture"]').first().click();await expect.poll(()=>page.locator('[role=dialog] img').evaluateAll(imgs=>imgs.some(img=>img.complete&&img.naturalWidth>0))).toBe(true);await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);if(!await editor.count()){const point=await page.evaluate(()=>{const s=window.__inkbridgeIntegrated.inspect(),b=document.querySelector('#board').getBoundingClientRect(),n=s.nodes.find(n=>n.id==='source-instance');return {x:b.x+s.view.translateX+(n.position.x+25)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+25)*s.view.scale};});await page.mouse.dblclick(point.x,point.y);}await expect(editor).toBeVisible();
  await editor.locator('[data-inline-mention-object-id="board-other"]').first().click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId)).toBe('board-other');await page.evaluate(()=>window.__inkbridgeIntegrated.flush());assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
  for(const id of ['picture','pdf','board-other']){const refs=await page.evaluate(id=>window.__inkbridgeServices.call('getCardLinks',{cardId:id}),id);assert.equal(refs.linksInNoteCards[0].noteCard.id,'source');}
  const saved=(await page.evaluate(()=>window.inkbridge.load())).contents.find(c=>c.id==='source').document;await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);assert.deepEqual((await page.evaluate(()=>window.inkbridge.load())).contents.find(c=>c.id==='source').document,saved);const bytesAfter=await page.evaluate(async ids=>Promise.all(ids.map(async id=>Array.from(new Uint8Array(await(await fetch('flexnote://file/'+id)).arrayBuffer())))),[picture.fileId,pdf.fileId]);assert.equal(crypto.createHash('sha256').update(Buffer.from(bytesAfter[0])).digest('hex'),picture.fileId);assert.equal(crypto.createHash('sha256').update(Buffer.from(bytesAfter[1])).digest('hex'),pdf.fileId);
  console.log(JSON.stringify({allReferenceTypesAndCasRetainedOnRestart:true,fileReferenceNativeIpcAndVerifiedPath:true,osViewerLaunchIntercepted:true,imageMentionAndRealCasImage:true,pdfMentionAndNativeCanvas:true,whiteboardMentionNavigation:true,allReverseReferences:true}));
 }catch(e){console.error(e);if(page)console.error((await page.locator('body').innerText()).slice(-2200),await page.evaluate(()=>window.__inkbridgeIntegrated?.errors));await app.evaluate(({app})=>app.exit(1)).catch(()=>{});throw e;}finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
