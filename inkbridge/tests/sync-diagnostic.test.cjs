const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
test('PowerShell sync diagnosis includes ancestry and missing files without note bodies or keys',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-diagnose-')),local=path.join(root,'local'),exchange=path.join(root,'exchange'),dir=path.join(exchange,'snapshots/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222');await fs.mkdir(path.join(local,'Profile'),{recursive:true});await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(local,'Profile/storage-settings.json'),JSON.stringify({exchangeDirectory:exchange}));
 await fs.writeFile(path.join(local,'Profile/share-device.json'),'SECRET_DEVICE_KEY');
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({workspaceId:'w',snapshotId:'s',parentSnapshotId:'p',summary:{title:'SECRET_NOTE_BODY'},database:{bytes:5},assets:[{objectPath:'assets/missing'}]}));
 await fs.writeFile(path.join(dir,'database.sqlite3'),'SECRET_DATABASE');
 const env={...process.env};delete env.PSModulePath;
 const run=promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve(__dirname,'../scripts/original-reuse/Diagnose-Sync.ps1'),'-LocalDirectory',local,'-OutputDirectory',root],{env,windowsHide:true,timeout:30000});run.child.stdin.end();await run;
 const name=(await fs.readdir(root)).find(n=>n.endsWith('.json')),text=await fs.readFile(path.join(root,name),'utf8'),report=JSON.parse(text.replace(/^\uFEFF/,''));assert(!text.includes('SECRET'));assert.equal(report.snapshots[0].parentSnapshotId,'p');assert.equal(report.snapshots[0].missingAssets,1);assert.equal(await fs.readFile(path.join(dir,'database.sqlite3'),'utf8'),'SECRET_DATABASE');
 await promisify(execFile)(process.execPath,[path.resolve(__dirname,'../scripts/original-reuse/sync-read-diagnostic.cjs')],{env:{...env,INKBRIDGE_DIAGNOSTIC_LOCAL:local,INKBRIDGE_DIAGNOSTIC_OUTPUT:root},windowsHide:true});
 const readName=(await fs.readdir(root)).find(n=>n.startsWith('InkBridge-sync-read-')),readText=await fs.readFile(path.join(root,readName),'utf8'),readReport=JSON.parse(readText);assert(!readText.includes('SECRET'));assert.equal(readReport.files[0].attempts[0].ok,false);
});
