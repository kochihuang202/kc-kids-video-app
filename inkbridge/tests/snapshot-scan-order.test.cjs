const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {hashFile}=require('../src/main/stream-files.cjs');
const {snapshotOrder}=require('../src/main/snapshot-order.cjs');
test('snapshot dates sort newest first with stable ties and invalid dates last',()=>{
 const row=(snapshotId,createdAt)=>({snapshotId,manifest:{createdAt}});
 assert.deepEqual([row('z','2026-11-03'),row('b','2026-11-16'),row('x','bad'),row('a','2026-11-16')].sort(snapshotOrder).map(r=>r.snapshotId),['a','b','z','x']);
});
test('hash validation retries a transient source fingerprint change but still hashes actual bytes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-hydration-')),file=path.join(root,'data');await fs.writeFile(file,'immutable');
 const original=fs.stat;let changes=0;fs.stat=async(...args)=>{const s=await original(...args);if(args[0]===file&&changes++===0)return Object.assign(s,{ctimeMs:s.ctimeMs+1});return s;};
 try{assert.equal(await hashFile(file),crypto.createHash('sha256').update('immutable').digest('hex'));assert(changes>=2);}finally{fs.stat=original;}
});
test('continually changing sources remain rejected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-unstable-')),file=path.join(root,'data');await fs.writeFile(file,'immutable');const original=fs.stat;
 fs.stat=async(...args)=>{const s=await original(...args);return args[0]===file?Object.assign(s,{ctimeMs:s.ctimeMs+1}):s;};
 try{await assert.rejects(hashFile(file),{code:'SOURCE_CHANGED'});}finally{fs.stat=original;}
});
