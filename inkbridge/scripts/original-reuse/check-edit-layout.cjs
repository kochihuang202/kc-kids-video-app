// Editing/paint parity with synthetic Chinese headings and checklists.
const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {WorkspaceDatabase}=require('../../src/main/database.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-edit-layout-')),root=path.resolve(__dirname,'../..'),text=value=>({type:'text',version:1,text:value,style:'',detail:0,format:0,mode:'normal'}),p=children=>({type:'paragraph',version:1,format:'',indent:0,direction:null,children}),document={root:{type:'root',version:1,format:'',indent:0,direction:null,children:[{...p([text('編輯前後排版測試')]),type:'heading',tag:'h1'},{...p(['第一個需要完成的項目','第二個測試項目(ABC&DEF)','第三個較短項目','第四個排版對照ABC'].map((value,i)=>({...p([text(value)]),type:'listitem',value:i+1,checked:false}))),type:'list',listType:'check',tag:'ul',start:1},p([]),p([])]}};
 const db=new WorkspaceDatabase(path.join(data,'Workspace/inkbridge.sqlite3'));db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[{type:'putBoard',data:{id:'board-main',title:'排版對照',view:{x:30,y:30,zoom:.6}}},...['a','b'].flatMap((id,i)=>[{type:'putContent',data:{id,kind:'text',title:'編輯前後排版測試',body:'排版對照',tone:'sage',document}},{type:'putInstance',data:{id:'i'+id,contentId:id,boardId:'board-main',x:40+i*560,y:80,width:520,height:301,z:i}},{type:'putCatalog',kind:'instance',data:{id:'i'+id,isAutoHeight:false,inkbridgeManagedHeight:true}}])]});db.close();
 const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_VIEW:'board'};delete env.ELECTRON_RUN_AS_NODE;delete env.INKBRIDGE_PORTABLE;
 const build=process.env.INKBRIDGE_TEST_BUILD,launch=()=>_electron.launch({args:[build?path.join(build,'app/scripts/original-reuse/host.cjs'):path.join(__dirname,'host.cjs')],executablePath:build?path.join(build,'runtime/electron.exe'):require('electron'),env});let app=await launch(),page;
 try{
  page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready||window.__inkbridgeIntegrated?.errors.length,{},{timeout:45000});assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
  await page.evaluate(()=>window.__inkbridgeIntegrated.flush());const before=await page.evaluate(()=>window.inkbridge.load());
  const point=await page.evaluate(()=>{const s=window.__inkbridgeIntegrated.inspect(),n=s.nodes.find(n=>n.id==='ia'),b=document.querySelector('#board').getBoundingClientRect();return {x:b.x+s.view.translateX+(n.position.x+100)*s.view.scale,y:b.y+s.view.translateY+(n.position.y+140)*s.view.scale};});
  await page.screenshot({path:path.join(data,'before.png')});await page.mouse.dblclick(point.x,point.y);const editor=page.locator('#board [contenteditable=true]').first();await expect(editor).toBeVisible();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
  const metrics=await editor.evaluate(root=>{
    const css=e=>{const style=getComputedStyle(e),rect=e.getBoundingClientRect();return {size:parseFloat(style.fontSize),padding:style.padding,line:style.lineHeight,x:rect.x,y:rect.y,width:rect.width};};
    return {root:css(root),ul:css(root.querySelector('ul')),heading:css(root.querySelector('h1')),texts:[...root.querySelectorAll('[data-lexical-text]')].map(css)};
  });
  assert.equal(metrics.ul.padding,'0px 0px 0px 4px','checklists must not inherit bullet indentation');
  const native=await page.evaluate(async()=>{
    const r=window.__originalRequire,s=window.__inkbridgeIntegrated.inspect(),drawer=r(66597).L.getDrawer('NoteCard'),font=r(65857),K=await r(37757).zj(),n=s.nodes.find(n=>n.id==='ib');
    const layout=drawer.getCardLayout({...n,x:n.position.x,y:n.position.y},{CanvasKit:K,fontMgr:font.fO.getFontMgr(),theme:'light',view:s.view,selectedNodeIds:new Set()});
    return {scale:s.view.scale,stroke:[...drawer.strokePaint.getColor()],strokeWidth:drawer.strokePaint.getStrokeWidth(),fontSize:r(95410).k_(),padding:layout.padding,metrics:layout.layout.getMetrics().slice(0,5).map(m=>({x:m.x,width:m.width}))};
  });
  assert.equal(metrics.root.size,native.fontSize);assert.equal(metrics.heading.size,2*native.fontSize);
  for(let i=0;i<5;i++){
    // Browser/CanvasKit shaping uses fractional advances; compare in world units.
    const text=metrics.texts[i],paint=native.metrics[i];
    assert(Math.abs((text.x-metrics.root.x)/native.scale-native.padding-paint.x)<2,'same heading/list text inset');
    assert(Math.abs(text.width/native.scale-paint.width)<1,'same heading/list text size');
  }
  await page.mouse.move(1100,850);
  const frame=await editor.locator('xpath=ancestor::*[contains(@class,"canvas-lexical-editor-container")]').boundingBox();
  const screenshot=await page.screenshot({path:path.join(data,'editing.png')}),pixels=await require('sharp')(screenshot).extract({left:Math.round(frame.x+frame.width/2),top:Math.round(frame.y)-2,width:3,height:7}).removeAlpha().raw().toBuffer();
  let black=0;for(let i=0;i<pixels.length;i+=3)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])<35)black++;
  assert(black>=6,'actual light-theme editing frame must render black');
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__inkbridgeIntegrated.flush());assert.deepEqual((await page.evaluate(()=>window.inkbridge.load())).contents,before.contents,'Opening and closing must not change documents');
  const joined=await page.evaluate(()=>window.inkbridge.load());assert.equal(joined.revision,before.revision,'viewing must not create a content revision');
  await page.mouse.dblclick(point.x,point.y);await expect(editor).toBeVisible();await editor.locator('li [data-lexical-text]').first().click();await page.keyboard.press('End');await page.keyboard.insertText('，中文保存');await page.keyboard.press('Control+s');await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
  const saved=await page.evaluate(()=>window.inkbridge.load());assert(JSON.stringify(saved.contents.find(c=>c.id==='a').document).includes('中文保存'));
  await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
  const reopened=await page.evaluate(()=>window.inkbridge.load());assert.deepEqual(reopened.contents,saved.contents);assert.equal(reopened.revision,saved.revision);
  await page.mouse.dblclick(point.x,point.y);await expect(page.locator('#board [contenteditable=true]').first()).toBeVisible();
  assert.equal(await page.locator('#board .PlaygroundEditorTheme__checklist').evaluate(e=>getComputedStyle(e).paddingLeft),'4px');
  assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
  console.log(JSON.stringify({data,checklistInset:true,textSizing:true,blackEditingBorder:true,noViewRevision:true,chineseSaveAndReopen:true}));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
