const {test,expect,_electron:electron}=require('@playwright/test');
const path=require('node:path');const fs=require('node:fs/promises');
let app,page;const errors=[];
test.beforeAll(async()=>{
  const root=path.resolve(__dirname,'../..');const data=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'inkbridge-desktop-'));
  const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({args:process.env.INKBRIDGE_PACKAGED_EXE?[]:[root],executablePath:process.env.INKBRIDGE_PACKAGED_EXE||require('electron'),env});page=await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>window.__inkbridgeTest?.ready||window.__inkbridgeFailure,{timeout:30000});
  expect(await page.evaluate(()=>window.__inkbridgeFailure)).toBeUndefined();
});
test.afterAll(async()=>{await app?.close();});
const inspect=()=>page.evaluate(()=>window.__inkbridgeTest.inspect());
test('actual Electron window uses CanvasKit WebGL and independent paths',async()=>{
  await expect(page).toHaveTitle('InkBridge 墨橋');await expect(page.locator('#loading')).toBeHidden();
  const state=await inspect();expect(state.stats.backend).toBe('CanvasKit WebGL');expect(state.stats.visible).toBeGreaterThan(0);
  const info=await page.evaluate(()=>window.__inkbridgeTest.info);expect(info.dataRoot).not.toMatch(/flexnote|onedrive/i);
  expect(await page.evaluate(()=>typeof window.require)).toBe('undefined');
});
test('add Chinese card through UI, select and drag, pan, then zoom about cursor',async()=>{
  await page.getByRole('button',{name:'新增卡片'}).click();await page.getByLabel('標題',{exact:true}).fill('獨立白板測試');
  await page.getByLabel('內容',{exact:true}).fill('自己的 CanvasEngine，自己的內容。');await page.getByRole('button',{name:'放上白板'}).click();
  await expect.poll(async()=>(await inspect()).stats.cacheBuilds).toBeGreaterThanOrEqual(7);
  let state=await inspect();expect(state.instances).toHaveLength(7);const item=state.instances.find(i=>i.id===state.selectedId);
  const bounds=await page.locator('#board').boundingBox();const start={x:bounds.x+state.view.x+(item.x+80)*state.view.zoom,y:bounds.y+state.view.y+(item.y+60)*state.view.zoom};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+95,start.y+55,{steps:12});await page.mouse.up();
  let changed=await inspect();expect(changed.instances.find(i=>i.id===item.id).x).toBeCloseTo(item.x+95/state.view.zoom,1);
  expect(changed.stats.cacheBuilds).toBe(state.stats.cacheBuilds);
  await page.keyboard.down('Space');await page.mouse.move(bounds.x+bounds.width-120,bounds.y+200);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width-40,bounds.y+240,{steps:10});await page.mouse.up();await page.keyboard.up('Space');
  const panned=await inspect();expect(panned.view.x).toBeCloseTo(changed.view.x+80,1);expect(panned.view.y).toBeCloseTo(changed.view.y+40,1);
  const anchor={x:Math.round(bounds.x+bounds.width*.6)-bounds.x,y:Math.round(bounds.y+bounds.height*.6)-bounds.y};const world={x:(anchor.x-panned.view.x)/panned.view.zoom,y:(anchor.y-panned.view.y)/panned.view.zoom};
  await page.mouse.move(bounds.x+anchor.x,bounds.y+anchor.y);await page.mouse.wheel(0,-250);
  await expect.poll(async()=>(await inspect()).view.zoom).toBeGreaterThan(panned.view.zoom);
  const zoomed=await inspect();expect((anchor.x-zoomed.view.x)/zoomed.view.zoom).toBeCloseTo(world.x,5);expect((anchor.y-zoomed.view.y)/zoomed.view.zoom).toBeCloseTo(world.y,5);
});
test('500-card culling, LOD and repeatable real frame measurements',async()=>{
  await page.locator('summary').click();await page.getByRole('button',{name:'500 張',exact:true}).click();
  await expect.poll(async()=>(await inspect()).stats.total).toBe(500);let state=await inspect();expect(state.stats.queried).toBeLessThan(500);
  for(let n=0;n<6;n++)await page.getByRole('button',{name:'縮小',exact:true}).click();
  await expect.poll(async()=>(await inspect()).stats.lod).toBe('low');
  for(let n=0;n<3;n++)await page.getByRole('button',{name:'縮小',exact:true}).click();
  await expect.poll(async()=>(await inspect()).stats.lod).toBe('skeleton');
  await page.locator('#zoom-reset').click();
  const report=await page.evaluate(()=>window.__inkbridgeTest.runBenchmark(60));expect(report.results).toHaveLength(36);
  for(const result of report.results){expect(result.cpuSubmitMs.samples).toBe(60);expect(result.frameIntervalMs.p95).toBeGreaterThan(0);expect(result.cacheSize).toBeLessThanOrEqual(256);}
  const artifacts=path.resolve(__dirname,'../../artifacts');await fs.mkdir(artifacts,{recursive:true});
  await fs.writeFile(path.join(artifacts,'benchmark.json'),JSON.stringify(report,null,2));
  await page.getByRole('button',{name:'示範',exact:true}).click();await page.locator('summary').click();await page.getByRole('button',{name:'顯示全部'}).click();
  await page.screenshot({path:path.join(artifacts,'inkbridge-desktop.png')});expect(errors).toEqual([]);
});
