import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeProgress,sanitizePatch} from '../worker/progress.mjs';
test('progress merges chapters and attempts without losing earlier reading or help history',()=>{
 const old={chapter:1,readThrough:{0:40,1:10},anchors:{1:{block:9,offset:20}},attempts:{'s1:story:0':{tries:2,hints:1,correct:true}}};
 const next=mergeProgress(old,{chapter:2,readThrough:{0:3,2:20},anchors:{2:{block:12,offset:24}},attempts:{'s1:story:0':{tries:1,hints:0,correct:false},'s2:story:0':{tries:1,hints:0,correct:true}}});
 assert.equal(next.readThrough[0],40);assert.equal(next.readThrough[2],20);assert.ok(next.anchors[1]);
 assert.equal(next.attempts['s1:story:0'].hints,1);assert.equal(next.attempts['s1:story:0'].correct,true);
 assert.ok(next.attempts['s2:story:0'].correct);
});
test('cloud input is bounded, mode-specific and cannot inject arbitrary object keys',()=>{
 assert.throws(()=>sanitizePatch({chapter:99},'kiki','whisper'));
 assert.throws(()=>sanitizePatch({attempts:{'bogus':{tries:1}}},'kiki','practice'));
 assert.throws(()=>sanitizePatch(JSON.parse('{"__proto__":{"bad":true}}'),'kiki','whisper'));
 assert.deepEqual(sanitizePatch({chapter:8,bopo:false,anchors:{8:null}},'kiki','whisper'),{chapter:8,bopo:false,anchors:{8:null}});
});

test('one shared settings document accepts only reader preferences across books and modes',()=>{
 assert.deepEqual(sanitizePatch({bopo:false,size:2,words:false,rate:0.6},'reading','settings'),{bopo:false,size:2,words:false,rate:0.6});
 assert.throws(()=>sanitizePatch({chapter:1},'reading','settings'));
 assert.throws(()=>sanitizePatch({bopo:false},'kiki','settings'));
 assert.throws(()=>sanitizePatch({bopo:false},'reading','practice'));
});
test('cloud validates independently sized modes without rejecting the longer mode',()=>{
 const catalog={sample:{whisper:2,practice:3,scenes:[1,2,3].map((_,i)=>({id:'s'+(i+1),questions:3}))}};
 assert.deepEqual(sanitizePatch({scene:2,anchors:{2:{block:1,offset:80}}},'sample','practice',catalog),{scene:2,anchors:{2:{block:1,offset:80}}});
 assert.throws(()=>sanitizePatch({chapter:2},'sample','whisper',catalog));
 assert.throws(()=>sanitizePatch({scene:3},'sample','practice',catalog));
 assert.doesNotThrow(()=>sanitizePatch({attempts:{'s3:story:2':{tries:1}}},'sample','practice',catalog));
 assert.doesNotThrow(()=>sanitizePatch({attempts:{'s1:extra:1':{tries:2,revealed:true}}},'sample','practice',catalog));
});
test('approved four/five-question units save their actual current and completed positions',()=>{
 assert.doesNotThrow(()=>sanitizePatch({positions:{'s4:story':4},attempts:{'s4:story:4':{tries:1}}},'tata','practice'));
 assert.doesNotThrow(()=>sanitizePatch({positions:{'s4:story':5}},'tata','practice'));
 assert.doesNotThrow(()=>sanitizePatch({positions:{'s6:story':5}},'super-ya-revisit','practice'));
 assert.throws(()=>sanitizePatch({positions:{'s4:story':6}},'tata','practice'));
 assert.throws(()=>sanitizePatch({positions:{'s1:story':4}},'super-ya','practice'));
});
