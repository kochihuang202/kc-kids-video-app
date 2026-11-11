// Local durable outbox over the already tested snapshot format/validator.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {createWorkspaceSnapshots,inspectDatabase,hashFile}=require('./workspace-snapshots.cjs');
const {json,exists,atomic,writeJSON,UUID}=require('./sync-files.cjs');
const {startupSnapshotStatus}=require('./startup-snapshot-status.cjs');
const {copyVerified}=require('./stream-files.cjs');
function createSyncSnapshots({localDirectory,database,getExchange,resolveAttachment,deviceName=os.hostname()}){
  const validator=createWorkspaceSnapshots({localDirectory,database,getExchange,resolveAttachment});
  const stateFile=path.join(localDirectory,'Profile/snapshot-state.json'),outbox=path.join(localDirectory,'Outbox');
  async function state(){const value=await json(stateFile,{deviceId:crypto.randomUUID(),heads:{}});if(!UUID.test(value.deviceId)||!value.heads)throw Error('本機快照狀態無效');return value;}
  const head=(s,id)=>s.heads[id]||s.heads[getExchange()+'|'+id];
  async function saveHead(m,adopted=false){const s=await state();const entry={snapshotId:m.snapshotId,revision:m.revision,createdAt:m.createdAt,sourceComputerName:m.sourceComputerName||'',sourceComputerId:m.sourceComputerId,adopted};s.heads[m.workspaceId]=entry;if(getExchange())s.heads[getExchange()+'|'+m.workspaceId]=entry;await writeJSON(stateFile,s);}
  async function status(){const graph=await database.summary(),s=await state(),h=head(s,graph.workspaceId);let published=false;if(getExchange()&&h){const receipt=await json(path.join(outbox,h.snapshotId,'published.json'),null);const legacyAdopted=h.adopted===undefined&&!await exists(path.join(outbox,h.snapshotId,'manifest.json'));const root=await fs.realpath(getExchange()).catch(()=>null);const dir=root&&path.join(root,'snapshots',graph.workspaceId,h.snapshotId);published=!!(dir&&(h.adopted||legacyAdopted||receipt?.root===root)&&await exists(path.join(dir,'manifest.json'))&&await exists(path.join(dir,'database.sqlite3')));}return {configured:!!getExchange(),workspaceId:graph.workspaceId,localRevision:graph.revision,baseSnapshotId:h?.snapshotId||null,baseRevision:h?.revision??null,createdAt:h?.createdAt||null,published};}
  async function publish(m,dir){
    const root=await fs.realpath(getExchange());
    async function target(relative){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});const real=await fs.realpath(path.dirname(file)),r=path.relative(root,real);if(r.startsWith('..')||path.isAbsolute(r))throw Error('交換區路徑越界');return file;}
    async function copy(source,relative,sha){const file=await target(relative);await copyVerified(source,file,{sha256:sha});}
    await fs.mkdir(path.join(root,'assets'),{recursive:true});
    for(const asset of m.assets)await copy(resolveAttachment(asset.fileId),asset.objectPath,asset.sha256);
    const relative=`snapshots/${m.workspaceId}/${m.snapshotId}`;
    await copy(path.join(dir,'database.sqlite3'),relative+'/database.sqlite3',m.database.sha256);
    const manifestFile=await target(relative+'/manifest.json');
    if(!await exists(manifestFile))await atomic(manifestFile,JSON.stringify(m,null,2));
    await validator.validate(root,path.join(root,relative));
    await writeJSON(path.join(dir,'published.json'),{root,completedAt:new Date().toISOString()});
  }
  async function flushOutbox(){let pending=0,lastError=null;await fs.mkdir(outbox,{recursive:true});
    const entries=[];for(const id of await fs.readdir(outbox)){if(!UUID.test(id))continue;const dir=path.join(outbox,id),m=await json(path.join(dir,'manifest.json'),null);if(m&&!await exists(path.join(dir,'published.json')))entries.push({dir,m});}
    const remaining=new Map(entries.map(e=>[e.m.snapshotId,e]));
    while(remaining.size){let progress=false;for(const [id,e] of remaining){if(remaining.has(e.m.parentSnapshotId))continue;try{if(!getExchange())throw Error('尚未設定交換資料夾');await publish(e.m,e.dir);remaining.delete(id);progress=true;}catch(error){lastError=error.message;}}
      if(!progress)break;
    }pending=remaining.size;return {pending,error:lastError};
  }
  async function create(reason='manual'){
    const graph=await database.summary(),s=await state(),h=head(s,graph.workspaceId);
    let m,created=false;
    if(h?.revision!==graph.revision){
      const snapshotId=crypto.randomUUID(),dir=path.join(outbox,snapshotId);await fs.mkdir(dir,{recursive:true});const candidate=path.join(dir,'database.sqlite3');
      await database.snapshot(candidate);const handle=await fs.open(candidate,'r+');try{await handle.sync();}finally{await handle.close();}
      const captured=inspectDatabase(candidate),assets=[];
      for(const f of captured.files){const source=resolveAttachment(f.id),sha256=await hashFile(source);if(sha256!==f.id||sha256!==f.sha256||(await fs.stat(source)).size!==f.size)throw Error('附件與資料庫不一致');assets.push({fileId:f.id,logicalPath:f.filePath,objectPath:`assets/${f.id.slice(0,2)}/${path.basename(source)}`,sha256,bytes:f.size});}
      m={format:'inkbridge-snapshot',version:1,workspaceId:captured.workspaceId,snapshotId,sourceComputerId:s.deviceId,sourceComputerName:deviceName,parentSnapshotId:h?.snapshotId||null,createdAt:new Date().toISOString(),appVersion:require('../../package.json').version,sqliteVersion:captured.sqliteVersion,revision:captured.revision,reason,summary:captured.summary,database:{path:'database.sqlite3',sha256:await hashFile(candidate),bytes:(await fs.stat(candidate)).size},assets};
      await writeJSON(path.join(dir,'manifest.json'),m);await saveHead(m);created=true;
    }
    const flushed=await flushOutbox(),current=m||h;
    return {configured:!!getExchange(),created,pending:flushed.pending,error:flushed.error,snapshotId:current?.snapshotId,workspaceId:graph.workspaceId,revision:m?.revision??h?.revision??graph.revision,createdAt:current?.createdAt};
  }
  async function index(){const root=getExchange();if(!root)return [];const base=path.join(root,'snapshots'),s=await state(),current=await database.summary(),rows=[];
    if(!await exists(base))return rows;
    for(const w of await fs.readdir(base,{withFileTypes:true})){if(!w.isDirectory()||!UUID.test(w.name))continue;
      for(const e of await fs.readdir(path.join(base,w.name),{withFileTypes:true})){if(!e.isDirectory()||!UUID.test(e.name))continue;
        let m;try{m=await json(path.join(base,w.name,e.name,'manifest.json'),null);if(!m||m.format!=='inkbridge-snapshot'||m.version!==1||m.workspaceId!==w.name||m.snapshotId!==e.name||!UUID.test(m.sourceComputerId)||m.parentSnapshotId!==null&&!UUID.test(m.parentSnapshotId))throw Error('版本資料尚未到齊');rows.push({workspaceId:w.name,snapshotId:e.name,manifest:m,integrity:'complete',relation:'unknown'});}catch(error){rows.push({workspaceId:w.name,snapshotId:e.name,integrity:'incomplete',error:error.message,relation:'unknown'});}
      }
    }
    const graph=new Map(rows.filter(r=>r.manifest).map(r=>[r.snapshotId,r.manifest]));
    function ancestors(id){const set=new Set();let complete=true;while(id){if(set.has(id)||!graph.has(id)){complete=false;break;}set.add(id);id=graph.get(id).parentSnapshotId;}return {set,complete};}
    for(const row of rows){if(!row.manifest)continue;const h=head(s,row.workspaceId),a=ancestors(row.snapshotId),b=ancestors(h?.snapshotId);row.relation=row.workspaceId!==current.workspaceId?'other-workspace':row.snapshotId===h?.snapshotId?'current':h&&a.set.has(h.snapshotId)?'newer':h&&b.set.has(row.snapshotId)?'ancestor':h?(a.complete&&b.complete?'branch':'unknown'):'unbased';}
    return rows;
  }
  async function startup(){if(!getExchange())return {configured:false,kind:'unconfigured'};const rows=await index(),graph=await database.summary(),s=await state();return {configured:true,...startupSnapshotStatus({rows:rows.filter(r=>r.workspaceId===graph.workspaceId),workspaceId:graph.workspaceId,localRevision:graph.revision,head:head(s,graph.workspaceId)})};}
  return {create,flushOutbox,index,startup,status,setDeviceName:name=>{deviceName=name;},validate:validator.validate,scan:validator.scan,adopt:m=>saveHead(m,true),async manifest(w,id){if(!UUID.test(w)||!UUID.test(id))throw Error('無效的版本');const dir=path.join(getExchange(),'snapshots',w,id),m=await validator.validate(getExchange(),dir);return {...m,summary:m.summary||inspectDatabase(path.join(dir,'database.sqlite3')).summary};}};
}
module.exports={createSyncSnapshots};
