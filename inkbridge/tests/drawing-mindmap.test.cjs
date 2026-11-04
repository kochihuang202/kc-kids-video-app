const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
const doc={root:{type:'root',version:1,children:[{type:'paragraph',version:1,children:[{type:'text',version:1,text:'完整節點',format:0,detail:0,mode:'normal',style:''}],direction:null,format:'',indent:0}],direction:null,format:'',indent:0}};
const catalog=(kind,data)=>({type:'putCatalog',kind,data});
test('drawing and mindmap catalogs commit, no-op and reopen without changing existing content',async()=>{
 const filename=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-draw-map-db-')),'workspace.sqlite3');let db=new WorkspaceDatabase(filename);
 const commit=operations=>db.commit({requestId:crypto.randomUUID(),baseRevision:db.revision(),operations});
 commit([{type:'putBoard',data:{id:'board',title:'Test',view:{x:0,y:0,zoom:1}}},{type:'putContent',data:{id:'existing-note',title:'Keep',body:'Keep',document:doc,kind:'text',tone:'sage'}}]);
 const operations=[catalog('drawing-stroke',{id:'stroke',whiteboardId:'board',tool:'pen',color:'#000',strokeWidth:2,pathData:{type:'polyline',points:[{x:1,y:2},{x:30,y:40}]}}),catalog('mindmap',{id:'map',title:'Tree',layoutMode:'logic-right'}),catalog('mindmap-node',{id:'root',mindMapId:'map',isRoot:true,type:'Text',content:doc,childNodeIds:['child']}),catalog('mindmap-node',{id:'child',mindMapId:'map',isRoot:false,type:'Text',content:doc,childNodeIds:[]}),catalog('mindmap-instance',{id:'root',objectId:'map',whiteboardId:'board',x:100,y:200,width:180,height:48})];
 const ack=commit(operations);assert.equal(ack.changed,true);assert.equal(commit(operations).changed,false);const saved=db.load();assert.equal(saved.contents[0].id,'existing-note');assert.equal(saved.drawingStrokes.length,1);assert.equal(saved.mindmapNodes.length,2);db.close();db=new WorkspaceDatabase(filename);assert.deepEqual(db.load(),saved);
 assert.throws(()=>commit([catalog('mindmap',{id:'rollback-map',title:'Never saved'}),catalog('drawing-stroke',{...saved.drawingStrokes[0],id:'invalid',whiteboardId:'missing'})]),{code:'INVALID_REQUEST'});assert.deepEqual(db.load(),saved,'invalid stroke must roll back the complete transaction');
 commit([{type:'deleteCatalog',kind:'mindmap-instance',id:'root'}]);assert.equal(db.load().mindmapInstances,undefined);assert.equal(db.load().mindmapNodes.length,2,'removing one placement preserves the reusable tree');db.close();
});
test('new catalogs participate in shared-window preconditions and projection',async()=>{
 const {windowExpectations,assertWindowExpectations,projectWindowOperations}=await import('../src/core/workspace-window-sync.mjs');
 const graph={boards:[],contents:[],instances:[],drawingStrokes:[{id:'stroke',color:'#000'}],mindmaps:[{id:'map'}],mindmapNodes:[{id:'root',childNodeIds:[]}],mindmapInstances:[]};
 const ops=[catalog('drawing-stroke',{id:'stroke',color:'#f00'}),catalog('mindmap-node',{id:'root',childNodeIds:['child']})],expected=windowExpectations(graph,ops),next=projectWindowOperations(graph,ops);assert.equal(next.drawingStrokes[0].color,'#f00');assert.deepEqual(next.mindmapNodes[0].childNodeIds,['child']);assert.equal(graph.drawingStrokes[0].color,'#000');assert.throws(()=>assertWindowExpectations(next,ops,expected),{code:'WORKSPACE_CONFLICT'});
});
