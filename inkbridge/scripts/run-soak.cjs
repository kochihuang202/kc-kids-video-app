const {_electron}=require('@playwright/test');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),seconds=Number(process.argv[2]||600),label=process.argv[3]||'soak',output=path.join(root,'artifacts/soak-progress.json');
 const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:await fs.mkdtemp(path.join(require('node:os').tmpdir(),'inkbridge-soak-'))};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({args:[root],executablePath:require('electron'),env});const report={label,started:new Date().toISOString(),requestedSeconds:seconds,samples:[]};
 report.sourceRevision=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.sourceHashes={};
 for(const file of ['src/core/canvas-engine.mjs','src/renderer/workspace.mjs','src/core/acceptance-lab.mjs'])report.sourceHashes[file]=require('node:crypto').createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex');
 try{
  const page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeTest?.ready);const cdp=await page.context().newCDPSession(page);const start=Date.now();
  while(Date.now()-start<seconds*1000){
   const cycle=await page.evaluate(()=>window.__inkbridgeTest.lab({counts:[500],sizes:['varied','dense'],scales:[.25,.5,1],samples:25}));
   const beforeGC=await page.evaluate(()=>window.inkbridge.info());await cdp.send('HeapProfiler.collectGarbage');
   const sample=await page.evaluate(async()=>({resources:window.__inkbridgeTest.resources(),runtime:await window.inkbridge.info()}));
   sample.elapsedSeconds=(Date.now()-start)/1000;sample.peakCaseCache=Math.max(...cycle.results.map(row=>row.cacheSize));sample.memoryBeforeGC=beforeGC.memory;sample.jsHeap=await cdp.send('Runtime.getHeapUsage');report.samples.push(sample);
   await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({elapsed:sample.elapsedSeconds,resources:sample.resources.live,wasm:sample.resources.wasmCapacityBytes,renderer:sample.runtime.memory.find(p=>p.type==='Tab')?.privateBytes}));
  }
  report.disposed=await page.evaluate(()=>window.__inkbridgeTest.dispose());report.completedSeconds=(Date.now()-start)/1000;
  await fs.writeFile(path.join(root,'docs/benchmarks/m1-integration',label+'.json'),JSON.stringify(report,null,2));
  if(Object.keys(report.disposed.live).length||report.disposed.glContexts)throw Error('Owned resources remain after dispose');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
