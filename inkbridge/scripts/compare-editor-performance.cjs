// Same-host control and candidate runs. Never launches the formal FlexNote app.
const {_electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`${label}: test deadline exceeded; no performance result`)),30000);})]);}finally{clearTimeout(timer);}}
(async()=>{
  const control=path.resolve(process.argv[2]||'');
  if(!control.startsWith(path.join(root,'release')+path.sep)||path.basename(control)!=='InkBridge.exe')throw Error('Control must be a preserved InkBridge release');
  const report={createdAt:new Date().toISOString(),scope:'same-host standard scene; not FlexNote parity or physical IME validation',runs:[]};
  for(const [label,executable]of [['control',control],['candidate',null]]){
    const source=executable?path.join(path.dirname(executable),'resources/app'):root;
    const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-editor-perf-'))};delete env.ELECTRON_RUN_AS_NODE;
    const app=await _electron.launch({args:executable?[]:[root],executablePath:executable||require('electron'),env});
    try{
      const page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeTest?.ready);
      await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();window.focus();});
      console.log(JSON.stringify({label,phase:'500 dense / zoom and drag only'}));
      const runtimeError=new Promise((_,reject)=>page.once('pageerror',reject));
      const result=await bounded(Promise.race([page.evaluate(()=>window.__inkbridgeTest.lab({counts:[500],scales:[.5],sizes:['dense'],actions:['zoom','drag'],samples:90})),runtimeError]),label);
      result.label=label;result.sourceHashes={};
      for(const file of ['package.json','build/editor.mjs','src/core/note-layout.mjs','src/core/rich-document.mjs','src/core/canvas-engine.mjs','src/renderer/workspace.mjs'])result.sourceHashes[file]=hash(await fs.readFile(path.join(source,file)));
      report.runs.push(result);console.log(JSON.stringify({label,cases:result.results.length}));
    }finally{await app.close();}
  }
  const output=path.join(root,'docs/benchmarks/editor-rich-integration');await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({path:path.join(output,'comparison.json')}));
})().catch(error=>{console.error(error);process.exitCode=1;});
