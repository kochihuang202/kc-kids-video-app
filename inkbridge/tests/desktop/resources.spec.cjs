const {test,expect,_electron}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs/promises');
test('Skia exception paths, repeated resizes and dispose release owned WASM resources',async()=>{
  const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:await fs.mkdtemp(path.join(require('node:os').tmpdir(),'inkbridge-resources-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({args:[path.resolve(__dirname,'../..')],executablePath:require('electron'),env});
  try{
    const page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeTest?.ready);
    const result=await page.evaluate(()=>window.__inkbridgeTest.probeFailure());
    expect(result.error).toBe('Injected paragraph layout failure');expect(result.after.live).toEqual(result.before.live);
    for(let n=0;n<16;n++)await page.setViewportSize({width:1100+n%3*80,height:780+n%2*40});
    await expect.poll(()=>page.evaluate(()=>window.__inkbridgeTest.resources().live.Surface)).toBe(1);
    const resources=await page.evaluate(()=>window.__inkbridgeTest.resources());expect(resources.live.GrDirectContext).toBe(1);expect(resources.glContexts).toBe(1);
    const disposed=await page.evaluate(()=>window.__inkbridgeTest.dispose());expect(disposed.live).toEqual({});expect(disposed.glContexts).toBe(0);expect(disposed.errors).toEqual([]);
    expect(await page.evaluate(()=>window.__inkbridgeTest.dispose())).toEqual(disposed);
  }finally{await app.close();}
});
