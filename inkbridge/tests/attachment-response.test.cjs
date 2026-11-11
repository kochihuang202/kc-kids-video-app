const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {attachmentResponse}=require('../src/main/attachment-response.cjs'),{createAttachmentStore}=require('../src/main/attachment-store.cjs');
test('real PDF protocol streams full, bounded, suffix, HEAD and invalid ranges',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-pdf-response-')),store=createAttachmentStore(dir,()=>({})),bytes=require('./helpers/pdf-fixture.cjs')(3),item=store.prepare(bytes,'test.pdf'),url='flexnote://file/'+item.fileId;
 const read=(range,method='GET')=>attachmentResponse(new Request(url,{method,headers:range?{Range:range}:{}}),store);
 const whole=await read();assert.equal(whole.status,200);assert.deepEqual(Buffer.from(await whole.arrayBuffer()),bytes);
 const partial=await read('bytes=10-35');assert.equal(partial.status,206);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(10,36));assert.equal(partial.headers.get('content-range'),`bytes 10-35/${bytes.length}`);
 assert.deepEqual(Buffer.from(await (await read('bytes=-10')).arrayBuffer()),bytes.subarray(-10));assert.equal((await read('bytes=999999-')).status,416);assert.equal((await read('bytes=0-1,4-5')).status,416);assert.equal((await read(null,'HEAD')).body,null);
});
