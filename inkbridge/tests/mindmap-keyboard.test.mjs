import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigateMindmap,selectionAfterMindmapDelete} from '../src/core/mindmap-keyboard.mjs';

const topic=(id,x,y,children=[],extra={})=>({id,type:'MindmapNode',position:{x,y},width:80,height:32,
  data:{id,mindMapId:'map',childNodeIds:children,side:'right',...extra}});
const scene=[topic('root',0,100,['l','a','b','c'],{isRoot:true}),
  topic('l',-140,100,[],{side:'left'}),topic('a',140,40),
  topic('b',140,100,['b1','b2']),topic('c',140,160),
  topic('b1',280,80),topic('b2',280,120)];
test('directional structural selection and left/right center branches',()=>{
 assert.equal(navigateMindmap(scene,'root','left'),'l');
 assert.equal(navigateMindmap(scene,'root','right'),'a');
 assert.equal(navigateMindmap(scene,'l','right'),'root');
 assert.equal(navigateMindmap(scene,'b','up'),'a');
 assert.equal(navigateMindmap(scene,'b','down'),'c');
 assert.equal(navigateMindmap(scene,'b','right'),'b1');
 assert.equal(navigateMindmap(scene,'b2','left'),'b');
});
test('fallback skips hidden topics, other maps and whiteboard cards',()=>{
 const extra=[topic('hidden',420,80,[],{isVisible:false}),topic('foreign',420,80,[],{mindMapId:'other'}),
   {...topic('card',420,80),type:'NoteCard'}];
 assert.equal(navigateMindmap([...scene,...extra],'b1','right'),'b1');
 // No aligned candidate below b2: remain selected instead of leaving this map.
 assert.equal(navigateMindmap(scene,'b2','down'),'b2');
 assert.equal(navigateMindmap(scene.filter(n=>!['b1','b2'].includes(n.id)),'b','right'),'b');
});
test('delete continuation: previous, next, parent and multiple subtrees',()=>{
 const rows=scene.map(n=>({...n.data,id:n.id}));
 assert.deepEqual(selectionAfterMindmapDelete(rows,['b','b1','b2']),['a']);
 assert.deepEqual(selectionAfterMindmapDelete(rows,['l']),['a']);
 assert.deepEqual(selectionAfterMindmapDelete(rows,['l','a','b','b1','b2','c']),['root']);
 assert.deepEqual(selectionAfterMindmapDelete(rows,['b1','b2']),['b']);
 assert.deepEqual(selectionAfterMindmapDelete(rows,rows.map(n=>n.id)),[]);
 assert.deepEqual(selectionAfterMindmapDelete(rows,['a','b','b1','b2']),['l']);
});
