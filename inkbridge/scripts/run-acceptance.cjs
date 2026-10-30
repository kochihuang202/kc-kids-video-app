const { _electron }=require('@playwright/test');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const label=process.argv[2]||'current';const root=path.resolve(__dirname,'..'),data=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'inkbridge-lab-'));
 const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({args:[root],executablePath:require('electron'),env});
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>console.error('renderer',e.message));await page.waitForFunction(()=>window.__inkbridgeTest?.ready);
  const options=process.argv[3]==='dense-focus'?{counts:[500],scales:[.5],sizes:['dense'],samples:180}:process.argv[3]==='focus'?{counts:[500],scales:[.5],samples:180}:process.argv[3]==='sizes'?{counts:[500],scales:[.25,.5,1],sizes:['varied','dense'],samples:90}:process.argv[3]==='all-sizes'?{counts:[100,300,500],scales:[.25,.5,1],sizes:['varied','dense'],samples:90}:{};
  const report=await page.evaluate(options=>window.__inkbridgeTest.lab(options),options);
  report.label=label;report.sourceRevision=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  report.sourceHashes={};for(const file of ['src/core/canvas-engine.mjs','src/renderer/workspace.mjs','src/core/acceptance-lab.mjs'])report.sourceHashes[file]=require('node:crypto').createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
  const dir=path.join(root,'docs/benchmarks/m1-integration');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,label+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({label,cases:report.results.length,path:path.join(dir,label+'.json')}));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
