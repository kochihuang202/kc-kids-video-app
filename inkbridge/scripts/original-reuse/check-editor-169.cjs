// Real Electron/Lexical/SQLite, with a test-only root capture to exercise the
// actual mounted Canvas unmount callback. No production test API is added.
const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
const doc=text=>({root:{type:'root',version:1,children:[{type:'paragraph',version:1,children:[{type:'text',version:1,text,format:0,detail:0,mode:'normal',style:''}],direction:null,format:'',indent:0}],direction:null,format:'',indent:0}});
(async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-editor169-')),db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));
  db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putBoard',data:{id:'board-main',title:'Editor 169',view:{x:60,y:100,zoom:1}}},{type:'putContent',data:{id:'note',kind:'text',title:'一般文字卡片',body:'一般文字卡片',document:doc('一般文字卡片'),tone:'sage'}},{type:'putInstance',data:{id:'note-instance',contentId:'note',boardId:'board-main',x:400,y:430,width:320,height:200,z:0}},{type:'putCatalog',kind:'mindmap',data:{id:'map',title:'Root',layoutMode:'logic-right'}},...['root','child'].map(id=>({type:'putCatalog',kind:'mindmap-node',data:{id,mindMapId:'map',isRoot:id==='root',type:'Text',content:doc(id==='root'?'測試主題':'原文字'),childNodeIds:id==='root'?['child']:[]}})),{type:'putCatalog',kind:'mindmap-instance',data:{id:'root',objectId:'map',whiteboardId:'board-main',x:100,y:180,width:160,height:48}}]});db.close();
  const env={...process.env,INKBRIDGE_ORIGINAL_VIEW:'board',INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
  const candidate=process.env.INKBRIDGE_TEST_BUILD;
  const launch=()=>_electron.launch({args:[candidate?path.join(candidate,'app/scripts/original-reuse/host.cjs'):path.join(__dirname,'host.cjs')],executablePath:candidate?path.join(candidate,'runtime/electron.exe'):require('electron'),env});
  let app=await launch(),page,stage='boot';
  const ready=async()=>{page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);await app.evaluate(({app})=>app.focus({steal:true}));await page.bringToFront();};
  const load=()=>page.evaluate(()=>window.inkbridge.load());
  try{
    await ready();
    await page.addInitScript(()=>{
      let value;Object.defineProperty(window,'__originalRequire',{configurable:true,get:()=>value,set:require=>{value=new Proxy(require,{apply(target,receiver,args){const module=Reflect.apply(target,receiver,args);if(args[0]!==31542)return module;return new Proxy(module,{get(object,key){const value=object[key];if(key!=='createRoot')return value;return function(container,...args){const root=value(container,...args);if(container.id==='board')window.__editor169Root=root;return root;};}});}});}});
    });
    await page.reload();await ready();await page.waitForFunction(()=>!!window.__editor169Root);
    stage='real mindmap edit';
    const bounds=await page.evaluate(()=>{const s=window.__inkbridgeIntegrated.inspect(),n=s.nodes.find(n=>n.id==='child'),b=document.querySelector('#board').getBoundingClientRect();return {x:b.x+s.view.translateX+(n.position.x+n.width/2)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+n.height/2)*s.view.scale};});
    await page.mouse.click(bounds.x,bounds.y);await page.keyboard.press('Enter');const editor=page.locator('#board [contenteditable=true]').first();await expect(editor).toBeVisible();await editor.press('Control+a');
    await page.keyboard.insertText('中文心智圖');await page.keyboard.insertText('連續編輯 ABC');
    await expect.poll(()=>page.evaluate(()=>{const n=window.__inkbridgeIntegrated.inspect().nodes.find(n=>n.id==='child');return window.__originalRequire(94700).Vj(n.data.content);})).toBe('中文心智圖連續編輯 ABC');
    await page.screenshot({path:path.join(data,'editing.png')});
    stage='commit while editor remains open';await page.keyboard.press('Control+s');
    await expect.poll(async()=>JSON.stringify((await load()).mindmapNodes.find(n=>n.id==='child').content)).toContain('中文心智圖連續編輯 ABC');
    const ack=await page.evaluate(()=>window.__inkbridgeIntegrated.flush());const committed=(await load()).revision;
    await page.evaluate(()=>window.__inkbridgeIntegrated.flush());assert.equal((await load()).revision,committed,'duplicate editor flush must not create a new content revision');
    stage='normal text card remains editable';await page.keyboard.press('Escape');
    const notePoint=await page.evaluate(()=>{const s=window.__inkbridgeIntegrated.inspect(),n=s.nodes.find(n=>n.id==='note-instance'),b=document.querySelector('#board').getBoundingClientRect();return {x:b.x+s.view.translateX+(n.position.x+40)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+40)*s.view.scale};});
    await page.mouse.dblclick(notePoint.x,notePoint.y);await expect(editor).toBeVisible();await editor.press('Control+a');await page.keyboard.insertText('一般卡片仍正常');await page.keyboard.insertText('連續保存');
    await page.keyboard.press('Control+s');await page.evaluate(()=>window.__inkbridgeIntegrated.flush());assert(JSON.stringify((await load()).contents.find(n=>n.id==='note').document).includes('一般卡片仍正常連續保存'));
    stage='unmount with failing native release';
    const teardown=await page.evaluate(()=>{
      const r=window.__originalRequire,engine=r(66597).L,original=engine.delete,warn=console.warn,observed=[];
      console.warn=(...args)=>{observed.push(String(args[0]));warn(...args);};
      engine.delete=function(...args){original.apply(this,args);throw Error('editor169 deliberate release failure after real release');};
      try{r(31542).flushSync(()=>window.__editor169Root.unmount());return {warnings:observed,canvasReleased:r(23).gt.getState().canvasKit===null,editingCleared:r(23).gt.getState().editingNodeId===null,errors:window.__inkbridgeIntegrated.errors};}
      finally{engine.delete=original;console.warn=warn;}
    });
    assert(teardown.warnings.some(s=>s.includes('failed to release canvas resource')));assert(teardown.canvasReleased);assert(teardown.editingCleared);assert.deepEqual(teardown.errors,[]);
    // Restore a real mounted UI before the application's normal close/flush.
    await page.reload();await ready();assert(JSON.stringify((await load()).mindmapNodes).includes('中文心智圖連續編輯 ABC'));
    stage='normal restart';await app.close();app=await launch();await ready();
    const restored=await load();assert(JSON.stringify(restored.mindmapNodes.find(n=>n.id==='child').content).includes('中文心智圖連續編輯 ABC'));assert(JSON.stringify(restored.contents.find(n=>n.id==='note').document).includes('一般卡片仍正常連續保存'));assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
    await page.screenshot({path:path.join(data,'restart.png')});
    console.log(JSON.stringify({data,realLexicalEditing:true,normalTextCard:true,commitWithEditorOpen:true,noDuplicateRevision:true,actualCanvasFailureCleanup:true,normalRestart:true,ack}));
  }catch(error){console.error({stage,data});await page?.screenshot({path:path.join(data,'failure.png')}).catch(()=>{});throw error;}
  finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
