// One targeted check of the actual BAT entry; data and debug port are temporary.
const {chromium}=require('@playwright/test'),{spawn}=require('node:child_process'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),net=require('node:net'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'../..'),data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-'));
  const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  const child=spawn(path.join(root,'Start-InkBridge.bat'),[],{shell:true,windowsHide:true,env:{...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data,INKBRIDGE_ORIGINAL_PROBE_DEBUG_PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('exit',code=>resolve(code)));let browser;
  try{
    const deadline=Date.now()+30000;while(!browser&&Date.now()<deadline){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});}catch{await new Promise(resolve=>setTimeout(resolve,200));}}
    assert(browser,'BAT did not open its Electron debugger');const page=browser.contexts()[0].pages()[0];
    await page.waitForFunction(()=>window.__inkbridgeIntegrated?.ready,{},{timeout:60000});
    const state=await page.evaluate(()=>window.__inkbridgeIntegrated.inspect()),box=await page.locator('#board').boundingBox(),node=state.nodes[0];
    await page.mouse.dblclick(box.x+state.view.translateX+(node.position.x+90)*state.view.scale,box.y+state.view.translateY+(node.position.y+90)*state.view.scale);
    const editor=page.locator('#board [contenteditable="true"]');await editor.waitFor();
    const info=await page.evaluate(()=>window.inkbridge.info());assert.equal(path.resolve(info.dataRoot),path.resolve(data));
    await editor.click();await editor.press('Control+End');await page.keyboard.insertText('BAT入口實測龍');await editor.press('Control+s');await page.evaluate(()=>window.__inkbridgeIntegrated.flush());
    const graph=await page.evaluate(()=>window.inkbridge.load());assert(graph.contents.some(content=>content.body.includes('BAT入口實測龍')));
    console.log(JSON.stringify({entry:'Start-InkBridge.bat',actualBatchLaunch:true,originalEditorVisible:true,sqliteCommitVerified:true,dataRoot:data}));
    await page.evaluate(()=>window.close()).catch(()=>{});let timer;
    try{const code=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('BAT did not finish after normal close')),15000);})]);assert.equal(code,0);}finally{clearTimeout(timer);}
  }finally{await browser?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
