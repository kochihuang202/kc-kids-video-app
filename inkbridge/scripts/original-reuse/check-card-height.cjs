const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-card-height-'));const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
 db.commit({requestId:require('node:crypto').randomUUID(),baseRevision:0,operations:[{type:'putBoard',data:{id:'board-main',title:'Height test',view:{x:0,y:0,zoom:1}}}]});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const launch=()=>_electron.launch({args:[path.join(__dirname,'host.cjs')],executablePath:require('electron'),env});let app=await launch(),page,clipboard;
 const ready=async()=>{page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);};
 try{await ready();clipboard=await app.evaluate(async({clipboard})=>{const result=[];for(const item of await clipboard.read()){const values=[];for(const type of item.types){const value=await item.getType(type);values.push({type,data:typeof value==='string'?value:Array.from(new Uint8Array(await value.arrayBuffer()))});}result.push(values);}return result;});
 await page.getByRole('button',{name:'設定',exact:true}).click();await page.locator('#storage-settings').getByRole('tab',{name:'編輯器',exact:true}).click();await page.locator('#card-max-height').fill('600');await page.locator('#save-card-max-height').click();await expect(page.locator('#storage-settings-status')).toContainText('已保存卡片高度');await page.locator('#cancel-storage-settings').click();
 await expect(page.locator('[role=dialog]')).toHaveCount(0);await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();
 const board=await page.locator('#board').boundingBox();await page.mouse.dblclick(board.x+320,board.y+180);await expect.poll(()=>page.evaluate(()=>window.__inkbridgeIntegrated.inspect().nodes.length)).toBe(1);const editor=page.locator('#board [contenteditable=true]').first();await expect(editor).toBeVisible();
 const text=Array.from({length:100},(_,i)=>`第 ${i+1} 段 測試長文章，內容必須完整保留。`).join('\n');
 await app.evaluate(async({clipboard,ClipboardItem},text)=>clipboard.write([new ClipboardItem({'text/plain':text})]),text);await editor.click();await page.keyboard.press('Control+v');
 await expect.poll(async()=>{await page.evaluate(()=>window.__inkbridgeIntegrated.flush());return (await page.evaluate(()=>window.inkbridge.load())).contents[0]?.body.includes('第 100 段');}).toBe(true);
 const id=await page.evaluate(()=>window.__originalRequire(23).gt.getState().nodes.find(n=>n.type==='NoteCard').id);
 const node=()=>page.evaluate(id=>{const s=window.__originalRequire(23).gt.getState();return s.nodes.find(n=>n.id===id);},id);
 await expect.poll(async()=>(await node()).height).toBe(600);assert.equal((await node()).data.isAutoHeight,false);
 const scrolling=await page.locator('#board').evaluate(el=>[el,...el.querySelectorAll('*')].filter(n=>n.scrollHeight>n.clientHeight+20&&/auto|scroll/.test(getComputedStyle(n).overflowY)).length);assert(scrolling>0,'long note uses actual native scroll container');
 await page.screenshot({path:path.join(data,'long-card-edit.png')});await page.mouse.click(board.x+150,board.y+550);
 // Native fixed-height resize service is the same persistence boundary as handles.
 await page.evaluate(async id=>{await window.__inkbridgeServices.call('updateNoteCardInstance',{id,updates:{height:1100,isAutoHeight:false}});},id);assert.equal((await node()).height,1100);assert.equal((await node()).data.inkbridgeManagedHeight,false);
 await page.evaluate(id=>window.__originalRequire(23).gt.getState().setSelectedNodeIds(new Set([id])),id);await expect(page.locator('.selection-toolbar-container')).toBeVisible();
 // Native tooltip wrapper exposes the label only while hovered; button gets an explicit aria label in the patch.
 await page.getByRole('button',{name:'重設高度',exact:true}).click();await expect.poll(async()=>(await node()).height).toBe(600);assert.equal((await node()).width,520);
 const autoLabel=await page.evaluate(()=>window.__originalRequire(1643).ag.t('Auto Height',{ns:'common'}));await page.locator('.selection-toolbar-container').getByRole('button',{name:autoLabel,exact:true}).click();await expect.poll(async()=>(await node()).data.isAutoHeight).toBe(true);assert.equal((await node()).data.inkbridgeManagedHeight,false);assert((await page.evaluate(id=>window.__inkbridgeIntegrated.bounds(id),id)).height>600,'explicit auto height expands the complete long note');await page.getByRole('button',{name:'重設高度',exact:true}).click();await expect.poll(async()=>(await node()).height).toBe(600);
 await page.evaluate(()=>window.__inkbridgeIntegrated.flush());let graph=await page.evaluate(()=>window.inkbridge.load());assert.equal(graph.instances[0].height,600);assert(graph.contents[0].body.includes('第 100 段'));
 // Real OS clipboard image, exceeding the former 600x800 display cap.
 await app.evaluate(async({clipboard,ClipboardItem,nativeImage})=>{const pixels=Buffer.alloc(1200*900*4,255),png=nativeImage.createFromBitmap(pixels,{width:1200,height:900}).toPNG();await clipboard.write([new ClipboardItem({'image/png':new Blob([png],{type:'image/png'})})]);});
 await page.mouse.click(board.x+150,board.y+550);await page.keyboard.press('Control+v');await expect.poll(async()=>(await page.evaluate(()=>window.inkbridge.load())).contents.filter(c=>c.kind==='image').length,{timeout:20000}).toBe(1);
 await page.evaluate(()=>window.__inkbridgeIntegrated.flush());graph=await page.evaluate(()=>window.inkbridge.load());const image=graph.contents.find(c=>c.kind==='image'),placement=graph.instances.find(i=>i.contentId===image.id);assert.deepEqual([placement.width,placement.height],[1200,900]);assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
 await app.evaluate(async({clipboard,ClipboardItem},saved)=>{if(saved.length)await clipboard.write(saved.map(values=>new ClipboardItem(Object.fromEntries(values.map(v=>[v.type,typeof v.data==='string'?v.data:new Blob([new Uint8Array(v.data)],{type:v.type})])))));else await clipboard.clear();},clipboard);clipboard=null;
 await app.close();app=await launch();await ready();assert.equal((await page.evaluate(()=>window.inkbridge.sync({method:'deviceRead'}))).editorPreferences.cardMaxHeight,600);assert.equal((await node()).height,600);const reopened=await page.evaluate(()=>window.inkbridge.load());assert.equal(reopened.contents.find(c=>c.kind==='text').body,graph.contents.find(c=>c.kind==='text').body);assert.deepEqual(reopened.instances.find(i=>i.contentId===image.id),placement);
 console.log(JSON.stringify({data,longPasteCapped:true,nativeScroll:true,manualHeightPreserved:true,realResetButton:true,originalImagePixels:true,settingsAndContentSurviveRestart:true}));
 }catch(error){await page?.screenshot({path:path.join(data,'failure.png')}).catch(()=>{});console.error('test data',data);console.log(await page?.evaluate(()=>({errors:window.__inkbridgeIntegrated?.errors,nodes:window.__originalRequire(23).gt.getState().nodes,editor:document.querySelector('[contenteditable=true]')?.outerHTML.slice(0,500)})).catch(()=>null));throw error;}
 finally{if(clipboard)await app.evaluate(async({clipboard,ClipboardItem},saved)=>{if(saved.length)await clipboard.write(saved.map(values=>new ClipboardItem(Object.fromEntries(values.map(v=>[v.type,typeof v.data==='string'?v.data:new Blob([new Uint8Array(v.data)],{type:v.type})])))));else await clipboard.clear();},clipboard).catch(()=>{});await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});



