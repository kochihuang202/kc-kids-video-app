const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {publishUpdate,publishFullRelease}=require('../scripts/original-reuse/publish-update.cjs'),{createProgramUpdates,verifyEnvelope}=require('../src/main/program-updates.cjs'),{readZipEnvelope}=require('../src/main/release-zip.cjs'),{createZip}=require('../src/main/export-packages.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-zip-update-')),exchange=path.join(root,'exchange'),base=path.join(root,'base'),target=path.join(root,'target'),keys=crypto.generateKeyPairSync('rsa',{modulusLength:3072}),privateKey=path.join(root,'private.pem'),jwk=keys.publicKey.export({format:'jwk'}),pub={pem:keys.publicKey.export({type:'spki',format:'pem'}),modulus:Buffer.from(jwk.n,'base64url').toString('base64'),exponent:Buffer.from(jwk.e,'base64url').toString('base64')};
 await fs.writeFile(privateKey,keys.privateKey.export({type:'pkcs8',format:'pem'}));
 async function make(dir,version,sequence,old){
  const entries=[['app/a.js',old?'old':'new'],['app/src/main/publisher-public.json',JSON.stringify(pub)],['Start-InkBridge.bat','@echo off\r\npowershell.exe -NoProfile -NonInteractive -Command "@{ready=$true;buildId=$env:INKBRIDGE_EXPECTED_BUILD}|ConvertTo-Json|Set-Content -LiteralPath $env:INKBRIDGE_UPDATE_HEALTH_FILE -Encoding UTF8"\r\n'],...(old?[['app/obsolete.js','remove me']]:[['app/new.js','added']])],files=[];
  for(const [name,data]of entries){await fs.mkdir(path.dirname(path.join(dir,name)),{recursive:true});await fs.writeFile(path.join(dir,name),data);files.push({path:name,bytes:Buffer.byteLength(data),sha256:sha(data)});}
  const manifest={version,releaseSequence:sequence,buildId:sha(JSON.stringify(files)),files};await fs.writeFile(path.join(dir,'portable-build.json'),JSON.stringify(manifest));return manifest;
 }
 const a=await make(base,'0.1.0',1,true),b=await make(target,'9.0.0',30,false);return {root,exchange,base,target,a,b,privateKey,pub};
}
function client(f,prepareClose=()=>{throw Error('STAGED');}){return createProgramUpdates({installRoot:f.base,localDirectory:path.join(f.root,'local'),getExchange:()=>f.exchange,portable:true,notify:()=>{},queue:{run:(_name,fn)=>fn()},prepareClose,exit:()=>{throw Error('must not exit test');}});}
test('ZIP-only full fallback jumps an old build directly to newest, replaces only owned files and launches healthy',async()=>{
 const f=await fixture(),published=await publishFullRelease({...f,sequence:30,output:f.exchange});assert.deepEqual(await fs.readdir(f.exchange),[path.basename(published.zip)]);
 const envelope=await readZipEnvelope(published.zip);assert.equal(verifyEnvelope(envelope,f.pub).mode,'full');const updates=client(f),candidate=await updates.check();assert.equal(candidate.targetVersion,'9.0.0');assert.equal(candidate.mode,'full');
 await fs.mkdir(path.join(f.root,'local'),{recursive:true});await fs.writeFile(path.join(f.root,'local','notes.json'),'KEEP PRIVATE NOTES');
 await assert.rejects(updates.apply(candidate.releaseId),/STAGED/);
 const jobs=path.join(f.root,'local/Updater'),job=path.join(jobs,(await fs.readdir(jobs))[0]),planFile=path.join(job,'plan.json'),plan=JSON.parse(await fs.readFile(planFile));plan.parentPid=0;plan.healthTimeoutSeconds=4;await fs.writeFile(planFile,JSON.stringify(plan));
 const env={...process.env};delete env.PSModulePath;const run=promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(job,'helper.ps1'),'-PlanFile',planFile,'-Mode','Apply'],{env,windowsHide:true,timeout:30000});run.child.stdin.end();await run;
 assert.equal(await fs.readFile(path.join(f.base,'app/a.js'),'utf8'),'new');await assert.rejects(fs.access(path.join(f.base,'app/obsolete.js')));assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'portable-build.json'))).buildId,f.b.buildId);assert.equal(await fs.readFile(path.join(f.root,'local/notes.json'),'utf8'),'KEEP PRIVATE NOTES');assert.equal(JSON.parse(await fs.readFile(path.join(job,'result.json'))).success,true);await assert.rejects(fs.access(path.join(job,'backup')));
});
test('a direct delta is preferred over same-target full package, both with embedded signed envelopes only',async()=>{
 const f=await fixture(),full=await publishFullRelease({...f,sequence:30,output:f.exchange}),delta=await publishUpdate({...f,sequence:30,output:f.exchange,zipOnly:true});assert.equal((await fs.readdir(f.exchange)).filter(n=>!n.endsWith('.zip')).length,0);
 const updates=client(f),candidate=await updates.check();assert.equal(candidate.releaseId,delta.releaseId);assert.equal(candidate.mode,'delta');await assert.rejects(updates.apply(candidate.releaseId),/STAGED/);
 await fs.rename(delta.zip,delta.zip+'.offline');assert.equal((await updates.check()).releaseId,full.releaseId);
});
test('unsigned extra entries, corrupt content and duplicate envelopes do not become executable updates',async()=>{
 const f=await fixture(),full=await publishFullRelease({...f,sequence:30,output:f.exchange}),envelope=await readZipEnvelope(full.zip),descriptor=verifyEnvelope(envelope,f.pub),valid=[];
 for(const item of descriptor.files)valid.push({name:item.path,data:await fs.readFile(path.join(f.target,item.path))});
 await fs.writeFile(full.zip,createZip([{name:'release.json',data:JSON.stringify(envelope)},...valid,{name:'app/unsigned.js',data:'evil'}]));
 let updates=client(f),candidate=await updates.check();assert(candidate);await assert.rejects(updates.apply(candidate.releaseId),/Unexpected ZIP entry/);assert.equal(await fs.readFile(path.join(f.base,'app/a.js'),'utf8'),'old');
 await fs.writeFile(full.zip,createZip([{name:'release.json',data:JSON.stringify(envelope)},...valid.map(f=>f.name==='app/a.js'?{...f,data:'corrupt'}:f)]));updates=client(f);candidate=await updates.check();await assert.rejects(updates.apply(candidate.releaseId),/hash mismatch/);
 await fs.writeFile(full.zip,createZip([{name:'release.json',data:JSON.stringify(envelope)},{name:'release.json',data:JSON.stringify(envelope)},...valid]));await assert.rejects(readZipEnvelope(full.zip),/Duplicate/);assert.equal(await client(f).check(),null);
 const bad={...envelope,signature:Buffer.alloc(384).toString('base64')};await fs.writeFile(full.zip,createZip([{name:'release.json',data:JSON.stringify(bad)},...valid]));assert.equal(await client(f).check(),null);
 const linked=createZip([{name:'release.json',data:JSON.stringify(envelope)},...valid]);let off=0;while(off<linked.length-46){if(linked.readUInt32LE(off)===0x02014b50){linked.writeUInt32LE(0xa000<<16>>>0,off+38);break;}off++;}await fs.writeFile(full.zip,linked);await assert.rejects(readZipEnvelope(full.zip),/symlink/);
 await fs.writeFile(full.zip,linked.subarray(0,linked.length-15));assert.equal(await client(f).check(),null);
});
test('full update failed health restores the original build and owned deleted files',async()=>{
 const f=await fixture(),start=path.join(f.target,'Start-InkBridge.bat');await fs.writeFile(start,'@echo off\r\nexit /b 1\r\n');const manifest=JSON.parse(await fs.readFile(path.join(f.target,'portable-build.json'))),entry=manifest.files.find(f=>f.path==='Start-InkBridge.bat'),bytes=await fs.readFile(start);entry.sha256=sha(bytes);entry.bytes=bytes.length;manifest.buildId=sha(JSON.stringify(manifest.files));await fs.writeFile(path.join(f.target,'portable-build.json'),JSON.stringify(manifest));
 const published=await publishFullRelease({...f,sequence:30,output:f.exchange}),updates=client(f);await updates.check();await assert.rejects(updates.apply(published.releaseId),/STAGED/);
 const jobs=path.join(f.root,'local/Updater'),job=path.join(jobs,(await fs.readdir(jobs))[0]),planFile=path.join(job,'plan.json'),plan=JSON.parse(await fs.readFile(planFile));plan.parentPid=0;plan.healthTimeoutSeconds=1;await fs.writeFile(planFile,JSON.stringify(plan));
 const env={...process.env};delete env.PSModulePath;const run=promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(job,'helper.ps1'),'-PlanFile',planFile,'-Mode','Apply'],{env,windowsHide:true,timeout:30000});run.child.stdin.end();await assert.rejects(run);
 assert.equal(JSON.parse(await fs.readFile(path.join(f.base,'portable-build.json'))).buildId,f.a.buildId);assert.equal(await fs.readFile(path.join(f.base,'app/obsolete.js'),'utf8'),'remove me');assert.equal(JSON.parse(await fs.readFile(path.join(job,'result.json'))).success,false);
});
