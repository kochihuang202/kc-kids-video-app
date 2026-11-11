const test=require('node:test'),assert=require('node:assert/strict');
test('native share tree: descendant selection includes ancestors, duplicate references synchronize, cycles terminate, parent cancellation removes descendants',async()=>{
 const {changeShareSelection}=await import('../scripts/original-reuse/web-share.mjs');
 const tree={rootBoardId:'root',boards:['root','a','b','grand'].map(id=>({id})),links:[['root','a'],['root','b'],['a','grand'],['b','grand'],['grand','root']].map(([containerId,whiteboardId])=>({containerId,whiteboardId}))};
 assert.deepEqual(new Set(changeShareSelection(tree,['root'],'grand',true)),new Set(['root','a','grand']));
 assert.deepEqual(changeShareSelection(tree,['root','a','b','grand'],'a',false),['root','b']);
 assert.deepEqual(changeShareSelection(tree,['root'],'a',true),['root','a']);
 assert.deepEqual(changeShareSelection(tree,['root'],'unknown',true),['root']);
});
