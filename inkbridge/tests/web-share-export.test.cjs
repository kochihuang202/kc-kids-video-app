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

test('cloud content package preserves sources, reuses derivatives and streams PDF above Pages static limit',async()=>{
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-content-')),graph=await require('./helpers/web-share-fixture.cjs')(workspace),projectDirectory=path.resolve(__dirname,'..'),outputDirectory=path.join(workspace,'exports');
 const source=graph.files[0],sourceBytes=await fs.readFile(path.join(workspace,source.filePath));
 const large=path.join(workspace,'large.pdf');await require('./helpers/large-pdf-fixture.cjs')(large,65*1024*1024);
 const {scanFile}=require('../src/main/stream-files.cjs'),info=await scanFile(large),filePath='files/'+info.sha256+'.pdf';await fs.rename(large,path.join(workspace,filePath));
 graph.files.push({id:info.sha256,name:'large.pdf',size:info.bytes,sha256:info.sha256,filePath,type:'pdf',metadata:'{}'});graph.cardMetadata.find(c=>c.id==='pdf').fileId=info.sha256;
 const options={graph,rootBoardId:'root',selectedBoardIds:['root'],workspaceDirectory:workspace,projectDirectory,outputDirectory,contentOnly:true,readerBuild:'fixture-reader',capturedAt:'2026-11-12T00:00:00.000Z',revision:34};
 const first=await exportWebShare(options),publication=JSON.parse(await fs.readFile(path.join(first.directory,'share.json'))),manifest=JSON.parse(await fs.readFile(path.join(first.directory,'package-manifest.json')));
 assert.deepEqual(publication.boardIds,['root']);assert.equal(publication.capturedAt,options.capturedAt);assert.equal(publication.revision,34);assert.equal(publication.graph.whiteboardInstances[0].isUnshared,true);assert(!JSON.stringify(publication).includes('孫白板專屬內容'));
 assert.equal(manifest.format,'inkbridge-share-package');assert.equal(manifest.readerBuild,'fixture-reader');assert(manifest.files.every(f=>f.path==='share.json'||f.path.startsWith('assets/')));
 const publishedPDF=publication.attachments.find(f=>f.source_file_id===info.sha256);assert.equal(publishedPDF.size,65*1024*1024);assert.equal((await scanFile(path.join(first.directory,publishedPDF.path))).sha256,info.sha256);
 const image=publication.attachments.find(f=>f.source_file_id===source.id);assert.equal(image.contentType,'image/webp');assert(image.preview_path);assert.equal(image.width,128);assert.deepEqual(await fs.readFile(path.join(workspace,source.filePath)),sourceBytes);
 const second=await exportWebShare(options),again=JSON.parse(await fs.readFile(path.join(second.directory,'share.json')));assert.equal(again.attachments.find(f=>f.source_file_id===source.id).reused,true);
});
