const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const {createAttachmentStore}=require('../src/main/attachment-store.cjs');

test('PDF CAS preserves original bytes, deduplicates, and rejects truncated input',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-pdf-unit-'));
  const store=createAttachmentStore(dir,()=>{throw Error('PDF must not use an image decoder');});
  const bytes=require('./helpers/pdf-fixture.cjs')(3);
  const first=store.prepare(bytes,'pages.pdf');
  assert.equal(first.fileId,store.prepare(bytes,'other.pdf').fileId);
  assert.deepEqual(store.readUrl('flexnote://file/'+first.fileId+'.pdf').bytes,bytes);
  assert.deepEqual(first.metadata,{});
  assert.throws(()=>store.prepare(bytes.subarray(0,100),'broken.pdf'));
  assert.equal(fs.readdirSync(dir).length,1);
});

test('SQLite connection cascade is atomic, board-scoped, and preserves independent content',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-edge-unit-'));
  const db=new WorkspaceDatabase(path.join(dir,'workspace.sqlite3'));
  const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.load().revision,operations});
  const put=(kind,data)=>({type:'putCatalog',kind,data});
  try{
    commit([{type:'putBoard',data:{id:'other',title:'Other',view:{x:0,y:0,zoom:1}}},
      ...['a','b'].flatMap((id,i)=>[
        {type:'putContent',data:{id,title:id,body:'',document:null,kind:'text',tone:'sage'}},
        {type:'putInstance',data:{id:'i'+id,contentId:id,boardId:'board-main',x:i*300,y:0,width:200,height:100,z:i}}
      ]),put('connection',{id:'edge',whiteboardId:'board-main',beginId:'ia',endId:'ib'}),
      put('connection',{id:'edge-child',whiteboardId:'board-main',beginId:'edge',endId:'ib'})]);
    const before=db.load();
    assert.throws(()=>commit([put('connection',{id:'invalid',whiteboardId:'other',beginId:'edge',endId:'edge'})]),/endpoint/);
    assert.deepEqual(db.load(),before);
    assert.throws(()=>commit([{type:'deleteInstance',id:'ia'},put('connection',{id:'bad',whiteboardId:'board-main',beginId:'missing',endId:'ib'})]),/endpoint/);
    assert.deepEqual(db.load(),before);
    commit([{type:'deleteInstance',id:'ia'}]);
    assert.equal((db.load().connections||[]).length,0);
    assert.equal(db.load().contents.length,2);
    assert.equal(db.load().instances.length,1);
  }finally{db.close();}
});

test('native attachment filters exclude trashed records and empty-note filtering excludes images/PDF',async()=>{
  const {cardsByFilters}=await import('../src/core/original-catalog.mjs');
  const graph={boards:[],instances:[],contents:[{id:'img',kind:'image',title:'Picture'},{id:'pdf',kind:'pdf',title:'Document'},{id:'gone',kind:'image',title:'Trash'}],cardMetadata:[{id:'gone',isTrashed:true}],files:[]};
  assert.deepEqual(cardsByFilters(graph,{cardTypes:['image']}).data.map(row=>row.id),['img']);
  assert.deepEqual(cardsByFilters(graph,{cardTypes:['PDFCard']}).data.map(row=>row.id),['pdf']);
  assert.equal(cardsByFilters(graph,{cardTypes:['image','PDFCard'],filterEmptyNoteCards:true}).totalCount,0);
});

test('PDF page ACK rejects invalid pages and does not advance revision for unchanged pages',async()=>{
  const {PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs');
  const {createOriginalPdf}=await import('../src/core/original-pdf.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-pdf-ack-'));
  const db=new WorkspaceDatabase(path.join(dir,'workspace.sqlite3'));
  db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[
    {type:'putContent',data:{id:'pdf',title:'PDF',kind:'pdf',body:'',document:null,tone:'sage'}},
    {type:'putCatalog',kind:'card',data:{id:'pdf',currentPage:1,totalPages:3}}
  ]});
  const contents=new Map(db.load().contents.map(row=>[row.id,row]));
  const coordinator=new PersistenceCoordinator({revision:db.load().revision,commit:async request=>db.commit(request)});
  const pdf=createOriginalPdf({navigate:fn=>fn(),coordinator,load:()=>db.load(),contents,instances:new Map(),putContent:()=>{},catalogOperation:(kind,data)=>({type:'putCatalog',kind,data}),store:{getState:()=>({setNodes:()=>{}})},toNode:()=>{},getBoardId:()=> 'board-main'});
  try{
    const before=db.load();
    await pdf.call('updatePdfCardCurrentPage',{id:'pdf',currentPage:1});
    assert.deepEqual(db.load(),before);
    await assert.rejects(pdf.call('updatePdfCardCurrentPage',{id:'pdf',currentPage:4}),/Invalid PDF page/);
    assert.deepEqual(db.load(),before);
    await pdf.call('updatePdfCardCurrentPage',{id:'pdf',currentPage:3});
    assert.equal(db.load().cardMetadata[0].currentPage,3);
    assert.equal(db.load().revision,before.revision+1);
  }finally{coordinator.dispose();db.close();}
});

test('mixed attachment trash validates the whole batch before staging, then restores original content',async()=>{
  const {PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs');
  const {createOriginalNoteWriter}=await import('../src/core/original-note-writes.mjs');
  const db=new WorkspaceDatabase(path.join(fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-trash-unit-')),'workspace.sqlite3'));
  db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:['image','pdf'].map(kind=>({type:'putContent',data:{id:kind,title:kind,kind,body:'',document:null,tone:'sage'}}))});
  const coordinator=new PersistenceCoordinator({revision:db.load().revision,commit:async request=>db.commit(request)});
  const write=createOriginalNoteWriter({navigate:fn=>fn(),coordinator,load:()=>db.load(),contents:new Map(db.load().contents.map(row=>[row.id,row])),instances:new Map(),catalogOperation:(kind,data)=>({type:'putCatalog',kind,data}),store:{getState:()=>({setNodes:()=>{}})}});
  try{
    const before=db.load();
    await assert.rejects(write('batchDeleteCardsByType',[{objectId:'image',objectType:'MediaCard'},{objectId:'missing',objectType:'unknown'}]));
    assert.equal(coordinator.pending.size,0);
    assert.deepEqual(db.load(),before);
    await write('batchDeleteCardsByType',[{objectId:'image',objectType:'MediaCard'},{objectId:'pdf',objectType:'PDFCard'}]);
    assert(db.load().cardMetadata.every(row=>row.isTrashed));
    await write('restoreAttachmentCard',{id:'pdf',type:'PDFCard'});
    assert.equal(db.load().cardMetadata.find(row=>row.id==='pdf').isTrashed,false);
    assert.equal(db.load().cardMetadata.find(row=>row.id==='image').isTrashed,true);
    assert.deepEqual(db.load().contents,before.contents);
  }finally{coordinator.dispose();db.close();}
});
