const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const exec=promisify(execFile),{publishUpdate}=require('../scripts/original-reuse/publish-update.cjs'),{verifyEnvelope,safePath,createProgramUpdates}=require('../src/main/program-updates.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('signed delta stages/applies real PowerShell, verifies health and rolls back failed launch',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-updater-')),output=path.join(root,'exchange'),base=path.join(root,'installed'),target=path.join(root,'target'),keys=crypto.generateKeyPairSync('rsa',{modulusLength:3072});
  const privateKey=path.join(root,'private.pem');await fs.writeFile(privateKey,keys.privateKey.export({type:'pkcs8',format:'pem'}));const jwk=keys.publicKey.export({format:'jwk'}),pub={pem:keys.publicKey.export({type:'spki',format:'pem'}),modulus:Buffer.from(jwk.n,'base64url').toString('base64'),exponent:Buffer.from(jwk.e,'base64url').toString('base64')};
  for(const dir of [base,target])await fs.mkdir(path.join(dir,'app'),{recursive:true});
  async function make(dir,body,buildId){await fs.writeFile(path.join(dir,'app/a.js'),body);await fs.writeFile(path.join(dir,'portable-build.json'),JSON.stringify({buildId,releaseSequence:body==='new'?2:1,version:'0.5.0',files:[{path:'app/a.js',sha256:sha(body)}]}));
    await fs.writeFile(path.join(dir,'Start-InkBridge.bat'),'@echo off\r\nif exist fail-health exit /b 1\r\npowershell.exe -NoProfile -NonInteractive -Command "@{ready=$true;buildId=$env:INKBRIDGE_EXPECTED_BUILD}|ConvertTo-Json|Set-Content -LiteralPath $env:INKBRIDGE_UPDATE_HEALTH_FILE -Encoding UTF8"\r\n');}
  await make(base,'old','1'.repeat(64));await make(target,'new','2'.repeat(64));
  const published=await publishUpdate({base,target,output,privateKey,sequence:2}),envelope=JSON.parse(await fs.readFile(path.join(output,`InkBridge-update-${published.releaseId}.json`)));
  assert.equal(verifyEnvelope(envelope,pub).files.length,2);assert.throws(()=>verifyEnvelope({...envelope,payload:Buffer.from('{}').toString('base64')},pub),/簽章/);
  await fs.mkdir(path.join(base,'app/src/main'),{recursive:true});await fs.writeFile(path.join(base,'app/src/main/publisher-public.json'),JSON.stringify(pub));
  const notices=[],updates=createProgramUpdates({installRoot:base,localDirectory:path.join(root,'local'),getExchange:()=>output,portable:true,notify:v=>notices.push(v),queue:{run:(_n,f)=>f()},prepareClose:()=>{throw Error('must not close before valid staging');},exit:()=>{throw Error('must not exit');}});
  assert.equal((await updates.check()).releaseId,published.releaseId);
  await fs.rename(published.zip,published.zip+'.pending');assert.equal((await updates.check()).incomplete,true);await fs.rename(published.zip+'.pending',published.zip);
  const old=await fs.readFile(path.join(base,'app/a.js'));await fs.writeFile(path.join(base,'app/a.js'),'unexpected local program change');
  const firstApply=updates.apply(published.releaseId);assert.equal(updates.apply(published.releaseId),firstApply,'duplicate clicks share one operation');await assert.rejects(firstApply,/基底/);await fs.writeFile(path.join(base,'app/a.js'),old);
  for(const bad of ['../a','app/../../a','app/C:/a','app/a\\b','app/Profile/x','app/CON.txt','runtime/a.','C:/root'])assert.throws(()=>safePath(bad));
  async function runJob(fail,locked=false){const job=path.join(root,crypto.randomUUID());await fs.mkdir(job);await fs.copyFile(published.zip,path.join(job,'package.zip'));await fs.writeFile(path.join(job,'envelope.json'),JSON.stringify(envelope));await fs.writeFile(path.join(job,'public.json'),JSON.stringify(pub));await fs.copyFile(path.resolve(__dirname,'../src/main/update-helper.ps1'),path.join(job,'helper.ps1'));
    const plan={installRoot:base,jobDirectory:job,zip:path.join(job,'package.zip'),parentPid:0,baseBuildId:'1'.repeat(64),targetBuildId:'2'.repeat(64),healthFile:path.join(job,'health.json'),healthTimeoutSeconds:2};await fs.writeFile(path.join(job,'plan.json'),JSON.stringify(plan));
    const run=mode=>{const env={...process.env};delete env.PSModulePath;const operation=exec('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(job,'helper.ps1'),'-PlanFile',path.join(job,'plan.json'),'-Mode',mode],{windowsHide:true,timeout:30000,env});operation.child.stdin.end();return operation;};
    await run('Stage');if(fail)await fs.writeFile(path.join(base,'fail-health'),'x');
    let locker;const release=path.join(job,'unlock'),ready=path.join(job,'locked');
    if(locked){const env={...process.env,INKBRIDGE_LOCK_FILE:path.join(base,'app/a.js'),INKBRIDGE_LOCK_READY:ready,INKBRIDGE_LOCK_RELEASE:release};delete env.PSModulePath;locker=exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$s=[IO.File]::Open($env:INKBRIDGE_LOCK_FILE,'Open','ReadWrite','None');try{[IO.File]::WriteAllText($env:INKBRIDGE_LOCK_READY,'ready');while(-not [IO.File]::Exists($env:INKBRIDGE_LOCK_RELEASE)){Start-Sleep -Milliseconds 50}}finally{$s.Dispose()}"],{env,windowsHide:true});locker.child.stdin.end();const deadline=Date.now()+15000;while(!await fs.stat(ready).catch(()=>false)){if(Date.now()>deadline)throw Error('file locker failed');await new Promise(r=>setTimeout(r,50));}}
    try{if(fail||locked)await assert.rejects(run('Apply'));else await run('Apply');}finally{if(locker){await fs.writeFile(release,'release');await locker;}}
    const result=JSON.parse(await fs.readFile(path.join(job,'result.json')));assert.equal(result.success,!fail&&!locked);return job;
  }
  await runJob(false);assert.equal(await fs.readFile(path.join(base,'app/a.js'),'utf8'),'new');
  await make(base,'old','1'.repeat(64));await runJob(false,true);assert.equal(await fs.readFile(path.join(base,'app/a.js'),'utf8'),'old');
  await make(base,'old','1'.repeat(64));await runJob(true);assert.equal(await fs.readFile(path.join(base,'app/a.js'),'utf8'),'old');
});
