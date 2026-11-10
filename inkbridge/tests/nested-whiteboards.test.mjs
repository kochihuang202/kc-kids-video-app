import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateBoardReference} from '../src/core/nested-whiteboards.mjs';
test('nested references reject missing targets and direct or indirect cycles',()=>{
const graph={boards:['a','b','c'].map(id=>({id})),whiteboardInstances:[{id:'ab',containerType:'whiteboard',containerId:'a',whiteboardId:'b'}]};
assert.doesNotThrow(()=>validateBoardReference(graph,{id:'bc',containerType:'whiteboard',containerId:'b',whiteboardId:'c'}));
assert.throws(()=>validateBoardReference(graph,{id:'ba',containerType:'whiteboard',containerId:'b',whiteboardId:'a'}),/循環/);
assert.throws(()=>validateBoardReference(graph,{id:'aa',containerType:'whiteboard',containerId:'a',whiteboardId:'a'}),/循環/);
assert.throws(()=>validateBoardReference(graph,{id:'missing',containerType:'whiteboard',containerId:'a',whiteboardId:'missing'}),/不存在/);
});
