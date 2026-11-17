const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-diary-todos-')),root=path.resolve(__dirname,'../..');
 const {noteDocument}=await import('../../src/core/rich-document.mjs'),doc=noteDocument({body:'原始卡片待辦'});
 doc.root.children.push({type:'list',listType:'check',tag:'ul',start:1,version:1,format:'',indent:0,direction:null,children:[{type:'listitem',version:1,checked:false,value:1,format:'',indent:0,direction:null,children:[{type:'text',version:1,text:'來源卡片任務',detail:0,format:0,mode:'normal',style:''}]}]});
 const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations:[{type:'putBoard',data:{id:'board-main',title:'任務來源白板',view:{x:20,y:20,zoom:1}}},{type:'putContent',data:{id:'source-note',kind:'text',title:'原始卡片',body:'來源卡片任務',document:doc,tone:'sage'}},{type:'putInstance',data:{id:'source-instance',contentId:'source-note',boardId:'board-main',x:50,y:50,width:520,height:200,z:0}}]});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const build=process.env.INKBRIDGE_TEST_BUILD,launch=()=>_electron.launch({args:[build?path.join(build,'app/scripts/original-reuse/host.cjs'):path.join(__dirname,'host.cjs')],executablePath:build?path.join(build,'runtime/electron.exe'):require('electron'),env,timeout:30000});
 let app=await launch(),page,stage='boot';const errors=[];
 const ready=async()=>{page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready||window.__inkbridgeIntegrated?.errors.length,{},{timeout:60000});assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);};
 const load=()=>page.evaluate(()=>window.inkbridge.load()),flush=()=>page.evaluate(()=>window.__inkbridgeIntegrated.flush()),t=key=>page.evaluate(key=>window.__originalRequire(1643).ag.t(key,{ns:'common'}),key);
 const open=async key=>{await page.locator(`#original-sidebar-navigation [data-tour="sidebar-menu-${key}"]`).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.page)).toBe(key);};
 try{
  await ready();stage='diary';const initialRevision=(await load()).revision;await open('quick-notes');await page.waitForTimeout(500);assert.equal((await load()).revision,initialRevision,'Opening empty diary does not write');
  const today=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  const day=page.locator(`[data-day="${today}"]`);await day.getByRole('button',{name:'建立每日筆記',exact:true}).click();
  const editor=day.locator('[contenteditable=true]');await expect(editor).toBeVisible();await editor.click();await page.keyboard.insertText('日記中文最後一筆龍');await open('todo');
  await expect.poll(async()=>JSON.stringify((await load()).contents)).toContain('日記中文最後一筆龍');assert.equal((await load()).quickNotes.length,1);
  await open('quick-notes');await expect(day.locator('[contenteditable=true]')).toContainText('日記中文最後一筆龍');
  stage='single day';await day.locator('button[title="'+await t('openInSingleDayView')+'"]').click();
  await expect(page.locator('#original-board-home [contenteditable=true]')).toContainText('日記中文最後一筆龍');
  await page.locator('#original-board-home').getByText(await t('backToTimeline'),{exact:true}).click();
  stage='search';await page.getByRole('button',{name:await t('Search'),exact:true}).click();
  const search=page.getByPlaceholder(await t('timelineSearchPlaceholder'),{exact:true});await search.fill('最後一筆龍');
  await expect(page.locator('#original-board-home mark').first()).toContainText('最後一筆龍');await search.press('Escape');
  stage='calendar';await page.getByRole('button',{name:await t('timelineJumpToDate'),exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'16',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:await t('timelineJump'),exact:true}).click();
  stage='stats';await page.getByRole('button',{name:await t('timelineStats'),exact:true}).click();await page.waitForTimeout(200);await page.getByRole('button',{name:await t('timelineStatsHide'),exact:true}).click();
  await page.screenshot({path:path.join(root,'private-original-editor/diary-initial.png')});
  // Arrange a diary Checklist through the same source-document service, then
  // exercise the original Todo page's daily-note editor and specialized save.
  await page.evaluate(async()=>{const graph=await window.inkbridge.load(),day=graph.quickNotes[0],content=graph.contents.find(row=>row.id===day.id),note=structuredClone(content.document);note.root.children.push({type:'list',listType:'check',tag:'ul',start:1,version:1,format:'',indent:0,direction:null,children:[{type:'listitem',version:1,checked:false,value:1,format:'',indent:0,direction:null,children:[{type:'text',version:1,text:'日記來源任務',detail:0,format:0,mode:'normal',style:''}]}]});await window.__inkbridgeServices.call('updateQuickNote',{id:day.id,updates:{content:note}});});
  stage='todo';await open('todo');await page.waitForTimeout(500);
  await expect(page.locator('#original-board-home').getByText('來源卡片任務',{exact:true}).first()).toBeVisible();
  const task=page.locator('#original-board-home').getByText('來源卡片任務',{exact:true}).first();await task.click();await expect(page.locator('#original-board-home [contenteditable=true]')).toBeVisible();
  const checkbox=page.locator('#original-board-home').getByText('來源卡片任務',{exact:true}).first().locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]').locator('input[type=checkbox]');await checkbox.check();await expect.poll(async()=>JSON.stringify((await load()).contents.find(c=>c.id==='source-note').document)).toContain('"checked":true');
  stage='reverse checkbox';const nativeCheck=page.locator('#original-board-home [contenteditable=true] li[role=checkbox]');await expect(nativeCheck).toHaveAttribute('aria-checked','true');await nativeCheck.click({position:{x:5,y:8}});await flush();
  await expect.poll(async()=>JSON.stringify((await load()).contents.find(c=>c.id==='source-note').document)).toContain('"checked":false');await open('quick-notes');await open('todo');await expect(page.locator('#original-board-home').getByText('來源卡片任務',{exact:true}).first().locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]').locator('input[type=checkbox]')).not.toBeChecked();
  stage='task filters';await page.locator('#original-board-home').getByRole('button',{name:await t('done'),exact:true}).click();await expect(page.locator('#original-board-home input[type=checkbox]')).toHaveCount(0);await page.locator('#original-board-home').getByRole('button',{name:await t('all'),exact:true}).click();await expect(page.locator('#original-board-home input[type=checkbox]')).toHaveCount(2);
  stage='edit diary through todo';await page.locator('#original-board-home').getByText('日記來源任務',{exact:true}).click();const diaryEditor=page.locator('#original-board-home [contenteditable=true]');await expect(diaryEditor).toContainText('日記來源任務');await diaryEditor.click();await diaryEditor.press('Control+End');await page.keyboard.insertText('待辦編輯中文龍');await open('quick-notes');await expect.poll(async()=>JSON.stringify((await load()).contents)).toContain('待辦編輯中文龍');await open('todo');
  stage='source jump';await page.locator('#original-board-home').getByText('來源卡片任務',{exact:true}).first().click();await page.locator('#original-board-home').getByText('任務來源白板',{exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.page)).toBe('flow');
  await page.screenshot({path:path.join(root,'private-original-editor/todo-initial.png')});
  await flush();const saved=await load();await app.evaluate(({app})=>app.exit(0));await app.close();app=await launch();await ready();stage='reopen';await open('quick-notes');await expect(page.locator(`[data-day="${today}"] [contenteditable=true]`)).toContainText('日記中文最後一筆龍');await open('todo');await expect(page.locator('#original-board-home').getByText('來源卡片任務',{exact:true}).first().locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]').locator('input[type=checkbox]')).not.toBeChecked();assert.deepEqual((await load()).quickNotes,saved.quickNotes);assert.deepEqual((await load()).contents,saved.contents);assert.equal((await load()).revision,saved.revision,'Read and reopen do not manufacture a shared version');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
  const receipt={data,latestParentVersion:'1.1.70',emptyReadDoesNotWrite:true,lastChineseSavedOnImmediateSwitch:true,singleDay:true,search:true,calendar:true,stats:true,sourceChecklistBothDirections:true,diaryEditThroughTodo:true,sourceJump:true,reopen:true};await fs.writeFile(path.join(root,'private-original-editor/diary-todo-result.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
 }catch(error){await page.screenshot({path:path.join(root,'private-original-editor/diary-todo-failure.png')});console.error({stage,errors,body:(await page.locator('body').innerText()).slice(-600)});throw error;}
 finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
