const { _electron }=require('@playwright/test');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const label=process.argv[2]||'current';const root=path.resolve(__dirname,'..'),data=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'inkbridge-lab-'));
 const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({args:[root],executablePath:require('electron'),env});
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>console.error('renderer',e.message));await page.waitForFunction(()=>window.__inkbridgeTest?.ready);
  const options=process.argv[3]==='focus'?{counts:[500],scales:[.5],samples:180}:process.argv[3]==='sizes'?{counts:[500],scales:[.25,.5,1],sizes:['varied','dense'],samples:90}:{};
  const report=await page.evaluate(options=>window.__inkbridgeTest.lab(options),options);
  const dir=path.join(root,'docs/benchmarks/m1-integration');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,label+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({label,cases:report.results.length,path:path.join(dir,label+'.json')}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
