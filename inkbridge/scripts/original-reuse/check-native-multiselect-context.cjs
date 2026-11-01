const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-multi-')),db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3')),{noteDocument}=await import('../../src/core/rich-document.mjs');
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[0,1,2].flatMap(i=>[{type:'putContent',data:{id:'content-'+i,title:'Card '+i,body:'Body',kind:'text',tone:'sage',document:noteDocument({title:'Card '+i,body:'Body'})}},{type:'putInstance',data:{id:'instance-'+i,contentId:'content-'+i,boardId:'board-main',x:60+i*350,y:200,width:280,height:180,z:i}},{type:'putCatalog',kind:'instance',data:{id:'instance-'+i,isAutoHeight:false}}])});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});let app=await launch(),page;
 try{
  page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();
  const t=key=>page.evaluate(key=>window.__originalRequire(1643).ag.t(key,{ns:'common'}),key),flush=()=>page.evaluate(()=>window.__inkbridgeIntegrated.flush()),load=()=>page.evaluate(()=>window.inkbridge.load());
  const point=()=>page.evaluate(()=>{const b=document.querySelector('#board').getBoundingClientRect(),s=window.__originalRequire(23).gt.getState();return [...s.nodes].sort((a,b)=>a.id.localeCompare(b.id)).map(n=>({x:b.x+s.view.translateX+(n.position.x+40)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+30)*s.view.scale}));});
  let p=await point();await page.mouse.click(p[0].x,p[0].y);await page.keyboard.down('Shift');await page.mouse.click(p[1].x,p[1].y);await page.keyboard.up('Shift');
  await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().selectedNodeIds.length)).toBe(2);
  page.setDefaultTimeout(8000);const toolbar=page.locator('.multi-selection-toolbar-container');await expect(toolbar).toBeVisible();assert((await toolbar.innerText()).includes('2'));
  await page.keyboard.down('Shift');await page.mouse.click(p[2].x,p[2].y);await page.keyboard.up('Shift');await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().selectedNodeIds.length)).toBe(3);await expect(toolbar).toContainText('3');
  await toolbar.locator('button').nth(2).click();await flush();assert((await load()).instances.every(i=>i.attributes.isFolded===true));
  await toolbar.locator('button').nth(2).click();await flush();assert((await load()).instances.every(i=>i.attributes.isFolded===false));
  await page.screenshot({path:path.resolve(__dirname,'../../private-original-editor/multiselect-context-success.png')});
  // Native batch auto-height actions must commit both placements.
  await toolbar.locator('button').nth(3).click();await flush();assert((await load()).instances.every(i=>i.attributes.isAutoHeight===true));
  p=await point();await page.mouse.click(p[0].x,p[0].y,{button:'right'});await expect(page.locator('.context-menu-root').first()).toBeVisible();
  await page.locator('.context-menu-root').first().getByText(await t('Auto Height'),{exact:true}).click();await flush();assert.equal((await load()).instances.find(i=>i.id==='instance-0').attributes.isAutoHeight,false);
  // A second context invocation must use fresh state and the clicked card.
  p=await point();await page.mouse.click(p[1].x,p[1].y,{button:'right'});await expect(page.locator('.context-menu-root').first()).toBeVisible();await page.locator('.context-menu-root').first().getByText(await t('Highlight Header'),{exact:true}).click();await flush();assert.equal((await load()).instances.find(i=>i.id==='instance-1').attributes.highlightHeader,true);assert.notEqual((await load()).instances.find(i=>i.id==='instance-0').attributes.highlightHeader,true);
  await page.mouse.click(1100,650);const before=await page.evaluate(()=>window.__inkbridgeIntegrated.inspect().view);await page.mouse.move(1000,600);await page.mouse.down({button:'right'});await page.mouse.move(1080,640,{steps:10});await page.mouse.up({button:'right'});await expect(page.locator('.context-menu-root').first()).toHaveCount(0);assert.notDeepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.inspect().view),before);
  await flush();const saved=await load();assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);assert.deepEqual(await load(),saved);console.log(JSON.stringify({multiSelectToolbar:true,twoAndThreeSelected:true,batchFoldUnfoldPersisted:true,batchAutoHeightPersisted:true,rightClickCardMenu:true,rightClickActionPersisted:true,rightDragPanPreserved:true,restart:true}));
 }catch(error){console.error(error);if(page)console.error(await page.evaluate(()=>window.__inkbridgeIntegrated?.errors).catch(()=>[]));await app.evaluate(({app})=>app.exit(1)).catch(()=>{});throw error;}finally{await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
