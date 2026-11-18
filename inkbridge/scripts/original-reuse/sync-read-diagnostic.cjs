// Run only on request with the bundled Electron in Node mode. Output metadata
// and integrity results, never database rows, note bodies or credentials.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {scanFile}=require('../../src/main/stream-files.cjs');
const {isSnapshotAssetPath}=require('../../src/main/workspace-snapshots.cjs');
const read=async f=>{try{return JSON.parse(await fs.readFile(f,'utf8'));}catch{return null;}};
(async()=>{
 const local=process.env.INKBRIDGE_DIAGNOSTIC_LOCAL||path.join(process.env.LOCALAPPDATA,'InkBridge'),storage=await read(path.join(local,'Profile/storage-settings.json')),exchange=storage?.exchangeDirectory;
 const report={format:'inkbridge-sync-read-diagnostic',version:1,createdAt:new Date().toISOString(),computer:os.hostname(),localDirectory:local,exchange,localSummary:null,files:[],error:null};
 try{const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(path.join(local,'Workspace/inkbridge.sqlite3'),{readOnly:true});try{report.localSummary=Object.fromEntries(db.prepare("SELECT key,value FROM meta WHERE key IN ('workspaceId','revision')").all().map(r=>[r.key,r.value]));}finally{db.close();}}catch(e){report.databaseError=e.message;}
 const jobs=new Map();
 try{
  for(const w of await fs.readdir(path.join(exchange,'snapshots'),{withFileTypes:true})){
   if(!w.isDirectory()||!/^[a-f0-9-]{36}$/.test(w.name))continue;
   for(const s of await fs.readdir(path.join(exchange,'snapshots',w.name),{withFileTypes:true})){
    if(!s.isDirectory()||!/^[a-f0-9-]{36}$/.test(s.name))continue;
    const rel=`snapshots/${w.name}/${s.name}`,m=await read(path.join(exchange,rel,'manifest.json'));if(!m)continue;
    jobs.set(rel+'/database.sqlite3',m.database);
    for(const a of m.assets||[])if(isSnapshotAssetPath(a.objectPath))jobs.set(a.objectPath,a);
   }
  }
  for(const [relative,expected]of jobs){
   const item={relative,expectedBytes:expected?.bytes,attempts:[]};
   for(let n=0;n<2;n++){
    try{const actual=await scanFile(path.join(exchange,relative),{allowEmpty:expected?.bytes===0});item.attempts.push({ok:actual.sha256===expected?.sha256&&actual.bytes===expected?.bytes,bytes:actual.bytes,sha256:actual.sha256,fingerprint:actual.fingerprint});break;}
    catch(e){item.attempts.push({ok:false,error:e.message,code:e.code,before:e.before,after:e.after,current:e.current});}
   }
   report.files.push(item);
  }
 }catch(e){report.error=e.message;}
 const output=path.join(process.env.INKBRIDGE_DIAGNOSTIC_OUTPUT||__dirname,`InkBridge-sync-read-diagnostic-${Date.now()}.json`);await fs.writeFile(output,JSON.stringify(report,null,2));console.log(output);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
