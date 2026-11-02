// Adapted from our snapshot-prototype.cjs: immutable CAS, UUID branches,
// manifest-last publication, integrity validation, local-only ancestry state.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function hashFile(file){const hash=crypto.createHash('sha256');for await(const bytes of require('node:fs').createReadStream(file))hash.update(bytes);return hash.digest('hex');}
async function durable(file,bytes){const handle=await fs.open(file,'wx');try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}
async function readJSON(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
function inspectDatabase(file){const db=new DatabaseSync(file,{readOnly:true});try{
  if(db.prepare('PRAGMA application_id').get().application_id!==0x494e4b42||db.prepare('PRAGMA user_version').get().user_version!==1)throw Error('不支援的 InkBridge 資料庫');
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('快照資料庫完整性驗證失敗');
  const meta=key=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
  const files=db.prepare("SELECT value FROM meta WHERE key LIKE 'file:%' ORDER BY key").all().map(row=>JSON.parse(row.value));
  const registered=new Set(files.map(file=>file.id));
  for(const row of [...db.prepare('SELECT document_json AS value FROM contents WHERE document_json IS NOT NULL').all(),...db.prepare('SELECT value FROM meta').all()]){
    for(const match of row.value.matchAll(/flexnote:\/\/file\/([a-f0-9]{64})/g))if(!registered.has(match[1]))throw Error('內容引用的附件缺少 catalog 記錄，拒絕不完整快照');
  }
  return {workspaceId:meta('workspaceId'),revision:Number(meta('revision')),files,sqliteVersion:db.prepare('SELECT sqlite_version() AS v').get().v};
}finally{db.close();}}
function createWorkspaceSnapshots({localDirectory,database,getExchange,resolveAttachment,appVersion='0.4.0',fault=()=>{}}){
  let pending;
  const stateFile=path.join(localDirectory,'Profile','snapshot-state.json');
  async function writeState(value){const temp=stateFile+'.'+crypto.randomUUID()+'.tmp';await durable(temp,JSON.stringify(value,null,2));await fs.rename(temp,stateFile);}
  async function identity(){let state=await readJSON(stateFile,null);if(!state){state={deviceId:crypto.randomUUID(),heads:{}};await writeState(state);}if(!UUID.test(state.deviceId)||!state.heads||typeof state.heads!=='object')throw Error('快照本機狀態無效');return state;}
  async function validate(root,directory){
    const m=await readJSON(path.join(directory,'manifest.json'),null);
    if(!m||m.format!=='inkbridge-snapshot'||m.version!==1||!UUID.test(m.snapshotId)||!UUID.test(m.workspaceId)||!UUID.test(m.sourceComputerId)||m.parentSnapshotId!==null&&!UUID.test(m.parentSnapshotId)||m.parentSnapshotId===m.snapshotId||!Array.isArray(m.assets)||!Number.isFinite(Date.parse(m.createdAt)))throw Error('快照 Manifest 無效或尚未到齊');
    if(path.basename(directory)!==m.snapshotId||m.database.path!=='database.sqlite3')throw Error('快照路徑無效');
    async function verify(file,entry){if(!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||(await fs.stat(file)).size!==entry.bytes||await hashFile(file)!==entry.sha256)throw Error('檔案未完整下載或完整性驗證失敗');}
    await verify(path.join(directory,'database.sqlite3'),m.database);
    const db=inspectDatabase(path.join(directory,'database.sqlite3'));
    if(db.workspaceId!==m.workspaceId||db.revision!==m.revision||m.assets.length!==db.files.length)throw Error('資料庫與附件清單不一致');
    for(let i=0;i<db.files.length;i++){
      const f=db.files[i],a=m.assets[i];
      if(!/^[a-f0-9]{64}$/.test(f.id)||a.fileId!==f.id||a.sha256!==f.id||a.logicalPath!==f.filePath||a.bytes!==f.size||!new RegExp(`^assets/${f.id.slice(0,2)}/${f.id}\\.(png|jpg|gif|webp|bmp|pdf)$`).test(a.objectPath)||a.logicalPath!==`files/${path.basename(a.objectPath)}`)throw Error('附件引用無效');
      await verify(path.join(root,a.objectPath),a);
    }
    return m;
  }
  async function publish(reason){
    const exchange=getExchange();if(!exchange)return {configured:false,created:false};
    const root=await fs.realpath(exchange),state=await identity();
    async function directory(relative){const target=path.join(root,relative);await fs.mkdir(target,{recursive:true});const real=await fs.realpath(target),r=path.relative(root,real);if(r.startsWith('..')||path.isAbsolute(r))throw Error('交換區目錄越界');return target;}
    await directory('snapshots');await directory('assets');
    const stagingRoot=path.join(localDirectory,'SnapshotStaging');await fs.mkdir(stagingRoot,{recursive:true});
    const id=crypto.randomUUID(),staging=path.join(stagingRoot,id);await fs.mkdir(staging);
    try{
      const candidate=path.join(staging,'database.sqlite3');await database.snapshot(candidate);
      const handle=await fs.open(candidate,'r+');try{await handle.sync();}finally{await handle.close();}
      const captured=inspectDatabase(candidate),key=root+'|'+captured.workspaceId,head=state.heads[key];
      // Only committed application revisions determine changes, never mtimes.
      if(head?.revision===captured.revision){await validate(root,path.join(root,'snapshots',captured.workspaceId,head.snapshotId));return {configured:true,created:false,snapshotId:head.snapshotId};}
      const assets=[];
      for(const file of captured.files){
        const source=resolveAttachment(file.id),bytes=await fs.readFile(source),hash=digest(bytes);
        if(hash!==file.id||file.sha256!==hash||bytes.length!==file.size)throw Error('附件內容與資料庫不一致');
        const objectPath=`assets/${hash.slice(0,2)}/${hash}${path.extname(source)}`,target=path.join(root,objectPath);await directory(path.dirname(objectPath));
        try{await fs.access(target);}catch(e){
          if(e.code!=='ENOENT')throw e;
          const temporary=target+'.pending-'+crypto.randomUUID();
          try{await durable(temporary,bytes);await fs.rename(temporary,target);}finally{await fs.rm(temporary,{force:true});}
        }
        if(await hashFile(target)!==hash)throw Error('交換區附件不完整；保留既有版本，請修復後重試');
        assets.push({fileId:file.id,logicalPath:file.filePath,objectPath,sha256:hash,bytes:bytes.length});
      }
      await fault('after-assets');
      const parentSnapshotId=head?.snapshotId||null;
      const manifest={format:'inkbridge-snapshot',version:1,workspaceId:captured.workspaceId,snapshotId:id,sourceComputerId:state.deviceId,parentSnapshotId,createdAt:new Date().toISOString(),appVersion,sqliteVersion:captured.sqliteVersion,revision:captured.revision,reason,database:{path:'database.sqlite3',sha256:await hashFile(candidate),bytes:(await fs.stat(candidate)).size},assets};
      await directory(path.join('snapshots',captured.workspaceId));
      const destination=path.join(root,'snapshots',captured.workspaceId,id);await fs.mkdir(destination);
      await durable(path.join(destination,'database.sqlite3'),await fs.readFile(candidate));await fault('after-database');
      await durable(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
      await validate(root,destination);await fault('before-state');
      state.heads[key]={snapshotId:id,revision:captured.revision};await writeState(state);
      return {configured:true,created:true,snapshotId:id,revision:captured.revision};
    }finally{await fs.rm(staging,{recursive:true,force:true});}
  }
  async function scan(){
    const exchange=getExchange();if(!exchange)return [];
    const root=await fs.realpath(exchange),state=await identity(),current=await database.load(),base=path.join(root,'snapshots'),rows=[];
    let workspaces;try{workspaces=await fs.readdir(base);}catch(e){if(e.code==='ENOENT')return [];throw e;}
    for(const workspaceId of workspaces.filter(id=>UUID.test(id))){
      for(const snapshotId of (await fs.readdir(path.join(base,workspaceId))).filter(id=>UUID.test(id))){
        const row={workspaceId,snapshotId,integrity:'incomplete',relation:'unknown'};
        try{row.manifest=await validate(root,path.join(base,workspaceId,snapshotId));if(row.manifest.workspaceId!==workspaceId)throw Error('工作區路徑不一致');row.integrity='complete';}catch(e){row.error=e.message;}
        rows.push(row);
      }
    }
    const graph=new Map(rows.filter(r=>r.integrity==='complete').map(r=>[r.snapshotId,r.manifest]));
    const ancestors=id=>{const set=new Set();let complete=true;while(id){if(set.has(id)||!graph.has(id)){complete=false;break;}set.add(id);id=graph.get(id).parentSnapshotId;}return {set,complete};};
    for(const row of rows){if(row.integrity!=='complete')continue;
      const head=state.heads[root+'|'+row.workspaceId]?.snapshotId;
      const a=ancestors(row.snapshotId),b=ancestors(head);
      row.relation=row.workspaceId!==current.workspaceId?'other-workspace':row.snapshotId===head?'current':head&&a.set.has(head)?'newer':head&&b.set.has(row.snapshotId)?'ancestor':head?(a.complete&&b.complete?'branch':'unknown'):'unbased';
    }
    return rows;
  }
  async function adopt(manifest){const root=await fs.realpath(getExchange()),state=await identity();state.heads[root+'|'+manifest.workspaceId]={snapshotId:manifest.snapshotId,revision:manifest.revision};await writeState(state);}
  return {validate,scan,adopt,create(reason='manual'){if(pending)return pending;pending=publish(reason).finally(()=>{pending=null;});return pending;}};
}
module.exports={createWorkspaceSnapshots,inspectDatabase,hashFile};
