const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createOriginalExports}=require('../src/main/original-exports.cjs');
const {createAttachmentStore}=require('../src/main/attachment-store.cjs');
test('exports preserve CAS integrity, reject missing references and never overwrite same-title artifacts',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-export-unit-')),directory=path.join(dir,'exports');
  const attachments=createAttachmentStore(path.join(dir,'files'),()=>({width:1,height:1}));
  const graph={contents:[{id:'note',title:'CON',kind:'text'}],cardMetadata:[]};
  const service=createOriginalExports({directory,load:async()=>graph,attachments});
  await assert.rejects(service.call('exportNoteCardToMarkdown',{cardIds:['note'],markdownString:'![missing](flexnote://file/'+'a'.repeat(64)+')'}),/Missing/);
  assert(!fs.existsSync(directory));
  await assert.rejects(service.call('exportNoteCardToMarkdown',{cardIds:['note','second'],markdownString:'partial'}),/one native/);
  const first=await service.call('exportNoteCardToMarkdown',{cardIds:['note'],markdownString:'first'});
  const second=await service.call('exportNoteCardToMarkdown',{cardIds:['note'],markdownString:'second'});
  assert.notEqual(first.zipPath,second.zipPath);assert.equal(fs.readFileSync(first.filePath,'utf8'),'first');assert.equal(path.basename(first.filePath),'_CON.md');
  graph.cardMetadata=[{id:'note',isTrashed:true}];
  await assert.rejects(service.call('exportNoteCardToMarkdown',{cardIds:['note'],markdownString:'trashed'}),/trashed/);
});
test('Word package rejects traversal/entity inputs and renderer paths cannot choose a destination',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkbridge-word-unit-')),directory=path.join(dir,'exports');
  const service=createOriginalExports({directory,load:async()=>({}),attachments:{readUrl:()=>{throw Error('unused');}}});
  await assert.rejects(service.call('saveDocxFromXml',{documentXml:'<!DOCTYPE a><w:document/>'}),/Invalid Word/);
  await assert.rejects(service.call('saveDocxFromXml',{documentXml:'<w:document/>',media:[{id:'rId1',name:'../bad.png',base64:'AA=='}]}),/Invalid Word media/);
  assert(!fs.existsSync(directory));
  const outside=path.join(dir,'must-not-write.docx');
  const result=await service.call('saveDocxFromXml',{documentXml:'<w:document/>',defaultName:'../AUX.docx',filePath:outside});
  assert(!fs.existsSync(outside));assert(result.filePath.startsWith(directory+path.sep));
});
test('attachment library uses real intrinsic dimensions without resurrecting trashed images or fabricated defaults',async()=>{
  const {attachmentRecord,cardsByFilters}=await import('../src/core/original-catalog.mjs');
  const graph={boards:[],instances:[],contents:[{id:'img',kind:'image',title:'Picture'}],cardMetadata:[{id:'img',fileId:'file',isTrashed:true}],files:[{id:'file',metadata:JSON.stringify({width:1280,height:720})}]};
  const record=attachmentRecord(graph,graph.contents[0]);assert.equal(record.width,1280);assert.equal(record.height,720);assert.equal(record.isTrashed,true);assert.equal(cardsByFilters(graph,{cardTypes:['image']}).totalCount,0);
  graph.files[0].metadata='invalid';const missing=attachmentRecord(graph,graph.contents[0]);assert.equal(missing.width,undefined);assert.equal(missing.height,undefined);
});
