import {test} from 'node:test';import assert from 'node:assert/strict';
import {PersistenceCoordinator} from '../src/core/persistence-coordinator.mjs';
import {serializeEditorState} from '../src/core/editor-state.mjs';
import {createEditor,$getRoot,$createParagraphNode,$createTextNode} from 'lexical';
test('public Lexical optional undefined fields normalize to JSON without losing Chinese text or rich formatting',()=>{
  const editor=createEditor({namespace:'serialization-regression',onError:error=>{throw error;}});
  editor.update(()=>{$getRoot().append($createParagraphNode().append($createTextNode('中文龍').toggleFormat('bold')));},{discrete:true});
  const state=editor.getEditorState(),document=serializeEditorState(state);
  assert.deepEqual(document,JSON.parse(JSON.stringify(state.toJSON())));
  const text=document.root.children[0].children[0];assert.equal(text.text,'中文龍');assert.equal(text.format,1);
  assert.equal(Object.hasOwn(document.root,'textFormat'),false);assert.equal(Object.hasOwn(document.root,'textStyle'),false);
});
test('flush waits for COMMIT ACK and also drains newer edits queued during a commit',async()=>{
  let release;const calls=[];const first=new Promise(resolve=>release=resolve);
  const coordinator=new PersistenceCoordinator({autoDelay:60000,commit:async request=>{calls.push(request);if(calls.length===1)await first;return {requestId:request.requestId,revision:calls.length};}});
  coordinator.stage({type:'putContent',data:{id:'a',body:'first'}});let complete=false;const flushed=coordinator.flush().then(()=>complete=true);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);coordinator.stage({type:'putContent',data:{id:'a',body:'newest'}});release();await flushed;
  assert.equal(calls.length,2);assert.equal(calls[1].baseRevision,1);assert.equal(calls[1].operations[0].data.body,'newest');assert.equal(coordinator.revision,2);coordinator.dispose();
});
test('failed commit keeps dirty data and never replaces newer draft with older batch',async()=>{
  let reject;const failure=new Promise((_,no)=>reject=no);let failing=true;
  const coordinator=new PersistenceCoordinator({autoDelay:60000,commit:request=>failing?failure:Promise.resolve({requestId:request.requestId,revision:1})});
  coordinator.stage({type:'putContent',data:{id:'a',body:'old'}});const saved=coordinator.flush();await new Promise(resolve=>setImmediate(resolve));
  coordinator.stage({type:'putContent',data:{id:'a',body:'new'}});reject(Error('disk failure'));await assert.rejects(saved,/disk failure/);
  assert.equal([...coordinator.pending.values()][0].data.body,'new');assert.equal(coordinator.revision,0);failing=false;await coordinator.flush();assert.equal(coordinator.pending.size,0);coordinator.dispose();
});
test('beforeFlush is awaited, not inferred from the autosave timer',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);let called=false;
  const coordinator=new PersistenceCoordinator({autoDelay:60000,beforeFlush:()=>gate,commit:async request=>{called=true;return {requestId:request.requestId,revision:1};}});
  coordinator.stage({type:'putContent',data:{id:'a'}});const save=coordinator.flush();await new Promise(resolve=>setImmediate(resolve));assert.equal(called,false);release();await save;assert.equal(called,true);coordinator.dispose();
});

test('overlapping flush callers cannot return an old ACK while a newer batch is uncommitted',async()=>{
  let releaseFirst,releaseSecond;const first=new Promise(resolve=>releaseFirst=resolve),second=new Promise(resolve=>releaseSecond=resolve);let calls=0;
  const coordinator=new PersistenceCoordinator({autoDelay:60000,commit:async request=>{const revision=++calls;await(revision===1?first:second);return {requestId:request.requestId,revision};}});
  try{
    coordinator.stage({type:'putContent',data:{id:'a',body:'first'}});const saveA=coordinator.flush();await new Promise(resolve=>setImmediate(resolve));
    coordinator.stage({type:'putContent',data:{id:'a',body:'latest'}});let doneB=false;const saveB=coordinator.flush().then(ack=>{doneB=true;return ack;});
    await new Promise(resolve=>setImmediate(resolve));releaseFirst();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,2);assert.equal(doneB,false,'second flush must wait for the latest real COMMIT');
    releaseSecond();assert.equal((await saveA).revision,2);assert.equal((await saveB).revision,2);
  }finally{releaseFirst();releaseSecond();coordinator.dispose();}
});
