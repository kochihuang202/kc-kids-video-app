// Real original-component/SQLite flow. No mock DOM, original app, or user data.
const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..'),data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-'));
 const {noteDocument}=await import('../../src/core/rich-document.mjs');
 const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[
  {type:'putBoard',data:{id:'board-main',title:'Alpha board',view:{x:30,y:40,zoom:.8}}},
  {type:'putBoard',data:{id:'board-two',title:'Beta board',view:{x:70,y:80,zoom:.7}}},
  ...['main','two'].flatMap((id,i)=>[{type:'putContent',data:{id:'content-'+id,title:id+' note',body:'Fixture '+id,kind:'text',tone:'sage',document:noteDocument({title:id+' note',body:'Fixture '+id})}},
   {type:'putInstance',data:{id:'instance-'+id,contentId:'content-'+id,boardId:'board-'+id,x:20,y:20,width:520,height:200,z:i}}])
 ]});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env,timeout:30000});let app=await launch();
 try{
  let page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready,{},{timeout:30000});
  const list=page.locator('#original-board-list');await expect(list.getByText('Alpha board',{exact:true})).toBeVisible();await expect(list.getByText('Beta board',{exact:true})).toBeVisible();
  await expect(page.locator('.breadcrumb strong')).toHaveText('Alpha board');
  assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.shellModules),{list:74582,zoom:46979,service:58850,tabs:23733,outline:41});
  const outline=page.locator('#original-flow-outline');await expect(outline.getByRole('option').filter({hasText:'main note'})).toBeVisible();
  const search=outline.locator('input');await search.fill('no match fixture');await expect(outline.getByRole('option')).toHaveCount(0);await search.fill('main');await expect(outline.getByRole('option')).toHaveCount(1);await search.fill('');
  await outline.getByRole('option').filter({hasText:'main note'}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().selectedNodeIds)).toContain('instance-main');
  const zoomBefore=await page.evaluate(()=>window.__inkbridgeIntegrated.inspect().view.scale);
  await page.getByRole('button',{name:'zoom-in',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().view.scale)).toBeGreaterThan(zoomBefore);
  await page.getByRole('button',{name:'zoom',exact:true}).click();await page.getByRole('button',{name:'70%',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().view.scale)).toBeCloseTo(.7,6);
  async function edit(){const state=await page.evaluate(()=>window.__inkbridgeIntegrated.inspect()),box=await page.locator('#board').boundingBox(),node=state.nodes[0];await page.mouse.dblclick(box.x+state.view.translateX+(node.position.x+90)*state.view.scale,box.y+state.view.translateY+(node.position.y+90)*state.view.scale);const editor=page.locator('#board [contenteditable="true"]');await editor.waitFor();await editor.press('Control+End');return editor;}
  await edit();await page.keyboard.insertText('LATEST_BEFORE_NAV');
  await list.getByText('Beta board',{exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId)).toBe('board-two');
  let graph=await page.evaluate(()=>window.inkbridge.load());assert(graph.contents.find(c=>c.id==='content-main').body.includes('LATEST_BEFORE_NAV'));assert.equal((await page.evaluate(()=>window.__inkbridgeIntegrated.inspect())).nodes[0].id,'instance-two');
  const tabs=page.locator('[data-tour="history-tabs"]');await tabs.locator('[data-active]').filter({hasText:'Alpha board'}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId)).toBe('board-main');
  await edit();const cdp=await page.context().newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'組字中',selectionStart:3,selectionEnd:3});
  await page.evaluate(()=>{window.__shellSwitched=false;window.__shellSwitch=window.__inkbridgeIntegrated.switchBoard('board-two').then(()=>{window.__shellSwitched=true;});});
  assert.equal(await page.evaluate(()=>window.__shellSwitched),false);assert.equal(await page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId),'board-main');
  await cdp.send('Input.insertText',{text:'NAV_IME_COMMITTED'});await page.evaluate(()=>window.__shellSwitch);
  graph=await page.evaluate(()=>window.inkbridge.load());assert(graph.contents.find(c=>c.id==='content-main').body.includes('NAV_IME_COMMITTED'));
  await page.getByRole('button',{name:'fit-view',exact:true}).click();await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
  // Repeated original navigation must not create more React roots/providers.
  for(const name of ['Alpha board','Beta board','Alpha board','Beta board']){await list.getByText(name,{exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId)).toBe(name.startsWith('Alpha')?'board-main':'board-two');}
  assert.equal(await page.locator('#original-zoom-controls [aria-label="zoom-in"]').count(),1);
  await list.getByText('Alpha board',{exact:true}).click({button:'right'});const renameLabel=await page.evaluate(()=>window.__originalRequire(1643).ag.t('Rename',{ns:'common'}));await expect(page.getByRole('button',{name:renameLabel,exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__inkbridgeIntegrated.flush());const expected=await page.evaluate(()=>window.inkbridge.load());
  assert.equal(expected.boards.find(b=>b.id==='board-main').title,'Alpha board');assert.equal(expected.boards.find(b=>b.id==='board-two').title,'Beta board');
  await tabs.locator('[data-active]').filter({hasText:'Alpha board'}).click({button:'middle'});
  await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.history({method:'getHistoryTabs'}))).data.length).toBe(1);
  assert.equal(await page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId),'board-two');
  await tabs.locator('[data-active]').filter({hasText:'Beta board'}).click({button:'middle'});
  await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.home)).toBe(true);
  await expect(page.locator('#original-board-home').getByText('Alpha board',{exact:true})).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>window.inkbridge.load()),expected);
  await list.getByText('Alpha board',{exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.home)).toBe(false);
  const historyBefore=await page.evaluate(()=>window.inkbridge.history({method:'getHistoryTabs'}));assert.equal(historyBefore.data.length,1);assert.equal(historyBefore.data[0].sourceId,'board-main');
  await page.screenshot({path:path.join(root,'private-original-editor/original-shell-integrated.png')});
  await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready,{},{timeout:30000});
  const actual=await page.evaluate(()=>window.inkbridge.load());assert.deepEqual(actual,expected);
  const historyAfter=await page.evaluate(()=>window.inkbridge.history({method:'getHistoryTabs'}));assert.equal(historyAfter.data[0].id,historyBefore.data[0].id);
  const result={originalList:true,originalZoom:true,originalHistoryTabs:true,originalOutline:true,outlineSearch:true,outlineSelect:true,tabSwitch:true,inactiveTabClose:true,lastTabHome:true,tabReopen:true,persistedTabIdentity:true,zoomPreset:true,fitView:true,navigateWhileEditing:true,compositionWaitsBeforeSwitch:true,repeatSwitch:true,managementMenu:true,restartExact:true,errors:await page.evaluate(()=>window.__inkbridgeIntegrated.errors)};
  assert.deepEqual(result.errors,[]);await fs.writeFile(path.join(root,'private-original-editor/original-shell-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){const page=await app.firstWindow();await page.screenshot({path:path.join(root,'private-original-editor/shell-failure.png')});console.log(JSON.stringify({errors:await page.evaluate(()=>window.__inkbridgeIntegrated),buttons:await page.getByRole('button').allTextContents()}));await app.evaluate(({app})=>app.exit(1));throw error;}finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
