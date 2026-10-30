const {test,expect,_electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const project=path.resolve(__dirname,'../..');
async function launch(data,extraEnv={}){
  const env={...process.env,...extraEnv,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({args:process.env.INKBRIDGE_PACKAGED_EXE?[]:[project],executablePath:process.env.INKBRIDGE_PACKAGED_EXE||require('electron'),env});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeTest?.ready||window.__inkbridgeFailure);
  expect(await page.evaluate(()=>window.__inkbridgeFailure)).toBeUndefined();return {app,page};
}
async function clickInstance(page,id){
  const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),item=state.instances.find(i=>i.id===id),box=await page.locator('#board').boundingBox();
  await page.mouse.click(box.x+state.view.x+(item.x+70)*state.view.zoom,box.y+state.view.y+(item.y+45)*state.view.zoom);
  await expect(page.locator('#card-editor')).toBeVisible();
  await expect.poll(async()=>{const overlay=await page.locator('#card-editor').boundingBox();return overlay?overlay.x-box.x:NaN;}).toBeCloseTo(state.view.x+item.x*state.view.zoom,0);
}
test('Lexical rich text commits latest Chinese character, normal close flushes, and restart preserves JSON',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-restart-'));let running=await launch(data);
  try{
    const {page,app}=running;
    await page.getByRole('button',{name:'新增卡片'}).click();await page.getByLabel('標題',{exact:true}).fill('M2 持久化卡片');
    await page.getByLabel('內容',{exact:true}).fill('初始內容');await page.getByRole('button',{name:'放上白板'}).click();
    await page.evaluate(()=>window.__inkbridgeTest.flush());
    const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),item=state.instances.find(i=>i.id===state.selectedId);
    await clickInstance(page,item.id);const editor=page.getByRole('textbox',{name:'卡片富文本內容',exact:true});
    await editor.fill('第一段中文\n可保存的富文本');await editor.press('Control+a');await page.getByRole('button',{name:'粗體',exact:true}).click();
    await editor.press('Control+End');await page.keyboard.insertText('最後一字龍');await editor.press('Control+s');
    const ack=await page.evaluate(()=>window.__inkbridgeTest.flush());expect(ack.revision).toBeGreaterThan(1);
    const info=await page.evaluate(()=>window.__inkbridgeTest.info);
    const read=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'../helpers/read-sqlite.cjs'),info.databasePath,item.contentId],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:''}});
    expect(read.status,read.stderr).toBe(0);const row=JSON.parse(read.stdout);
    expect(row.body).toContain('最後一字龍');expect(JSON.parse(row.document_json).root.children.flatMap(p=>p.children).some(t=>(t.format&1)===1)).toBe(true);
    await editor.press('End');await editor.press('Enter');await page.keyboard.insertText('可復原段落');const beforeUndo=await editor.textContent();
    await page.getByRole('button',{name:'復原',exact:true}).click();await expect.poll(()=>editor.textContent()).not.toBe(beforeUndo);
    await page.getByRole('button',{name:'重做',exact:true}).click();await expect.poll(()=>editor.textContent()).toBe(beforeUndo);
    await editor.press('Control+End');await page.keyboard.insertText('關閉前最後字鳳');
    const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;running=null;
    running=await launch(data);const graph=await running.page.evaluate(()=>window.__inkbridgeTest.load()),stored=graph.contents.find(c=>c.id===item.contentId);
    expect(stored.body).toContain('最後一字龍');expect(stored.body).toContain('關閉前最後字鳳');expect(stored.document.root.type).toBe('root');
    expect(graph.instances.find(i=>i.id===item.id).contentId).toBe(item.contentId);
    await clickInstance(running.page,item.id);await expect(running.page.locator('#rich-editor')).toContainText('關閉前最後字鳳');
    expect(await running.page.locator('#rich-editor .editor-bold').count()).toBeGreaterThan(0);
    await fs.mkdir(path.join(project,'artifacts'),{recursive:true});await running.page.screenshot({path:path.join(project,'artifacts/inkbridge-m2.png')});
  }finally{await running?.app.close();}
});
test('Chromium IME composition blocks a save ACK until composition commits',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-ime-'));const {app,page}=await launch(data);
  try{
    await clickInstance(page,'instance-0');const editor=page.getByRole('textbox',{name:'卡片富文本內容',exact:true});await editor.fill('組字前');await editor.press('Control+End');
    await page.evaluate(()=>window.__inkbridgeTest.flush());const before=await page.evaluate(()=>window.__inkbridgeTest.persistence().revision);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition',{text:'注音組字',selectionStart:0,selectionEnd:4});
    await page.evaluate(()=>{window.__saveProbe={done:false};window.__inkbridgeTest.flush().then(ack=>{window.__saveProbe={done:true,ack};});});
    expect(await page.evaluate(()=>window.__saveProbe.done)).toBe(false);
    expect((await page.evaluate(()=>window.__inkbridgeTest.load())).revision).toBe(before);
    await cdp.send('Input.insertText',{text:'中文輸入完成龍'});
    await expect.poll(()=>page.evaluate(()=>window.__saveProbe.done)).toBe(true);
    const stored=await page.evaluate(()=>window.__inkbridgeTest.load());expect(stored.contents.find(c=>c.id==='content-0').body).toContain('中文輸入完成龍');
    expect(stored.revision).toBeGreaterThan(before);
  }finally{await app.close();}
});
test('pressure scenes are separate from the persisted workspace',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-scratch-'));const {app,page}=await launch(data);
  try{
    const initial=await page.evaluate(()=>window.__inkbridgeTest.load());await page.locator('summary').click();await page.getByRole('button',{name:'500 張',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__inkbridgeTest.inspect().stats.total)).toBe(500);
    const after=await page.evaluate(()=>window.__inkbridgeTest.load());expect(after).toEqual(initial);
    await page.getByRole('button',{name:'回到我的白板',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__inkbridgeTest.inspect().stats.total)).toBe(initial.instances.length);
  }finally{await app.close();}
});
test('switching cards while a real commit ACK is delayed keeps the latest editor and draft',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-switch-'));const {app,page}=await launch(data);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await clickInstance(page,'instance-0');await page.evaluate(()=>window.__inkbridgeTest.setAckDelay(250));
    await page.getByRole('textbox',{name:'卡片富文本內容',exact:true}).fill('切換時必須保存的文字龍');
    await clickInstance(page,'instance-1');
    await expect(page.getByLabel('編輯卡片標題',{exact:true})).toHaveValue('留一點空白');
    await expect(page.locator('#persistence-status')).not.toContainText('Cannot read');
    const graph=await page.evaluate(()=>window.__inkbridgeTest.load());expect(graph.contents.find(c=>c.id==='content-0').body).toContain('文字龍');expect(errors).toEqual([]);
  }finally{await app.close();}
});
test('editor overlay accurately tracks card bounds at 50%, 100%, and 150% zoom',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-zoom-'));const {app,page}=await launch(data);
  try{
    const cardId='instance-0';await clickInstance(page,cardId);
    await expect(page.locator('#card-editor')).toBeVisible();
    const box=await page.locator('#board').boundingBox();
    for(const targetZoom of [0.5,1.0,1.5]){
      await page.evaluate(z=>window.__inkbridgeTest.setZoom(z),targetZoom);
      await expect.poll(async()=>(await page.evaluate(()=>window.__inkbridgeTest.inspect())).view.zoom).toBeCloseTo(targetZoom,2);
      const state=await page.evaluate(()=>window.__inkbridgeTest.inspect());
      const item=state.instances.find(i=>i.id===cardId);
      const expectedX=state.view.x+item.x*state.view.zoom;
      const expectedY=state.view.y+item.y*state.view.zoom;
      const expectedWidth=item.width*state.view.zoom;
      await expect.poll(async()=>{const overlay=await page.locator('#card-editor').boundingBox();return overlay?overlay.x-box.x:NaN;}).toBeCloseTo(expectedX,0);
      await expect.poll(async()=>{const overlay=await page.locator('#card-editor').boundingBox();return overlay?overlay.y-box.y:NaN;}).toBeCloseTo(expectedY,0);
      const overlay=await page.locator('#card-editor').boundingBox();
      expect(overlay.width).toBeCloseTo(expectedWidth,0);
    }
  }finally{await app.close();}
});

test('a newly created long card keeps the same geometry in Canvas, SQLite, and after restart',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-long-card-'));let running=await launch(data);
  try{
    const {page}=running;await page.getByRole('button',{name:'新增卡片'}).click();
    await page.getByLabel('標題',{exact:true}).fill('長文字幾何回歸');
    await page.getByLabel('內容',{exact:true}).fill(Array.from({length:40},(_,n)=>`第 ${n+1} 行，完整保存龍`).join('\n'));
    await page.getByRole('button',{name:'放上白板'}).click();
    await page.evaluate(()=>window.__inkbridgeTest.flush());
    const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),item=state.instances.find(i=>i.id===state.selectedId);
    expect(item.height).toBeGreaterThan(512);
    const graph=await page.evaluate(()=>window.__inkbridgeTest.load());expect(graph.instances.find(i=>i.id===item.id).height).toBe(item.height);
    // Replaying pictures and changing LOD must not mutate the document geometry.
    for(const zoom of [.5,1,1.5,1])await page.evaluate(z=>window.__inkbridgeTest.setZoom(z),zoom);
    expect((await page.evaluate(()=>window.__inkbridgeTest.inspect())).instances.find(i=>i.id===item.id).height).toBe(item.height);
    const closed=running.app.waitForEvent('close');await running.app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;running=null;
    running=await launch(data);
    const restored=await running.page.evaluate(()=>window.__inkbridgeTest.inspect());expect(restored.instances.find(i=>i.id===item.id).height).toBe(item.height);
  }finally{await running?.app.close();}
});

test('a timed-out close returns an editable window and ignores a late close ACK',async()=>{
  const data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-close-timeout-'));
  const {app,page}=await launch(data,{INKBRIDGE_TEST_CLOSE_TIMEOUT_MS:'100'});
  try{
    await app.evaluate(({dialog})=>{dialog.showErrorBox=(title,message)=>{globalThis.__closeError={title,message};};});
    await clickInstance(page,'instance-0');const editor=page.getByRole('textbox',{name:'卡片富文本內容',exact:true});
    await page.evaluate(()=>window.__inkbridgeTest.setAckDelay(500));await editor.fill('關閉前文字龍');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
    await expect.poll(()=>app.evaluate(()=>globalThis.__closeError?.message)).toContain('未能取得');
    await expect(editor).toBeEditable();
    await editor.fill('逾時後仍能繼續保存鳳');await page.evaluate(()=>window.__inkbridgeTest.flush());
    const graph=await page.evaluate(()=>window.__inkbridgeTest.load());expect(graph.contents.find(c=>c.id==='content-0').body).toBe('逾時後仍能繼續保存鳳');
    expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length)).toBe(1);
  }finally{
    // This failure-path fixture deliberately shortens close timeout. Never let
    // teardown itself wait for the timeout protocol under test (temporary data).
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy()));await app.close();
  }
});
