const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {WorkspaceDatabase}=require('../src/main/database.cjs');
async function fixture(){const file=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-history-')),'workspace.sqlite3');return {file,db:new WorkspaceDatabase(file)};}
const tab=(i)=>({id:'history-'+i,sourceId:'board-'+i,tabGroupId:'default',type:'Whiteboard',title:'Board '+i,config:{collapsed:false},subTabIds:[]});
test('original history protocol deduplicates source within group and persists exact identity/config',async()=>{const {file,db}=await fixture();let reopened;try{
 const graph=db.load(),created=db.history({method:'createHistoryTab',payload:tab(1)}),same=db.history({method:'createHistoryTab',payload:{...tab(1),id:'another'}});
 assert.equal(created.tab.id,same.tab.id);assert.equal(created.tab.order,1);db.close();reopened=new WorkspaceDatabase(file);
 const records=reopened.history({method:'getHistoryTabs'}).data;assert.equal(records.length,1);assert.equal(records[0].id,'history-1');assert.deepEqual(records[0].config,{collapsed:false});assert.deepEqual(reopened.load(),graph);
}finally{db.close();reopened?.close();}});
test('history close and original30-tab retention never remove board/card data',async()=>{const {db}=await fixture();try{
 const graph=db.load();for(let i=0;i<31;i++)db.history({method:'createHistoryTab',payload:{...tab(i),lastEditedTime:new Date(1000*i).toISOString()}});
 let records=db.history({method:'getHistoryTabs'}).data;assert.equal(records.length,30);assert(!records.some(t=>t.id==='history-0'));
 db.history({method:'deleteHistoryTab',payload:'history-1'});assert.equal(db.history({method:'getHistoryTabs'}).data.length,29);assert.deepEqual(db.load(),graph);
}finally{db.close();}});
test('history reorder is transactional and rejects unknown services',async()=>{const {db}=await fixture();try{
 for(let i=0;i<3;i++)db.history({method:'createHistoryTab',payload:tab(i)});
 db.history({method:'updateHistoryTabsOrder',payload:[{id:'history-0',order:9},{id:'history-2',order:0}]});
 const before=db.history({method:'getHistoryTabs'}).data;assert.equal(before[0].id,'history-2');
 assert.throws(()=>db.history({method:'updateHistoryTabsOrder',payload:[{id:'history-0',order:0},{id:'history-1',order:NaN}]}));
 assert.deepEqual(db.history({method:'getHistoryTabs'}).data,before);assert.throws(()=>db.history({method:'dropAllTables'}));
}finally{db.close();}});
