const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../..'),data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-')),env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;
 const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env,timeout:30000});let app=await launch();
 try{
 let page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready,{},{timeout:30000});
 const label=key=>page.evaluate(key=>window.__originalRequire(1643).ag.t(key,{ns:'common'}),key);
 await page.locator('#create-whiteboard').click();let dialog=page.getByRole('dialog');await dialog.locator('input').fill('Created board');await dialog.getByRole('button',{name:await label('submit'),exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId)).not.toBe('board-main');
 const id=await page.evaluate(()=>window.__inkbridgeIntegrated.inspect().boardId),list=page.locator('#original-board-list');await expect(list.getByText('Created board',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.__inkbridgeIntegrated.addCard('Preserved card','PRESERVE_AFTER_TRASH',{x:20,y:20}));await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
 const before=await page.evaluate(()=>window.inkbridge.load()),view=before.boards.find(b=>b.id===id).view;
 assert.equal(before.boards.find(b=>b.id===id).attributes.spaceId,before.workspaceId);
 await list.getByText('Created board',{exact:true}).click({button:'right'});await page.getByRole('button',{name:await label('Rename'),exact:true}).click();
 dialog=page.getByRole('dialog');await dialog.locator('input').fill('Renamed board');await dialog.getByRole('button',{name:await label('Submit'),exact:true}).click();
 await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.load())).boards.find(b=>b.id===id)?.title).toBe('Renamed board');
 assert.deepEqual((await page.evaluate(()=>window.inkbridge.load())).boards.find(b=>b.id===id).view,view);
 await page.getByRole('button',{name:'zoom-in',exact:true}).click();await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
 assert.equal((await page.evaluate(()=>window.inkbridge.load())).boards.find(b=>b.id===id).title,'Renamed board');
 await list.getByText('Renamed board',{exact:true}).click({button:'right'});await page.getByRole('button',{name:await label('Delete'),exact:true}).click();
 dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:await label('Cancel'),exact:true}).click();assert(!(await page.evaluate(()=>window.inkbridge.load())).boards.find(b=>b.id===id).attributes.isTrashed);
 await list.getByText('Renamed board',{exact:true}).click({button:'right'});await page.getByRole('button',{name:await label('Delete'),exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:await label('Delete'),exact:true}).click();
 await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.load())).boards.find(b=>b.id===id)?.attributes.isTrashed).toBe(true);await expect(list.getByText('Renamed board',{exact:true})).toHaveCount(0);
 const after=await page.evaluate(()=>window.inkbridge.load());assert.deepEqual(after.contents,before.contents);assert.deepEqual(after.instances,before.instances);await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.home)).toBe(true);
 const targets=await page.evaluate(id=>window.__originalRequire(58850).KD('findTargetsByCardIdAndType',{cardIds:[id],cardType:'Whiteboard'}),id);assert.equal(targets[0].name,'Renamed board');assert(targets[0].isTrashed);
 const mainTitle=before.boards.find(b=>b.id==='board-main').title;
 await list.getByText(mainTitle,{exact:true}).click({button:'right'});await page.getByRole('button',{name:await label('Delete'),exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:await label('Delete'),exact:true}).click();
 await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.load())).boards.every(board=>board.attributes?.isTrashed)).toBe(true);
 await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready,{},{timeout:30000});
 const reopened=await page.evaluate(()=>window.inkbridge.load());assert.deepEqual(reopened.contents,after.contents);assert.deepEqual(reopened.instances,after.instances);assert(reopened.boards.find(b=>b.id===id).attributes.isTrashed);
 assert(await page.evaluate(()=>window.__inkbridgeIntegrated.home));await expect(page.locator('#add-card')).toBeDisabled();
 await page.keyboard.press('Delete');await page.evaluate(()=>window.__inkbridgeIntegrated.flush());assert.deepEqual((await page.evaluate(()=>window.inkbridge.load())).instances,after.instances);
 // Original48677 does not hydrate missing Whiteboards; after trash the tab
 // falls back to its saved title. The authoritative renamed target is tested above.
 await expect(page.locator('[data-tour="history-tabs"]').getByText('Created board',{exact:true})).toBeVisible();
 await page.locator('#create-whiteboard').click();dialog=page.getByRole('dialog');await dialog.locator('input').fill('After trash board');await dialog.getByRole('button',{name:await label('submit'),exact:true}).click();
 await dialog.waitFor({state:'hidden'});
 await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.home)).toBe(false);await expect(page.locator('#add-card')).toBeEnabled();
 const final=await page.evaluate(()=>window.inkbridge.load());assert.equal(final.boards.filter(board=>!board.attributes?.isTrashed).length,1);assert.deepEqual(final.contents,after.contents);assert.deepEqual(final.instances,after.instances);
 assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);const result={originalCreateDialog:true,createCommit:true,originalRename:true,titleSurvivesZoom:true,cancelDelete:true,originalTrashConfirmation:true,noContentRemoved:true,trashedTargetLookup:true,allTrashedRestartSafe:true,createAfterAllTrashed:true,restart:true};
 await fs.writeFile(path.join(root,'private-original-editor/board-management-result.json'),JSON.stringify(result,null,2));await page.screenshot({path:path.join(root,'private-original-editor/board-management-success.png')});console.log(JSON.stringify(result));
 }catch(error){const page=await app.firstWindow();await page.screenshot({path:path.join(root,'private-original-editor/management-failure.png')});console.log(JSON.stringify({state:await page.evaluate(()=>window.__inkbridgeIntegrated),dialogs:await page.getByRole('dialog').allTextContents(),buttons:await page.getByRole('button').allTextContents()}));await app.evaluate(({app})=>app.exit(1));throw error;}finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
