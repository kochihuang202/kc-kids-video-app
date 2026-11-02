const {test}=require('node:test'),assert=require('node:assert/strict');
const {startSnapshotScheduler}=require('../src/main/snapshot-scheduler.cjs');
test('ten-minute scheduling skips unavailable/reentrant ticks and reports errors without stopping future attempts',async()=>{
  let tick,ready=false,calls=0,release,error,cleared=false;
  const stop=startSnapshotScheduler({ready:()=>ready,save:async()=>{calls++;await new Promise(r=>release=r);throw Error('offline');},onError:e=>error=e.message,setTimer:(callback,ms)=>{assert.equal(ms,600000);tick=callback;return 123;},clearTimer:id=>{assert.equal(id,123);cleared=true;}});
  await tick();assert.equal(calls,0);ready=true;const pending=tick();await tick();assert.equal(calls,1);release();await pending;assert.equal(error,'offline');
  const retry=tick();assert.equal(calls,2);release();await retry;stop();assert.equal(cleared,true);
});
