const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const {createLinkedVideos,inspect,isVideoPath,linkId}=require('../src/main/linked-videos.cjs');
const {attachmentResponse}=require('../src/main/attachment-response.cjs');
const doc={root:{type:'root',version:1,children:[{type:'paragraph',version:1,children:[{type:'text',version:1,text:'筆記',format:0,detail:0,mode:'normal',style:''}],direction:null,format:'',indent:0}],direction:null,format:'',indent:0}};
const catalog=(kind,data)=>({type:'putCatalog',kind,data});

test('video content and highlights commit, reject invalid rows whole, soft delete and reopen exactly',async()=>{
 const filename=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-video-db-')),'workspace.sqlite3');let db=new WorkspaceDatabase(filename);
 const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 commit([{type:'putBoard',data:{id:'board',title:'Test',view:{x:0,y:0,zoom:1}}},{type:'putContent',data:{id:'video-card',title:'Lesson',body:'',document:null,kind:'video',tone:'sage'}},catalog('card',{id:'video-card',type:'video',fileId:'a'.repeat(64),fileSuffix:'mp4',platform:'local',path:'C:\\media\\lesson.mp4'})]);
 const highlight={id:'mark-1',sourceId:'a'.repeat(64),timeStamp:7.36,notes:doc,screenshotFileId:'b'.repeat(64),color:'',isTrashed:false};
 commit([catalog('video-highlight',highlight)]);
 const revision=db.revision();
 // Same value is a no-op; an invalid row rejects the whole batch.
 commit([catalog('video-highlight',highlight)]);assert.equal(db.revision(),revision);
 assert.throws(()=>commit([catalog('video-highlight',{...highlight,id:'mark-2',timeStamp:12}),catalog('video-highlight',{...highlight,id:'mark-3',timeStamp:-1})]));
 assert.throws(()=>commit([catalog('video-highlight',{...highlight,id:'mark-4',sourceId:undefined})]));
 assert.throws(()=>commit([catalog('video-highlight',{...highlight,id:'mark-5',notes:{root:{type:'root',children:'bad'}}})]));
 assert.equal(db.revision(),revision);assert.deepEqual(db.load().videoHighlights.map(row=>row.id),['mark-1']);
 commit([catalog('video-highlight',{...highlight,isTrashed:true})]);
 db.close();db=new WorkspaceDatabase(filename);
 const graph=db.load();
 assert.equal(graph.contents.find(row=>row.id==='video-card').kind,'video');
 assert.deepEqual(graph.videoHighlights,[{...highlight,isTrashed:true}]);
 assert.equal(graph.cardMetadata.find(row=>row.id==='video-card').path,'C:\\media\\lesson.mp4');
 commit([{type:'deleteCatalog',kind:'video-highlight',id:'mark-1'}]);assert.deepEqual(db.load().videoHighlights||[],[],'an empty collection is omitted from the graph');
 db.close();
});

test('linked videos resolve only paths recorded on video cards, follow relinking and serve ranges',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-linked-video-')),file=path.join(dir,'課程 Lesson.MP4'),other=path.join(dir,'other.mp4'),text=path.join(dir,'notes.txt');
 const bytes=Buffer.from(Array.from({length:4096},(_,i)=>i%251));await fs.writeFile(file,bytes);await fs.writeFile(other,bytes.subarray(0,100));await fs.writeFile(text,'x');
 assert.equal(isVideoPath(file),true);assert.equal(isVideoPath(text),false);assert.equal(isVideoPath('relative.mp4'),false);
 assert.equal(linkId(file),linkId(file.toUpperCase()),'the link identity is case-insensitive like Windows paths');assert.notEqual(linkId(file),linkId(other));
 const info=await inspect(file);assert.deepEqual({id:info.id,type:info.type,size:info.size,path:info.path},{id:linkId(file),type:'mp4',size:4096,path:file});
 await assert.rejects(inspect(text),/Unsupported video/);await assert.rejects(inspect(path.join(dir,'missing.mp4')));
 let graph={cardMetadata:[{id:'card',type:'video',fileId:info.id,path:file},{id:'image',type:'MediaCard',fileId:'c'.repeat(64),path:other},{id:'bad',type:'video',fileId:'d'.repeat(64),path:text}]},loads=0;
 const linked=createLinkedVideos({load:async()=>{loads++;return graph;}}),url=id=>`flexnote://file/${id}.mp4`;
 const found=await linked.resolveUrl(url(info.id));assert.equal(found.filePath,file);assert.equal(found.size,4096);assert.equal(found.contentType,'video/mp4');assert.equal(found.cacheControl,'no-store');
 assert.equal(await linked.resolveUrl(url('c'.repeat(64))),null,'a non-video card must not expose its path');
 assert.equal(await linked.resolveUrl(url('d'.repeat(64))),null,'a non-video file extension must not be served');
 assert.equal(await linked.resolveUrl(url('e'.repeat(64))),null);
 assert.equal(await linked.resolveUrl('flexnote://file/'+'c'.repeat(64)+'.png'),null,'attachment URLs are left to the attachment store');
 assert.equal(await linked.resolveUrl('https://example.invalid/'+info.id+'.mp4'),null);
 assert.equal(loads,1,'the path table is cached between commits');
 // Range contract through the shared protocol response.
 const response=await attachmentResponse(new Request(url(info.id),{headers:{Range:'bytes=10-19'}}),{resolveUrl:async()=>found});
 assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 10-19/4096');assert.equal(response.headers.get('content-type'),'video/mp4');assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(10,20));
 // Relink: a commit invalidates the table; the old identity no longer resolves.
 const movedId=linkId(other);graph={cardMetadata:[{id:'card',type:'video',fileId:movedId,path:other}]};linked.invalidate();
 assert.equal(await linked.resolveUrl(url(info.id)),null);assert.equal((await linked.resolveUrl(url(movedId))).filePath,other);
 await fs.rm(other);await assert.rejects(linked.resolveUrl(url(movedId)),'a recorded but missing file is an error, not a silent fallback');
});
