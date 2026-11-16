// Stage real signed releases on isolated installations; never open user data.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createProgramUpdates}=require('../../src/main/program-updates.cjs');
(async()=>{
 const [exchangeArg,...bases]=process.argv.slice(2);if(!exchangeArg||!bases.length)throw Error('Usage: node check-release-deltas.cjs <exchange> <base-directory>...');
 const exchange=path.resolve(exchangeArg),root=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-release-deltas-')),results=[];
 for(const baseArg of bases){
  const source=path.resolve(baseArg),install=path.join(root,path.basename(source)),local=install+'-local';await fs.cp(source,install,{recursive:true});
  const before=JSON.parse(await fs.readFile(path.join(source,'portable-build.json')));let staged=false;
  const updates=createProgramUpdates({installRoot:install,localDirectory:local,getExchange:()=>exchange,portable:true,notify:()=>{},queue:{run:(_name,action)=>action()},prepareClose:async()=>{staged=true;throw Error('STAGING_VERIFIED');},exit:()=>{throw Error('must not exit');}});
  const candidate=await updates.check();assert(candidate&&!candidate.incomplete,'complete compatible signed update required');
  await assert.rejects(updates.apply(candidate.releaseId),/STAGING_VERIFIED/);assert(staged);
  assert.equal(JSON.parse(await fs.readFile(path.join(install,'portable-build.json'))).buildId,before.buildId);
  results.push({base:before.version,baseBuildId:before.buildId,target:candidate.targetVersion,releaseId:candidate.releaseId,signedPowerShellStage:true,baseUnchanged:true});
 }
 const receipt={root,results};await fs.writeFile(path.join(exchange,'stage-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
