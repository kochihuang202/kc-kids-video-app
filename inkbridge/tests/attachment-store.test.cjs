const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createAttachmentStore}=require('../src/main/attachment-store.cjs');
// Storage-unit fixture: decoder is an explicit test dependency. Real decoding
// and original CanvasKit/Lexical are verified in check-real-image-paste.cjs.
const bytes=Buffer.from('89504e470d0a1a0a00000000494e4b425249444745','hex');
test('CAS publishes once, preserves bytes, rejects corruption and accepts both original URL forms',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-cas-unit-')),store=createAttachmentStore(dir,()=>({width:320,height:240}));
 const one=store.prepare(bytes,'one.png'),target=path.join(dir,path.basename(one.fileRecord.filePath)),mtime=fs.statSync(target).mtimeMs;
 const two=store.prepare(bytes,'two.png');assert.equal(two.fileId,one.fileId);assert.equal(fs.readdirSync(dir).length,1);assert.equal(fs.statSync(target).mtimeMs,mtime);assert.deepEqual(fs.readFileSync(target),bytes);assert.equal(one.fileRecord.sha256,one.fileId);
 assert.deepEqual(store.readUrl('flexnote://file/'+one.fileId).bytes,bytes);assert.deepEqual(store.readUrl('flexnote://file/'+one.fileId+'.png').bytes,bytes);
 for(const url of ['flexnote://other/'+one.fileId,'flexnote://file/'+one.fileId+'.jpg','flexnote://file/../secret','flexnote://file/'+one.fileId+'?other=1'])assert.throws(()=>store.readUrl(url));
 fs.writeFileSync(target,Buffer.from('corrupted'));assert.throws(()=>store.prepare(bytes),/integrity/);assert.throws(()=>store.readUrl('flexnote://file/'+one.fileId),/integrity/);assert.equal(fs.readFileSync(target).toString(),'corrupted');
});
test('invalid bytes and decode failures never publish attachments',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-cas-invalid-')),store=createAttachmentStore(dir,()=>({width:0,height:0}));assert.throws(()=>store.prepare(Buffer.from('not image')),/format/);assert.throws(()=>store.prepare(bytes),/decoded/);assert.deepEqual(fs.readdirSync(dir),[]);
});
