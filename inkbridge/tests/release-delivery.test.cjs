const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createZip}=require('../src/main/export-packages.cjs'),{deliverRelease}=require('../scripts/original-reuse/deliver-release.cjs');
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
