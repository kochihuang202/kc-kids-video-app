const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const document=text=>({root:{type:'root',version:1,format:'',indent:0,direction:null,children:[{type:'paragraph',version:1,format:'',indent:0,direction:null,children:text?[{type:'text',version:1,text,detail:0,format:0,mode:'normal',style:''}]:[]}]}});
test('diary month/date/search and external edits survive SQLite reopen without read revisions',async()=>{
 const {createOriginalDiary,diaryRecords}=await import('../src/core/original-diary.mjs'),{PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs');
 const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-diary-')),'workspace.sqlite3');let db=new WorkspaceDatabase(file),contents=new Map(),replaced=[];
 const coordinator=new PersistenceCoordinator({revision:db.revision(),autoDelay:60000,commit:async request=>db.commit(request)});
 const putContent=content=>{const next={...content,body:content.document.root.children.map(p=>p.children.map(c=>c.text||'').join('')).join('\n')};contents.set(next.id,next);coordinator.stage({type:'putContent',data:next});};
 const service=createOriginalDiary({navigate:action=>action(),coordinator,load:async()=>db.load(),contents,putContent,replaceContentDocument:(id,value)=>{replaced.push(id);putContent({...contents.get(id),document:value});},catalogOperation:(kind,data)=>({type:'putCatalog',kind,data}),now:()=> '2026-11-16T10:00:00.000Z'});
 try{
  await service.call('getQuickNotesList',{date:'2026-11-16'});await service.call('upsertQuickNote',{date:'2026-11-16',quickNote:{id:'empty',content:JSON.stringify(document(''))}});assert.equal(db.revision(),0);
  await service.call('upsertQuickNote',{date:'2026-11-16',quickNote:{id:'today',content:JSON.stringify(document('中文日記'))}});const written=db.revision();
  await service.call('upsertQuickNote',{date:'2026-11-16',quickNote:{id:'today',content:JSON.stringify(document('中文日記'))}});assert.equal(db.revision(),written);
  await service.call('upsertQuickNote',{date:'2026-10-31',quickNote:{id:'oct',content:JSON.stringify(document('上月'))}});
  assert.deepEqual((await service.call('getQuickNotesList',{date:'2026-11-01'})).map(row=>row.id),['today']);
  assert.deepEqual((await service.call('getQuickNotesByDates',{dates:['2026-11-16','2026-10-31']})).map(row=>row.id),['oct','today']);
  assert.equal((await service.call('searchQuickNotes',{keyword:'中文'}))[0].id,'today');
  const beforeReads=db.revision();await service.call('getDailyNoteById',{id:'today'});await service.call('getQuickNotesStats');assert.equal(db.revision(),beforeReads);
  await service.call('updateQuickNote',{id:'today',updates:{content:document('外部勾選')}});assert.deepEqual(replaced,['today']);
  await service.call('upsertQuickNote',{id:'today',quickNote:{id:'today',content:document('待辦頁回寫日記')}});assert.equal(diaryRecords(db.load()).find(row=>row.id==='today').content.root.children[0].children[0].text,'待辦頁回寫日記');
  await service.call('upsertQuickNote',{date:'2026-11-16',quickNote:{id:'different-id',content:JSON.stringify(document('同日期接續'))}});assert.equal(diaryRecords(db.load()).filter(row=>row.date==='2026-11-16').length,1);
  coordinator.dispose();db.close();db=new WorkspaceDatabase(file);assert.equal(diaryRecords(db.load()).find(row=>row.id==='today').content.root.children[0].children[0].text,'同日期接續');
  await assert.rejects(service.call('getQuickNotesList',{date:'2026-02-30'}),/日期無效/);
 }finally{coordinator.dispose();db.close();}
});
test('diary statistics ignore empty drafts and count original day streak and tags',async()=>{
 const {diaryStats}=await import('../src/core/original-diary.mjs');const dates=['2026-11-13','2026-11-15','2026-11-16','2026-11-17'];
 const graph={quickNotes:dates.map((date,i)=>({id:String(i),date})),contents:dates.map((date,i)=>({id:String(i),document:document(i===3?'':'筆記')})),cardTags:[{cardId:'1',cardType:'DailyNote',tagId:'tag'}],tags:[{id:'tag',name:'工作'}]};
 assert.deepEqual(diaryStats(graph,'2026-11-16'),{writtenDays:3,calendarSpanDays:4,currentStreak:2,longestStreak:2,writtenDates:dates.slice(0,3),topTags:[{id:'tag',name:'工作',count:1}]});
});

test('native diary trash preserves content and validates the entire batch before staging',async()=>{
 const {createOriginalNoteWriter}=await import('../src/core/original-note-writes.mjs'),{PersistenceCoordinator}=await import('../src/core/persistence-coordinator.mjs');
 const db=new WorkspaceDatabase(path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-diary-trash-')),'workspace.sqlite3'));
 db.commit({requestId:crypto.randomUUID(),baseRevision:0,operations:[...['day','not-a-day'].map(id=>({type:'putContent',data:{id,kind:'text',title:id,body:'保留正文',tone:'sage',document:document('保留正文')}})),{type:'putCatalog',kind:'quick-note',data:{id:'day',date:'2026-11-17'}}]});
 const coordinator=new PersistenceCoordinator({revision:db.revision(),commit:async request=>db.commit(request)}),write=createOriginalNoteWriter({navigate:action=>action(),coordinator,load:async()=>db.load(),contents:new Map(db.load().contents.map(row=>[row.id,row])),instances:new Map(),catalogOperation:(kind,data)=>({type:'putCatalog',kind,data}),store:{getState:()=>({setNodes:()=>{}})}});
 try{const before=db.load();await assert.rejects(write('batchDeleteCardsByType',[{objectId:'day',objectType:'DailyNote'},{objectId:'not-a-day',objectType:'DailyNote'}]));assert.equal(coordinator.pending.size,0);assert.deepEqual(db.load(),before);await write('batchDeleteCardsByType',[{objectId:'day',objectType:'DailyNote'}]);assert.equal(db.load().quickNotes[0].isTrashed,true);assert.deepEqual(db.load().contents,before.contents);}finally{coordinator.dispose();db.close();}
});
