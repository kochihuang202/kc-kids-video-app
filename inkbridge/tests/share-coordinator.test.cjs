const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createShareCredentials}=require('../src/main/share-credentials.cjs'),{createShareCoordinator}=require('../src/main/share-coordinator.cjs');
const token='isolated-test-device-key-'+crypto.randomBytes(20).toString('hex');
test('device authority is encrypted locally, never returned to renderer',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-device-'));const key=crypto.randomBytes(32);
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([c.update(s),c.final()]);return Buffer.concat([iv,c.getAuthTag(),encrypted]);},decryptString:b=>{const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString();}};
 const credentials=createShareCredentials({filename:path.join(dir,'device.json'),safeStorage});assert.equal((await credentials.status()).configured,false);
 await credentials.write({baseUrl:'https://example.pages.dev',readerBuild:'reader-v1',token});assert(!(await fs.readFile(path.join(dir,'device.json'),'utf8')).includes(token));assert(!(JSON.stringify(await credentials.status())).includes(token));assert.equal((await credentials.clientConfig()).token,token);
 await assert.rejects(credentials.write({baseUrl:'http://example.com',readerBuild:'r',token}),/HTTPS/);
});
test('capture completes before background conversion; retry uses captured graph and same request',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-coordinator-'));let revision=5,captures=0,publishing=0,fail=true;const seen=[];
 const credentials={status:async()=>({configured:true,baseUrl:'https://example.pages.dev',readerBuild:'r'}),clientConfig:async()=>({baseUrl:'https://example.pages.dev',readerBuild:'r',token})};
 const coordinator=createShareCoordinator({data:dir,project:dir,credentials,capture:async()=>{captures++;return {workspaceId:'workspace',revision};},load:async()=>({workspaceId:'workspace',revision}),exportPackage:async opts=>{seen.push(opts);revision=6;return {directory:dir};},clientFactory:()=>({publish:async opts=>{publishing++;assert.equal(opts.requestId,'request-one');if(fail)throw Error('offline');return {version:'v1',url:'https://example.pages.dev/s/pub/'};}})});
 await assert.rejects(coordinator.call({method:'publish',boardId:'root',requestId:'request-one',selectedBoardIds:['child']}),/offline/);assert.equal(captures,1);assert.equal(seen[0].graph.revision,5);assert.deepEqual(seen[0].selectedBoardIds,['root','child']);
 const pending=await coordinator.call({method:'jobs',boardId:'root'});assert.equal(pending[0].state,'interrupted');fail=false;
 const result=await coordinator.call({method:'resume',boardId:'root',requestId:'request-one'});assert.equal(result.localChanged,true);assert.equal(result.capturedRevision,5);assert.equal(captures,1);assert.equal(publishing,2);assert.equal(seen.length,1);
});
test('Electron 45 asynchronous decrypt result is unwrapped before creating an Authorization header',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-async-device-'));
 const safeStorage={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async value=>Buffer.from('encrypted:'+value),decryptStringAsync:async value=>({result:value.toString().slice(10),shouldReEncrypt:false})};
 const credentials=createShareCredentials({filename:path.join(dir,'device.json'),safeStorage});await credentials.write({baseUrl:'https://example.pages.dev',readerBuild:'r',token});assert.equal((await credentials.clientConfig()).token,token);
});
test('offline export works without device authority and defaults to root-only selection',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-offline-'));let options;
 const coordinator=createShareCoordinator({data:dir,project:dir,credentials:{status:async()=>({configured:false})},load:async()=>({}),capture:async()=>({revision:1}),exportPackage:async p=>{options=p;return {directory:dir};}});
 const result=await coordinator.call({method:'offline',boardId:'root'});assert.deepEqual(options.selectedBoardIds,['root']);assert.equal((await coordinator.call({method:'open',boardId:'root',exportId:result.exportId})).directory,dir);
 await assert.rejects(coordinator.call({method:'open',boardId:'root',exportId:'invalid'}),/不存在/);
});
