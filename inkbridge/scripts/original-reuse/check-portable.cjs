const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),net=require('node:net');
const {spawn,execFileSync,spawnSync}=require('node:child_process');
const {hashFile}=require('../../src/main/workspace-snapshots.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const project=path.resolve(__dirname,'../..'),build=JSON.parse(await fs.readFile(path.join(project,'release/last-portable-build.json')));
  const test=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-portable-')),extraction=path.join(test,'解壓 測試');
  let directory=process.env.INKBRIDGE_PORTABLE_TEST_DIRECTORY;
  if(!directory){execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:INKBRIDGE_TEST_ZIP -DestinationPath $env:INKBRIDGE_TEST_OUTPUT'],{env:{...process.env,INKBRIDGE_TEST_ZIP:build.zip,INKBRIDGE_TEST_OUTPUT:extraction},windowsHide:true});directory=path.join(extraction,(await fs.readdir(extraction))[0]);}
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'portable-build.json')));
  for(const file of manifest.files)assert.equal(await hashFile(path.join(directory,file.path)),file.sha256,file.path);
  const local=path.join(test,'local-appdata');await fs.mkdir(local);
  const env={...process.env,LOCALAPPDATA:local,PATH:path.join(process.env.SystemRoot,'System32')+';'+process.env.SystemRoot};
  assert.notEqual(spawnSync('where.exe',['node'],{env,windowsHide:true}).status,0,'Node must be absent from launcher PATH');
  let child,browser,page,logs='';
  const launch=async()=>{
    const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
    const bat=path.join(directory,'Start-InkBridge.bat');
    child=spawn(process.env.ComSpec||'cmd.exe',['/d','/c','Start-InkBridge.bat',`--remote-debugging-port=${port}`],{cwd:directory,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
    const started=Date.now();let endpoint;
    while(Date.now()-started<45000){try{endpoint=(await(await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)})).json()).webSocketDebuggerUrl;if(endpoint)break;}catch{}await delay(150);}
    if(!endpoint)throw Error('Portable BAT failed to start CDP: '+logs);
    browser=await chromium.connectOverCDP(endpoint);page=browser.contexts()[0].pages()[0]||await browser.contexts()[0].waitForEvent('page');
    page.setDefaultTimeout(10000);await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready);
  };
  const close=async()=>{const exiting=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('BAT/Electron did not close: '+logs)),15000);child.once('exit',code=>{clearTimeout(timer);assert.equal(code,0);resolve();});});await page.evaluate(()=>window.close()).catch(()=>{});await exiting;await browser.close().catch(()=>{});};
  try{
    await launch();
    const info=await page.evaluate(()=>window.inkbridge.info());assert.equal(info.dataRoot,path.join(local,'InkBridge'));
    await assert.rejects(fs.stat(path.join(directory,'app/private-original-editor/profiles')));
    const editor=page.locator('#board [contenteditable=true]').first();
    const graph=await page.evaluate(()=>window.inkbridge.load());assert.ok(graph.contents.length,'brand-new app should initialize its own sample workspace');
    const board=await page.locator('#board').boundingBox();await page.mouse.dblclick(board.x+200,board.y+180);
    await expect(editor).toBeVisible();await editor.click();await page.keyboard.press('Control+a');await page.keyboard.insertText('可攜版沒有 Node 也能保存中文');await page.keyboard.press('Control+s');
    await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
    const saved=await page.evaluate(()=>window.inkbridge.load());assert.ok(saved.contents.some(c=>c.body.includes('可攜版沒有 Node 也能保存中文')));
    await page.getByRole('button',{name:'設定',exact:true}).click();await expect(page.locator('#exchange-directory')).toHaveValue('');
    await page.screenshot({path:path.join(test,'portable-settings.png')});await page.locator('#cancel-storage-settings').click();
    await close();const nextDirectory=directory+' 新版';await fs.rename(directory,nextDirectory);directory=nextDirectory;await launch();
    assert.ok((await page.evaluate(()=>window.inkbridge.load())).contents.some(c=>c.body.includes('可攜版沒有 Node 也能保存中文')));
    assert.deepEqual(await page.evaluate(()=>window.__inkbridgeIntegrated.errors),[]);
    await close();
    const result={zip:build.zip,sha256:await hashFile(build.zip),filesVerified:manifest.files.length,realBatWithoutNode:true,unicodeExtractionPath:true,localAppDataIsolated:true,noPreconfiguredExchange:true,nativeEditor:true,sqliteRestart:true,programFolderChanged:true,test};
    await fs.writeFile(path.join(project,'release/portable-test-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }catch(error){console.error(logs.slice(-3000));if(page)await page.screenshot({path:path.join(test,'failure.png')}).catch(()=>{});child?.stdin.write('\r\n');await browser?.close().catch(()=>{});child?.kill();throw error;}
})().catch(error=>{console.error(error);process.exitCode=1;});
