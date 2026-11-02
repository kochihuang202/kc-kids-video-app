const {test}=require('node:test'),assert=require('node:assert/strict');
const {startupSnapshotStatus:status}=require('../src/main/startup-snapshot-status.cjs');
const row=(id,parent,relation='newer',workspaceId='W')=>({snapshotId:id,workspaceId,integrity:'complete',relation,manifest:{parentSnapshotId:parent,createdAt:'2000-01-01',sourceComputerId:'B'}});
const run=rows=>status({rows,workspaceId:'W',localRevision:5,head:{snapshotId:'V1',revision:5}});
test('startup recommends only the descendant tip, regardless of dates or order',()=>{
  const v2=row('V2','V1'),v3=row('V3','V2');v2.manifest.createdAt='2099-01-01';
  const result=run([v3,row('V1',null,'current'),v2]);assert.equal(result.kind,'newer');assert.equal(result.candidate.snapshotId,'V3');assert.equal(result.hasLocalChanges,false);
});
test('siblings and independent branches require choice, not time based winner',()=>{
  for(const rows of [[row('A','V1'),row('B','V1')],[row('A','V1'),row('B','V0','branch')]]){const result=run(rows);assert.equal(result.kind,'branches');assert.equal(result.candidate,null);}
});
test('unknown ancestry, foreign workspace and incomplete arrivals cannot become a recommended version',()=>{
  assert.equal(run([row('A','missing','unknown')]).kind,'unknown');
  assert.equal(run([row('A',null,'other-workspace','OTHER')]).kind,'other-workspace');
  const result=run([{snapshotId:'bad',workspaceId:'W',integrity:'incomplete'}]);assert.equal(result.kind,'incomplete');assert.equal(result.candidate,null);
});
test('no newer version stays quiet and local edits remain explicit',()=>{
  assert.equal(run([row('V1',null,'current'),row('V0',null,'ancestor')]).kind,'current');
  const result=status({rows:[row('V2','V1')],workspaceId:'W',localRevision:6,head:{snapshotId:'V1',revision:5}});assert.equal(result.hasLocalChanges,true);assert.equal(result.kind,'newer');
});
