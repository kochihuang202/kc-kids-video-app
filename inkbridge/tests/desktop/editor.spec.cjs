const {test,expect,_electron}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const root=path.resolve(__dirname,'../..');let app,page,data;
async function start(){
  const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({args:process.env.INKBRIDGE_PACKAGED_EXE?[]:[root],executablePath:process.env.INKBRIDGE_PACKAGED_EXE||require('electron'),env});
  page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeTest?.ready);
}
test.beforeEach(async()=>{data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-editor-rebuild-'));await start();});
test.afterEach(async()=>{await app?.close();});
const editor=()=>page.getByRole('textbox',{name:'卡片富文本內容',exact:true});
async function openFirst(id='instance-0'){
  const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),item=state.instances.find(item=>item.id===id),box=await page.locator('#board').boundingBox();
  await page.mouse.click(box.x+state.view.x+(item.x+60)*state.view.zoom,box.y+state.view.y+(item.y+70)*state.view.zoom);
  await expect(editor()).toBeVisible();return item;
}
test('real Enter and Shift+Enter retain empty paragraphs and line breaks in Skia and saved AST',async()=>{
  const item=await openFirst();await editor().press('Control+a');await editor().press('Backspace');
  await editor().press('Enter');await page.keyboard.insertText('Alpha');await editor().press('Shift+Enter');await page.keyboard.insertText('Beta');
  await editor().press('Enter');await editor().press('Enter');await page.keyboard.insertText('Gamma');await editor().press('Enter');
  await page.evaluate(()=>window.__inkbridgeTest.flush());
  const captured=await page.evaluate(id=>window.__inkbridgeTest.captureText(id),item.id);
  expect(captured.text).toBe('\nAlpha\nBeta\n\nGamma\n');
  await editor().press('Escape');await expect(page.locator('#card-editor')).toBeHidden();
  const graph=await page.evaluate(()=>window.__inkbridgeTest.load()),doc=graph.contents.find(c=>c.id===item.contentId).document;
  expect(doc.root.children).toHaveLength(5);expect(doc.root.children[1].children.some(n=>n.type==='linebreak')).toBe(true);
});

test('bold mixed text shares DOM and Skia block bounds and remains stable through edit transitions',async()=>{
  const item=await openFirst();await editor().fill('中英文 mixed words 與表情 😀，連續輸入比較折行。再次加入中文測試與英文 wrapping words。');
  await editor().press('Control+a');await editor().press('Control+b');await page.evaluate(()=>window.__inkbridgeTest.flush());
  const layout=await page.evaluate(id=>window.__inkbridgeTest.captureText(id),item.id);
  const metrics=await editor().evaluate(element=>{const root=element.getBoundingClientRect();return [...element.children].map(child=>{const rect=child.getBoundingClientRect();return {top:rect.top-root.top,height:rect.height};});});
  expect(layout.blocks.length).toBe(metrics.length);
  for(let n=0;n<metrics.length;n++){expect(Math.abs(metrics[n].top-layout.blocks[n].top)).toBeLessThan(2);expect(Math.abs(metrics[n].height-layout.blocks[n].height)).toBeLessThan(2);}
  const before=(await page.evaluate(()=>window.__inkbridgeTest.inspect())).instances.find(i=>i.id===item.id).height;
  await editor().press('Escape');await openFirst();await page.evaluate(()=>window.__inkbridgeTest.flush());
  const after=(await page.evaluate(()=>window.__inkbridgeTest.inspect())).instances.find(i=>i.id===item.id).height;expect(after).toBe(before);
  await fs.mkdir(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts/inkbridge-editor-rebuilt.png')});
});
test('35 real paragraphs stay inside an auto-height editor without hidden internal scrolling',async()=>{
  await openFirst();await editor().press('Control+a');await editor().press('Backspace');
  for(let n=0;n<35;n++){if(n)await editor().press('Enter');await page.keyboard.insertText(`第${n+1}段文字龍`);}
  await page.evaluate(()=>window.__inkbridgeTest.flush());
  const metrics=await editor().evaluate(element=>({scroll:element.scrollHeight,height:element.clientHeight,top:element.scrollTop,wrapTop:element.closest('.canvas-wrap').scrollTop}));
  expect(metrics.top).toBe(0);expect(metrics.scroll).toBeLessThanOrEqual(metrics.height+1);expect(metrics.wrapTop).toBe(0);
  const before=(await page.evaluate(()=>window.__inkbridgeTest.inspect())).instances[0].height;
  await editor().press('Control+a');await page.keyboard.insertText('刪減後');await page.evaluate(()=>window.__inkbridgeTest.flush());
  const after=(await page.evaluate(()=>window.__inkbridgeTest.inspect())).instances[0].height;expect(after).toBeLessThan(before);
});
test('clicking a rendered character restores its caret position at different zoom levels',async()=>{
  // The second card stays clear of the fixed canvas navigation toolbar at 150%.
  const item=await openFirst('instance-1');await editor().fill('ABCDEFGHIJKLMN');await page.evaluate(()=>window.__inkbridgeTest.flush());
  for(const zoom of [.5,1,1.5]){
    await page.evaluate(value=>window.__inkbridgeTest.setZoom(value),zoom);
    await expect.poll(async()=>{const box=await page.locator('#card-editor').boundingBox();return box?.width/item.width;}).toBeCloseTo(zoom,2);
    const target=await editor().evaluate(element=>{
      const node=element.querySelector('[data-lexical-text]')?.firstChild;const range=document.createRange();range.setStart(node,5);range.setEnd(node,6);const rect=range.getBoundingClientRect();
      return {x:rect.x+rect.width*.1,y:rect.y+rect.height*.5};
    });
    await editor().press('Escape');await expect(page.locator('#card-editor')).toBeHidden();
    await page.mouse.click(target.x,target.y);await expect(editor()).toBeVisible();
    await expect.poll(()=>editor().evaluate(element=>{const s=getSelection();return element.contains(s.anchorNode)?s.anchorOffset:-1;})).toBe(5);
    const selection=await editor().evaluate(element=>{const s=getSelection();return {offset:s.anchorOffset,text:s.anchorNode?.textContent,inEditor:element.contains(s.anchorNode)};});
    expect(selection.inEditor).toBe(true);expect(selection.text).toBe('ABCDEFGHIJKLMN');expect(selection.offset).toBe(5);
    await page.keyboard.insertText('x');await page.evaluate(()=>window.__inkbridgeTest.flush());
    const graph=await page.evaluate(()=>window.__inkbridgeTest.load());expect(graph.contents.find(content=>content.id===item.contentId).body).toBe('ABCDExFGHIJKLMN');
    await editor().fill('ABCDEFGHIJKLMN');await page.evaluate(()=>window.__inkbridgeTest.flush());
  }
});

test('an unsupported persisted node is retained and cannot silently become an empty editor',async()=>{
  const document={root:{type:'root',version:1,children:[{type:'future-ink-node',version:1,children:[{type:'text',version:1,text:'保留原始內容',format:0,style:'',detail:0,mode:'normal'}]}],direction:null,format:'',indent:0}};
  const result=await page.evaluate(async document=>{
    const graph=await window.__inkbridgeTest.load(),content=graph.contents.find(c=>c.id==='content-0');
    return window.inkbridge.commit({requestId:crypto.randomUUID(),baseRevision:graph.revision,operations:[{type:'putContent',data:{id:content.id,title:'保留原始內容',body:'保留原始內容',kind:'text',tone:content.tone,document}}]});
  },document);expect(result.ok).toBe(true);
  const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;await start();
  const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),item=state.instances[0],box=await page.locator('#board').boundingBox();
  await page.mouse.click(box.x+state.view.x+(item.x+70)*state.view.zoom,box.y+state.view.y+(item.y+70)*state.view.zoom);
  await expect(page.locator('#persistence-status')).toContainText('尚未支援');await expect(page.locator('#card-editor')).toBeHidden();
  const graph=await page.evaluate(()=>window.__inkbridgeTest.load());expect(graph.contents.find(c=>c.id==='content-0').document).toEqual(document);
  await openFirst('instance-1');await editor().fill('其他卡片仍能正常保存');await page.evaluate(()=>window.__inkbridgeTest.flush());
});

test('an expanded active note paints its paper above overlapping cards',async()=>{
  const item=await openFirst();await editor().press('Control+a');await editor().press('Backspace');await page.keyboard.insertText('重製編輯器');
  for(let n=0;n<12;n++){await editor().press('Enter');await page.keyboard.insertText(`第${n+1}段：換行與保存。`);}
  await page.evaluate(()=>window.__inkbridgeTest.flush());
  const state=await page.evaluate(()=>window.__inkbridgeTest.inspect());expect(state.instances.find(i=>i.id===item.id).height).toBeGreaterThan(350);
  const pixel=await page.evaluate(()=>window.__inkbridgeTest.pixelAtWorld({x:130,y:330}));
  expect(pixel.slice(0,3)).toEqual([255,254,251]);
  await page.screenshot({path:path.join(root,'artifacts/inkbridge-editor-rebuilt.png')});
});
