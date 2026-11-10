import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateBoardReference,sidebarRevealKeys} from '../src/core/nested-whiteboards.mjs';
test('nested references reject missing targets and direct or indirect cycles',()=>{
const graph={boards:['a','b','c'].map(id=>({id})),whiteboardInstances:[{id:'ab',containerType:'whiteboard',containerId:'a',whiteboardId:'b'}]};
assert.doesNotThrow(()=>validateBoardReference(graph,{id:'bc',containerType:'whiteboard',containerId:'b',whiteboardId:'c'}));
assert.throws(()=>validateBoardReference(graph,{id:'ba',containerType:'whiteboard',containerId:'b',whiteboardId:'a'}),/循環/);
assert.throws(()=>validateBoardReference(graph,{id:'aa',containerType:'whiteboard',containerId:'a',whiteboardId:'a'}),/循環/);
assert.throws(()=>validateBoardReference(graph,{id:'missing',containerType:'whiteboard',containerId:'a',whiteboardId:'missing'}),/不存在/);
});
test('sidebar reveal includes reference identities and ancestor folders without unrelated branches',()=>{
 const graph={whiteboardInstances:[{id:'ref-a',containerType:'folder',containerId:'ess',whiteboardId:'a'},{id:'ref-b',containerType:'whiteboard',containerId:'a',whiteboardId:'b'},{id:'trash',containerType:'folder',containerId:'old',whiteboardId:'b',isTrashed:true},{id:'other',containerType:'folder',containerId:'elsewhere',whiteboardId:'other'}]};
 assert.deepEqual([...sidebarRevealKeys(graph,'b')].sort(),['a','b','ess','ref-a','ref-b']);
});
