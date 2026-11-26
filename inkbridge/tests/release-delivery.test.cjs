const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createZip}=require('../src/main/export-packages.cjs'),{deliverRelease}=require('../scripts/original-reuse/deliver-release.cjs');
const {deliverValidatedRelease}=require('../scripts/original-reuse/release-cleanup.cjs');
test('only verified latest full ZIP permits deleting old program packages; data and reports remain',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-delivery-')),exchange=path.join(root,'exchange');await fs.mkdir(exchange);
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072}),key={pem:pair.publicKey.export({type:'spki',format:'pem'})},release=path.join(root,'InkBridge-release-0.7.0-test.zip');
 const m={format:'inkbridge-update',version:2,mode:'full',releaseId:crypto.randomUUID(),sequence:20,baseBuildId:null,targetBuildId:'a'.repeat(64),targetVersion:'0.7.0',platform:'win32-x64',schemaVersion:1,files:[{path:'portable-build.json',sha256:crypto.createHash('sha256').update('{}').digest('hex'),bytes:2}]};
 const payload=Buffer.from(JSON.stringify(m)),envelope={payload:payload.toString('base64'),signature:crypto.sign('RSA-SHA256',payload,pair.privateKey).toString('base64')};
 await fs.writeFile(release,createZip([{name:'release.json',data:JSON.stringify(envelope)},{name:'portable-build.json',data:'{}'}]));
 const old='InkBridge-0.6.3-eec4dc1f77cf-f5eafd.zip';for(const name of [old,'Start-InkBridge-0.6.3.bat','InkBridge-sync-diagnostic-user.json','notes.zip'])await fs.writeFile(path.join(exchange,name),'keep or remove');
 await fs.mkdir(path.join(exchange,'snapshots'));await fs.writeFile(path.join(exchange,'snapshots/keep'),'data');
 await assert.rejects(deliverRelease({release,exchange,key:{pem:crypto.generateKeyPairSync('rsa',{modulusLength:3072}).publicKey.export({type:'spki',format:'pem'})}}));assert(await fs.stat(path.join(exchange,old)));
 const damaged=path.join(root,'InkBridge-release-0.7.0-damaged.zip');await fs.writeFile(damaged,createZip([{name:'release.json',data:JSON.stringify(envelope)},{name:'portable-build.json',data:'[]'}]));await assert.rejects(deliverRelease({release:damaged,exchange,key}),/hash mismatch/);assert(await fs.stat(path.join(exchange,old)),'bad payload must not permit cleanup');
 const result=await deliverRelease({release,exchange,key});assert(result.removed.includes(old));assert(result.removed.includes('Start-InkBridge-0.6.3.bat'));assert(await fs.stat(result.zip));assert.equal(await fs.readFile(path.join(exchange,'snapshots/keep'),'utf8'),'data');assert(await fs.stat(path.join(exchange,'InkBridge-sync-diagnostic-user.json')));assert(await fs.stat(path.join(exchange,'notes.zip')));
});

test('release acceptance gates cleanup and exact builds, scratch data, and updates are retained correctly',async(t)=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-release-cleanup-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const releaseRoot=path.join(root,'release'),temporaryRoot=path.join(root,'temp'),exchange=path.join(root,'onedrive');
 for(const directory of [releaseRoot,temporaryRoot,exchange])await fs.mkdir(directory);
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072}),key={pem:pair.publicKey.export({type:'spki',format:'pem'})};
 const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
 async function build(version,sequence,buildId){
  const directory=path.join(releaseRoot,`InkBridge-${version}-abcdef-1234`);
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory,'portable-build.json'),JSON.stringify({format:'inkbridge-private-portable',version,buildId,releaseSequence:sequence,files:[]}));
  return directory;
 }
 async function signed(file,version,sequence,targetBuildId,baseBuildId=null){
  const data=Buffer.from('{}'),mode=baseBuildId?'delta':'full',payload=Buffer.from(JSON.stringify({
   format:'inkbridge-update',version:2,mode,releaseId:crypto.randomUUID(),sequence,targetBuildId,baseBuildId,targetVersion:version,platform:'win32-x64',schemaVersion:1,
   files:[{path:'portable-build.json',sha256:hash(data),bytes:data.length,...(baseBuildId&&{oldSha256:null})}],
  }));
  const envelope={payload:payload.toString('base64'),signature:crypto.sign('RSA-SHA256',payload,pair.privateKey).toString('base64')};
  await fs.writeFile(file,createZip([{name:'release.json',data:JSON.stringify(envelope)},{name:'portable-build.json',data}]));
 }
 const ids=['1','2','3','4'].map(c=>c.repeat(64));
 const older=await build('0.9.1',31,ids[0]),base=await build('0.9.2',32,ids[1]),target=await build('0.9.3',33,ids[2]),unfamiliar=await build('0.9.0',30,ids[3]);
 await fs.writeFile(older+'.zip','previous full package');
 await fs.writeFile(older+'.zip.sha256',hash('previous full package'));
 await fs.writeFile(path.join(unfamiliar,'personal-file.txt'),'keep');
 const tested=await fs.mkdtemp(path.join(temporaryRoot,'inkbridge-update-acceptance-')),failed=await fs.mkdtemp(path.join(temporaryRoot,'inkbridge-update-acceptance-'));
 await fs.mkdir(path.join(tested,'Exchange'));
 await fs.mkdir(path.join(exchange,'snapshots'));
 await fs.writeFile(path.join(exchange,'snapshots','keep'),'notes');
 const release=path.join(releaseRoot,'InkBridge-release-0.9.3-test.zip'),oldFull=path.join(exchange,'InkBridge-release-0.9.2-old.zip'),oldDelta=path.join(exchange,'InkBridge-update-1111.zip');
 const deltaName='InkBridge-update-aaaa.zip',delta=path.join(tested,'Exchange',deltaName);
 await signed(release,'0.9.3',33,ids[2]);await signed(oldFull,'0.9.2',32,ids[1]);await signed(oldDelta,'0.9.2',32,ids[1],ids[0]);
 const acceptance={format:'inkbridge-release-acceptance',actualElectronUpdateButton:true,programRestartedHealthy:true,latestEditorTextPreserved:true,localSettingsPreserved:true,closedUpdatedWindowNormally:true,
  root:tested,baseDirectory:base,targetDirectory:target,baseBuildId:ids[1],targetBuildId:ids[2],deltaName};
 const arg={release,exchange,key,releaseRoot,temporaryRoot,deliver:deliverRelease};
 await assert.rejects(deliverValidatedRelease(arg));
 await fs.writeFile(path.join(releaseRoot,'program-update-acceptance.json'),JSON.stringify(acceptance));
 await fs.writeFile(path.join(tested,'release-acceptance.json'),JSON.stringify(acceptance));
 await signed(delta,'0.9.3',33,ids[2],ids[0]);
 await assert.rejects(deliverValidatedRelease(arg),/delta does not match/);
 for(const entry of [oldFull,oldDelta,older,tested])await fs.stat(entry);
 await signed(delta,'0.9.3',33,ids[2],ids[1]);
 const result=await deliverValidatedRelease(arg);
 assert(result.cleanup.skipped.some(entry=>entry.name===path.basename(unfamiliar)));
 for(const entry of [oldFull,oldDelta,older,older+'.zip',older+'.zip.sha256',tested])await assert.rejects(fs.stat(entry),{code:'ENOENT'});
 for(const entry of [base,target,failed,result.full.zip,result.delta.zip])await fs.stat(entry);
 const last=JSON.parse(await fs.readFile(path.join(releaseRoot,'last-portable-build.json'),'utf8'));
 assert.equal(last.directory,target);
 assert.equal(last.zip,result.full.zip);
 assert.equal(await fs.readFile(path.join(unfamiliar,'personal-file.txt'),'utf8'),'keep');
 assert.equal(await fs.readFile(path.join(exchange,'snapshots','keep'),'utf8'),'notes');
});
