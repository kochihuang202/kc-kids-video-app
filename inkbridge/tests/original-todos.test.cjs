const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const text=value=>({type:'text',version:1,text:value,format:0,style:'',detail:0,mode:'normal'});
const item=(title,checked=false,extra={})=>({type:'listitem',version:1,checked,children:[text(title)],format:'',indent:0,direction:null,value:1,...extra});
const document=items=>({root:{type:'root',version:1,children:[{type:'list',version:1,listType:'check',tag:'ul',start:1,format:'',indent:0,direction:null,children:items}],format:'',indent:0,direction:null}});

async function fixture(t){
 const {createOriginalTodos}=await import('../src/core/original-todos.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-todos-')),filename=path.join(root,'workspace.sqlite3');let db=new WorkspaceDatabase(filename),pending=[],tail=Promise.resolve();
 t.after(()=>{db.close();return fs.rm(root,{recursive:true,force:true});});
 const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 const coordinator={stage:op=>pending.push(op),flush:async()=>{if(pending.length){const batch=pending;pending=[];commit(batch);}}};
 const catalogOperation=(kind,data)=>({type:'putCatalog',kind,data:JSON.parse(JSON.stringify(data))});
 const write=async(type,id,next)=>{const graph=db.load();if(type==='textElement'){const old=graph.textElements.find(row=>row.id===id);coordinator.stage(catalogOperation('text-element',{...old,content:next}));}else{const old=graph.contents.find(row=>row.id===id);coordinator.stage({type:'putContent',data:{...old,document:next}});}};
 const api=createOriginalTodos({navigate:fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;},coordinator,load:async()=>db.load(),catalogOperation,writeSourceDocument:write});
 return {api,commit,load:()=>db.load(),revision:()=>db.revision(),reopen:()=>{db.close();db=new WorkspaceDatabase(filename);}};
}

test('native standalone todo create/edit/subtasks/date/order/toggle/delete persist after reopen; reads stay clean',async t=>{
 const f=await fixture(t),call=(name,payload)=>f.api.call(name,payload),base={completed:false,dueDate:null,parentId:null,notes:null,spaceId:'local',createdBy:'user',order:0};
 const revision=f.revision();assert.deepEqual((await call('getTodosFromNotes','local')).data,[]);assert.equal(f.revision(),revision);
 await call('createTodo',{...base,id:'parent',title:'提交報告',dueDate:'2026-11-20',notes:'原始備註'});
 await call('createTodo',{...base,id:'child',parentId:'parent',title:'附圖'});
 await call('createTodo',{...base,id:'other',title:'另一件事'});
 await call('updateTodo',{id:'parent',title:'提交完整報告',notes:'修改備註',dueDate:'2026-11-21'});
 await call('updateTodosOrder',[{id:'other'},{id:'parent'},{id:'child'}]);
 assert.equal((await call('getSubtasks','parent')).data[0].id,'child');
 assert.equal((await call('toggleTodo',{id:'parent'})).completed,true);
 f.reopen();const parent=(await call('getTodo','parent')).data;assert.equal(parent.title,'提交完整報告');assert.equal(parent.completed,true);assert.equal(parent.notes,'修改備註');assert.equal(parent.dueDate,'2026-11-21');
 assert.equal((await call('getTodos','local')).data[0].id,'other');
 const before=f.revision();await call('updateTodo',{...parent,sourceType:'standalone'});await call('getTodosFromNotes','local');assert.equal(f.revision(),before,'identical updates and reads must not manufacture revisions');
 await call('deleteTodo',{id:'parent'});f.reopen();assert.deepEqual((await call('getTodos','local')).data.map(row=>row.id),['other']);
});

test('checklist tasks aggregate from notes, diary and whiteboard text, and toggle original AST without losing markup',async t=>{
 const f=await fixture(t),nested=document([item('子項')]).root.children[0];
 const note=document([item('主事項',false,{dueDate:'2026-11-20',customMarker:'keep',children:[text('主事項'),nested]}),item(''),item('另一項',true)]);
 f.commit([{type:'putContent',data:{id:'note',title:'筆記',body:'',document:note,kind:'text',tone:'sage'}},{type:'putContent',data:{id:'daily',title:'日記',body:'',document:document([item('日記事項')]),kind:'text',tone:'sage'}},{type:'putCatalog',kind:'quick-note',data:{id:'daily',date:'2026-11-16'}},{type:'putCatalog',kind:'text-element',data:{id:'text-element',whiteboardId:'board-main',content:document([item('白板事項')]),x:0,y:0,width:200,height:100}}]);
 const call=(name,payload)=>f.api.call(name,payload),before=f.revision(),tasks=(await call('getTodosFromNotes','local')).data;
 assert.equal(f.revision(),before);assert.equal(tasks.length,5);assert.equal(tasks.find(row=>row.id==='daily_todo_0').sourceCardType,'dailyNote');assert.equal(tasks.find(row=>row.id==='text-element_todo_0').sourceWhiteboardId,'board-main');
 assert.deepEqual(tasks.filter(row=>row.sourceCardId==='note').map(row=>row.title),['主事項','另一項','子項']);
 await call('updateTodoInNote',{todoId:'note_todo_2',completed:true});
 const next=f.load().contents.find(row=>row.id==='note').document;assert.equal(next.root.children[0].children[0].children[1].children[0].checked,true);assert.equal(next.root.children[0].children[0].customMarker,'keep');
 assert.equal(next.root.children[0].children[0].checked,false);assert.equal(next.root.children[0].children[0].dueDate,'2026-11-20');
 await call('updateTodoInNote',{todoId:'daily_todo_0',completed:true});await call('updateTodoInNote',{todoId:'text-element_todo_0',completed:true});f.reopen();
 assert.equal((await call('getTodosFromNotes','local')).data.find(row=>row.id==='daily_todo_0').completed,true);assert.equal((await call('getTodosFromNotes','local')).data.find(row=>row.id==='text-element_todo_0').completed,true);
 const stable=f.revision();await call('updateTodoInNote',{todoId:'daily_todo_0',completed:true});assert.equal(f.revision(),stable);
 await assert.rejects(call('updateTodoInNote',{todoId:'note_todo_99',completed:true}),/not found/);assert.equal(f.revision(),stable);
});

test('invalid task changes and cyclic parents never stage a partial catalog mutation',async t=>{
 const f=await fixture(t),call=(name,payload)=>f.api.call(name,payload);await call('createTodo',{id:'parent',title:'父'});await call('createTodo',{id:'child',title:'子',parentId:'parent'});const before=f.load();
 await assert.rejects(call('updateTodo',{id:'parent',parentId:'child'}),/Cyclic/);await assert.rejects(call('updateTodosOrder',[{id:'parent'},{id:'missing'}]),/not found/);await assert.rejects(call('updateTodo',{id:'parent',dueDate:'not-a-date'}),/Invalid todo date/);assert.deepEqual(f.load(),before);
});
