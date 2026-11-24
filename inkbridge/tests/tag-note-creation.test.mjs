import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {WorkspaceDatabase} from '../src/main/database.cjs';
import {PersistenceCoordinator} from '../src/core/persistence-coordinator.mjs';
import {createOriginalNoteWriter} from '../src/core/original-note-writes.mjs';
import {createOriginalTags} from '../src/core/original-tags.mjs';

test('native tag collection creation saves the note and tag in one commit, rejects missing tags and reopens',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-tag-note-')),file=path.join(dir,'workspace.sqlite3');let db=new WorkspaceDatabase(file);
 const contents=new Map(),coordinator=new PersistenceCoordinator({revision:0,autoDelay:60000,commit:async request=>db.commit(request)});
 const catalogOperation=(kind,data)=>({type:'putCatalog',kind,data}),load=async()=>db.load();
 const make=({name,...data})=>({id:crypto.randomUUID(),name,tags:[],subTagIds:[],...data});
 const tags=createOriginalTags({r:()=>({YH:{newTag:make,newTagGroup:make}}),navigate:action=>action(),coordinator,load,catalogOperation});
 const write=createOriginalNoteWriter({navigate:action=>action(),coordinator,load,contents,catalogOperation,tagDefaults:graph=>tags.project(graph),putContent:content=>{contents.set(content.id,content);coordinator.stage({type:'putContent',data:content});}});
 const note=id=>({id,title:'中文內容',content:{root:{type:'root',version:1,children:[]}},propertiesConfig:[],createdTime:'2026-11-24T00:00:00.000Z',lastEditedTime:'2026-11-24T00:00:00.000Z'});
 try{
  assert.equal(db.revision(),0);await write('addNoteCard',{noteCard:note('normal')});const first=db.load(),system=first.tags.find(row=>row.name==='NoteCard');assert(system);assert(first.cardTags.some(row=>row.cardId==='normal'&&row.tagId===system.id));assert.equal(first.revision,1);
  const revision=db.revision();await assert.rejects(write('addNoteCard',{noteCard:note('invalid'),tagId:'missing'}),/標籤不存在/);assert.equal(db.revision(),revision);assert.equal(contents.has('invalid'),false);assert.equal(coordinator.pending.size,0);
  await tags.call('addTag',{tagData:{id:'custom',name:'工作',subTagIds:[]},tagGroupId:first.tagGroups[0].id});await write('addNoteCard',{noteCard:note('tagged'),tagId:'custom'});
  assert.deepEqual(db.load().cardTags.filter(row=>row.cardId==='tagged').map(row=>row.tagId),['custom']);
  const saved=db.load();db.close();db=new WorkspaceDatabase(file);assert.deepEqual(db.load(),saved);
 }finally{coordinator.dispose();db.close();await fs.rm(dir,{recursive:true,force:true});}
});
