import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateMarkers,replaceMarker,markerInset,nodeStyle} from '../src/core/mindmap-appearance.mjs';

test('marker categories replace independently and reserve bounded width',()=>{
 let markers=replaceMarker([], 'tag','red');
 markers=replaceMarker(markers,'priority','2');
 markers=replaceMarker(markers,'tag','blue');
 assert.deepEqual(markers,[{group:'priority',value:'2'},{group:'tag',value:'blue'}]);
 assert.equal(markerInset({inkbridgeMarkers:markers}),44);
 assert.deepEqual(replaceMarker(markers,'priority',null),[{group:'tag',value:'blue'}]);
 assert.throws(()=>validateMarkers([{group:'task',value:'200'}]));
 assert.throws(()=>validateMarkers([{group:'tag',value:'red'},{group:'tag',value:'blue'}]));
 assert.equal(nodeStyle({}), 'branch');
 assert.equal(nodeStyle({inkbridgeNodeStyle:'plain',inkbridgeMapStyle:'boxed'}),'plain');
 assert.equal(nodeStyle({}, {inkbridgeStyle:'boxed'}),'boxed');
});
