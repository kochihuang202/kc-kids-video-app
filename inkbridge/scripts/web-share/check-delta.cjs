// Verify the actual signed release packages against isolated copies of both
// supported bases. Stop at prepareClose: no running app or formal data touched.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createProgramUpdates}=require('../../src/main/program-updates.cjs');
(async()=>{
 const project=path.resolve(__dirname,'../..'),exchange=path.join(project,'release/share-updates'),root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-share-deltas-')),results=[];
 for(const name of ['InkBridge-0.5.14-42f74fdf6d65-18b8c0','InkBridge-0.5.15-7daf875a137c-f07a27']){
  const source=path.join(project,'release',name),install=path.join(root,name),local=path.join(root,name+'-local');await fs.cp(source,install,{recursive:true});let staged=false;
  const updates=createProgramUpdates({installRoot:install,localDirectory:local,getExchange:()=>exchange,portable:true,notify:()=>{},queue:{run:(_name,action)=>action()},prepareClose:async()=>{staged=true;throw Error('STAGING_VERIFIED');},exit:()=>{throw Error('must not exit');}});
  const candidate=await updates.check();assert.equal(candidate.targetVersion,'0.6.0');await assert.rejects(updates.apply(candidate.releaseId),/STAGING_VERIFIED/);assert(staged);
  const before=JSON.parse(await fs.readFile(path.join(source,'portable-build.json'))),after=JSON.parse(await fs.readFile(path.join(install,'portable-build.json')));assert.equal(before.buildId,after.buildId);results.push({base:before.version,target:'0.6.0',signedStage:true,baseUnchanged:true});
 }
 console.log(JSON.stringify({data:root,results}));
})().catch(e=>{console.error(e);process.exitCode=1;});
