// Filesystem/integrity integration, separate from the actual browser UI test.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {exportWebShare}=require('../src/main/web-share-export.cjs');
test('CAS corruption or missing bytes cannot publish a package or damage the previous export',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-web-export-integrity-')),graph=await require('./helpers/web-share-fixture.cjs')(workspace),projectDirectory=path.resolve(__dirname,'..'),outputDirectory=path.join(workspace,'exports');
 const legacy=graph.contents.find(c=>c.id==='grand-note');legacy.document=null;legacy.body='舊版純文字必須保留';
 const options={graph,rootBoardId:'root',workspaceDirectory:workspace,projectDirectory,outputDirectory};
 const good=await exportWebShare(options),previous=await fs.readFile(path.join(good.directory,'share.json'),'utf8');assert(previous.includes('舊版純文字必須保留'));assert(JSON.parse(previous).graph.contents.find(c=>c.id==='grand-note').document.root.children.length>0);
 const asset=graph.files[0],filename=path.join(workspace,asset.filePath),bytes=await fs.readFile(filename);await fs.writeFile(filename,Buffer.alloc(bytes.length,0));await assert.rejects(exportWebShare(options),/integrity failure/);
 assert.equal(await fs.readFile(path.join(good.directory,'share.json'),'utf8'),previous);await fs.unlink(filename);await assert.rejects(exportWebShare(options),/ENOENT/);
 assert.equal((await fs.readdir(outputDirectory)).filter(n=>!n.startsWith('.')).length,1);assert.equal(await fs.readFile(path.join(good.directory,'share.json'),'utf8'),previous);
 const manifest=JSON.parse(await fs.readFile(path.join(good.directory,'package-manifest.json')));assert(manifest.files.every(f=>f.bytes<=25*1024*1024));assert(!manifest.files.some(f=>/\.sqlite|\.db$|Profile|Session|source-modules|history/i.test(f.path)));
});
