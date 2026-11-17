const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-html-')),source=path.join(data,'source'),entry=await require('../../tests/helpers/html-page-fixture.cjs')(source),db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putBoard',data:{id:'board-main',title:'HTML 拖放',view:{x:0,y:0,zoom:.65}}}]});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const build=process.env.INKBRIDGE_TEST_BUILD,launch=()=>_electron.launch({args:[build?path.join(build,'app/scripts/original-reuse/host.cjs'):path.join(__dirname,'host.cjs')],executablePath:build?path.join(build,'runtime/electron.exe'):require('electron'),env});
 let app=await launch(),page,stage='boot';const ready=async()=>{page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready,{},{timeout:45000});};
 const verify=async()=>{
  const frame=page.frameLocator('[data-website-overlay-frame]').first();await expect(frame.locator('#heading')).toHaveText('HTML 完整呈現',{timeout:15000});
  await expect(frame.locator('html')).toHaveAttribute('data-module-ready','yes');await expect(frame.locator('html')).toHaveAttribute('data-inline-ready','yes');await expect(frame.locator('body')).toHaveCSS('background-color','rgb(20, 80, 130)');await expect(frame.locator('#picture')).toHaveJSProperty('naturalWidth',80);
  await frame.locator('body').evaluate(()=>document.fonts.ready);assert(await frame.locator('body').evaluate(()=>document.fonts.check('16px fixture')));
  assert.equal(await frame.locator('body').evaluate(()=>typeof window.inkbridge),'undefined');
  const overlay=await page.locator('[data-website-overlay-content]').first().boundingBox();await page.mouse.click(overlay.x+20,overlay.y+80);const frameBox=await page.locator('[data-website-overlay-frame]').first().boundingBox(),geometry=await frame.locator('#increment').evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth};});await page.mouse.click(frameBox.x+geometry.x*frameBox.width/geometry.width,frameBox.y+geometry.y*frameBox.width/geometry.width);await expect(frame.locator('#increment')).toHaveText('計數 1');await frame.locator('#typed').fill('中文 HTML 互動');await expect(frame.locator('#typed')).toHaveValue('中文 HTML 互動');
 };
 try{
  await ready();stage='trusted OS file drop';const cdp=await page.context().newCDPSession(page),rect=await page.locator('#board').boundingBox();for(const type of ['dragEnter','dragOver','drop'])await cdp.send('Input.dispatchDragEvent',{type,x:rect.x+120,y:rect.y+130,data:{items:[],files:[entry],dragOperationsMask:1}});
  await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.load())).contents.filter(c=>c.kind==='html').length,{timeout:15000}).toBe(1);await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
  const graph=await page.evaluate(()=>window.inkbridge.load());assert.equal(graph.files.length,9);stage='render and interact';await verify();await page.screenshot({path:path.join(data,'html.png')});
  await fs.rename(source,source+'.moved');stage='restart without source';await app.close();app=await launch();await ready();await verify();
  const reopened=await page.evaluate(()=>window.inkbridge.load());assert.equal(reopened.revision,graph.revision,'render and restart do not create shared revisions');assert.deepEqual(reopened.contents,graph.contents);assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
  await fs.writeFile(path.resolve(__dirname,'../../private-original-editor/html-electron-result.json'),JSON.stringify({data,graph:reopened},null,2));console.log(JSON.stringify({data,osDrop:true,cssAndFont:true,localImage:true,moduleAndInteraction:true,sourceIndependentRestart:true,noViewRevision:true}));
 }catch(e){console.error({stage,data});console.error(await page?.evaluate(()=>window.__inkbridgeIntegrated?.errors).catch(()=>null));await page?.screenshot({path:path.join(data,'failure.png')}).catch(()=>{});throw e;}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
