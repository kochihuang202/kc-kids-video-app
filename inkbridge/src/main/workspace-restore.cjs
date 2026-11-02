// Own snapshot-prototype restore adapted to Workspace/ + files/ with a durable
// startup rollback journal. Previous working directories are retained locally.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {inspectDatabase,hashFile}=require('./workspace-snapshots.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function exists(file){try{await fs.stat(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function writeAtomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp',h=await fs.open(temp,'wx');try{await h.writeFile(value);await h.sync();}finally{await h.close();}await fs.rename(temp,file);}
async function copyDurable(source,target){await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);const h=await fs.open(target,'r+');try{await h.sync();}finally{await h.close();}}
async function recoverRestore(local){
  const journal=path.join(local,'Profile','restore-journal.json');if(!await exists(journal))return;
  const state=JSON.parse(await fs.readFile(journal,'utf8'));if(!UUID.test(state.id)||!['switching','committed'].includes(state.phase))throw Error('還原日誌無效；請保留資料，勿重新初始化');
  const staging=path.join(local,'Restore-'+state.id);
  if(state.phase==='switching'){
    for(const name of ['Workspace','files']){
      const previous=path.join(staging,'previous',name),current=path.join(local,name);
      if(await exists(previous)){
        if(await exists(current))await fs.rename(current,path.join(staging,'interrupted-'+name+'-'+crypto.randomUUID()));
        await fs.rename(previous,current);
      }
    }
    const old=path.join(staging,'previous','snapshot-state.json'),settings=path.join(local,'Profile','snapshot-state.json');
    if(await exists(old))await writeAtomic(settings,await fs.readFile(old));
    else if(await exists(settings))await fs.rename(settings,path.join(staging,'interrupted-state-'+crypto.randomUUID()+'.json'));
  }
  await fs.rename(journal,path.join(staging,'restore-journal-'+crypto.randomUUID()+'.json'));
}
async function stageRestore({local,exchange,workspaceId,snapshotId,snapshots}){
  if(!UUID.test(workspaceId)||!UUID.test(snapshotId))throw Error('無效的快照 ID');
  const source=path.join(exchange,'snapshots',workspaceId,snapshotId),manifest=await snapshots.validate(exchange,source);
  if(manifest.workspaceId!==workspaceId)throw Error('工作區 ID 不一致');
  const id=crypto.randomUUID(),staging=path.join(local,'Restore-'+id);
  for(const name of ['Workspace','files','previous'])await fs.mkdir(path.join(staging,name),{recursive:true});
  const databaseFile=path.join(staging,'Workspace','inkbridge.sqlite3');await copyDurable(path.join(source,'database.sqlite3'),databaseFile);
  if(await hashFile(databaseFile)!==manifest.database.sha256)throw Error('還原資料庫複製驗證失敗');inspectDatabase(databaseFile);
  for(const asset of manifest.assets){const target=path.join(staging,asset.logicalPath);await copyDurable(path.join(exchange,asset.objectPath),target);if(await hashFile(target)!==asset.sha256)throw Error('還原附件複製驗證失敗');}
  const state=path.join(local,'Profile','snapshot-state.json');if(await exists(state))await copyDurable(state,path.join(staging,'previous','snapshot-state.json'));
  return {id,manifest};
}
async function switchRestore({local,staged,snapshots,fault=()=>{}}){
  const staging=path.join(local,'Restore-'+staged.id),journal=path.join(local,'Profile','restore-journal.json');
  await writeAtomic(journal,JSON.stringify({id:staged.id,phase:'switching'}));
  try{
    for(const name of ['Workspace','files']){
      const current=path.join(local,name);if(await exists(current))await fs.rename(current,path.join(staging,'previous',name));
      await fault('after-old-'+name);await fs.rename(path.join(staging,name),current);await fault('after-new-'+name);
    }
    await snapshots.adopt(staged.manifest);
    await writeAtomic(journal,JSON.stringify({id:staged.id,phase:'committed'}));
  }catch(error){await recoverRestore(local);throw error;}
  await recoverRestore(local); // archives committed journal, keeps rollback data
}
module.exports={recoverRestore,stageRestore,switchRestore};
