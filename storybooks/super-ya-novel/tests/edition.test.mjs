import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('child navigation uses one shared header and extra reading is archived',()=>{
 assert.match(text('public/drawer.js'),/child-header/);
 assert.doesNotMatch(text('public/practice.js'),/class="level-tabs"/);
 assert.doesNotMatch(text('public/app.js'),/href="\?view=parent"/);
 assert.match(text('public/parent-gate.js'),/3000/);
});
