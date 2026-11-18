// Local durable outbox over the already tested snapshot format/validator.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {createWorkspaceSnapshots,inspectDatabase,hashFile,isSnapshotAssetPath}=require('./workspace-snapshots.cjs');
const {json,exists,atomic,writeJSON,UUID}=require('./sync-files.cjs');
const {startupSnapshotStatus}=require('./startup-snapshot-status.cjs');
const {copyVerified}=require('./stream-files.cjs');
const {snapshotOrder}=require('./snapshot-order.cjs');
const {createLineage,ancestorsOf}=require('./snapshot-lineage.cjs');
const {snapshotContent,readProof,saveProof}=require('./snapshot-content.cjs');
const {createSnapshotRetention,readRetention,retainedAncestor,decidable,applyRetentionSuccessor}=require('./snapshot-retention.cjs');
function createSyncSnapshots({localDirectory,database,getExchange,resolveAttachment,deviceName=os.hostname()}){
  const validator=createWorkspaceSnapshots({localDirectory,database,getExchange,resolveAttachment});
  const stateFile=path.join(localDirectory,'Profile/snapshot-state.json'),outbox=path.join(localDirectory,'Outbox');
  const lineage=createLineage({localDirectory,getExchange});
  const comparedContent=new Map();
  const mergeState=require('./workspace-merge.cjs'),mergeBaseFile=path.join(localDirectory,'Profile/merge-bases.json');
  async function publishMergeBases(){
    const root=getExchange()&&await fs.realpath(getExchange()).catch(()=>null);if(!root)return;
    const entries=await json(mergeBaseFile,{}),s=await state();
    for(const [workspaceId,value]of Object.entries(entries))if(UUID.test(workspaceId)&&UUID.test(value.baseSnapshotId||'')&&UUID.test(value.headSnapshotId||'')){
      const file=path.join(root,'sync-devices',workspaceId,s.deviceId+'.json'),next={workspaceId,deviceId:s.deviceId,...value};
      try{if(mergeState.stable(await json(file,null))!==mergeState.stable(next))await writeJSON(file,next);}catch{}
    }
  }
  async function rememberMergeBase(m,adopted){
    const entries=await json(mergeBaseFile,{}),old=entries[m.workspaceId];
    entries[m.workspaceId]={baseSnapshotId:adopted?m.snapshotId:old?.baseSnapshotId||m.parentSnapshotId||m.snapshotId,headSnapshotId:m.snapshotId};
    await writeJSON(mergeBaseFile,entries);await publishMergeBases();
  }
  async function readMergeState(id){
    if(!UUID.test(id))throw Error('合併版本無效');const records=await lineage.records(),m=records.get(id);if(!m?.database)throw Error('缺少共同版本的完整資料，已保留雙方修改');
    for(const file of [getExchange()&&path.join(getExchange(),'snapshots',m.workspaceId,id,'database.sqlite3'),path.join(outbox,id,'database.sqlite3')].filter(Boolean)){
      if(!await exists(file))continue;const value=await mergeState.readVerifiedState(file,m.database);if(value.workspaceId!==m.workspaceId||value.revision!==m.revision)throw Error('合併版本與資料庫不一致');return {manifest:m,state:value,file};
    }throw Error('共同版本已被舊版清理，無法安全自動合併；雙方修改已保留');
  }
  async function copyMergeAssets(manifests,selected){
    const wanted=selected&&new Set(selected.map(f=>f.filePath));
    for(const m of manifests)for(const a of m.assets){if(wanted&&!wanted.has(a.logicalPath))continue;const target=path.join(localDirectory,a.logicalPath);if(!await exists(target))await copyVerified(path.join(getExchange(),a.objectPath),target,{sha256:a.sha256,bytes:a.bytes});}
  }
  async function prepareMerge({file,parentSnapshotIds}){
    if(!Array.isArray(parentSnapshotIds)||parentSnapshotIds.length<2||parentSnapshotIds.some(id=>!UUID.test(id)))throw Error('合併版本父節點無效');
    const captured=inspectDatabase(file),s=await state(),snapshotId=crypto.randomUUID(),dir=path.join(outbox,snapshotId),candidate=path.join(dir,'database.sqlite3');await fs.mkdir(dir,{recursive:true});
    await copyVerified(file,candidate,{sha256:await hashFile(file),bytes:(await fs.stat(file)).size});
    const assets=[];for(const f of captured.files){const source=resolveAttachment(f.id,f.filePath);if(f.sha256!==f.id||await hashFile(source)!==f.id||(await fs.stat(source)).size!==f.size)throw Error('合併附件與資料庫不一致');assets.push({fileId:f.id,logicalPath:f.filePath,objectPath:`assets/${f.id.slice(0,2)}/${path.basename(source)}`,sha256:f.id,bytes:f.size});}
    const m={format:'inkbridge-snapshot',version:1,workspaceId:captured.workspaceId,snapshotId,sourceComputerId:s.deviceId,sourceComputerName:deviceName,parentSnapshotId:parentSnapshotIds[0],parentSnapshotIds:[...new Set(parentSnapshotIds)],createdAt:new Date().toISOString(),appVersion:require('../../package.json').version,sqliteVersion:captured.sqliteVersion,revision:captured.revision,reason:'merge',mergeDigest:mergeState.stateDigest(mergeState.readState(candidate)),summary:captured.summary,database:{path:'database.sqlite3',sha256:await hashFile(candidate),bytes:(await fs.stat(candidate)).size},assets};
    const records=await lineage.records();for(const id of m.parentSnapshotIds){const parent=records.get(id);if(!parent||parent.workspaceId!==m.workspaceId)throw Error('合併父版本工作區不符');}
    const authorities=new Set(m.parentSnapshotIds.map(id=>records.get(id)?.authorityId||null));if(authorities.size!==1)throw Error('不能將指定版本前的備份自動合回目前內容');const authorityId=[...authorities][0];if(authorityId)m.authorityId=authorityId;
    await writeJSON(path.join(dir,'manifest.json'),m);await publish(m,dir);return m;
  }
  const retention=createSnapshotRetention({localDirectory,getExchange,index:()=>index(),head:async id=>head(await state(),id),remember:lineage.remember,markPruned:lineage.markPruned});
  async function state(){const value=await json(stateFile,{deviceId:crypto.randomUUID(),heads:{}});if(!UUID.test(value.deviceId)||!value.heads)throw Error('本機快照狀態無效');return value;}
  const head=(s,id)=>s.heads[id]||s.heads[getExchange()+'|'+id];
  async function saveHead(m,adopted=false){await lineage.remember(m);const s=await state();const entry={snapshotId:m.snapshotId,revision:m.revision,createdAt:m.createdAt,sourceComputerName:m.sourceComputerName||'',sourceComputerId:m.sourceComputerId,adopted,authorityId:m.authorityId||null};s.heads[m.workspaceId]=entry;if(getExchange())s.heads[getExchange()+'|'+m.workspaceId]=entry;await writeJSON(stateFile,s);await rememberMergeBase(m,adopted||m.isAuthoritative);}
  async function status(){const graph=await database.summary(),s=await state(),h=head(s,graph.workspaceId);let published=false;if(getExchange()&&h){const receipt=await json(path.join(outbox,h.snapshotId,'published.json'),null);const legacyAdopted=h.adopted===undefined&&!await exists(path.join(outbox,h.snapshotId,'manifest.json'));const root=await fs.realpath(getExchange()).catch(()=>null);const dir=root&&path.join(root,'snapshots',graph.workspaceId,h.snapshotId);published=!!(dir&&(h.adopted||legacyAdopted||receipt?.root===root)&&await exists(path.join(dir,'manifest.json'))&&await exists(path.join(dir,'database.sqlite3')));}return {configured:!!getExchange(),workspaceId:graph.workspaceId,localRevision:graph.revision,baseSnapshotId:h?.snapshotId||null,baseRevision:h?.revision??null,createdAt:h?.createdAt||null,authorityId:h?.authorityId||null,published};}
  async function publish(m,dir){
    const root=await fs.realpath(getExchange());
    await lineage.remember(m);
    async function target(relative){const file=path.join(root,relative);await fs.mkdir(path.dirname(file),{recursive:true});const real=await fs.realpath(path.dirname(file)),r=path.relative(root,real);if(r.startsWith('..')||path.isAbsolute(r))throw Error('交換區路徑越界');return file;}
    async function copy(source,relative,sha,bytes){const file=await target(relative);await copyVerified(source,file,{sha256:sha,bytes});}
    await fs.mkdir(path.join(root,'assets'),{recursive:true});
    for(const asset of m.assets)await copy(resolveAttachment(asset.fileId),asset.objectPath,asset.sha256,asset.bytes);
    const relative=`snapshots/${m.workspaceId}/${m.snapshotId}`;
    await copy(path.join(dir,'database.sqlite3'),relative+'/database.sqlite3',m.database.sha256,m.database.bytes);
    const manifestFile=await target(relative+'/manifest.json');
    if(!await exists(manifestFile))await atomic(manifestFile,JSON.stringify(m,null,2));
    await validator.validate(root,path.join(root,relative));
    await writeJSON(path.join(dir,'published.json'),{root,completedAt:new Date().toISOString()});
  }
  async function flushOutbox(){await publishMergeBases();let pending=0,lastError=null;await fs.mkdir(outbox,{recursive:true});
    const entries=[];const root=getExchange()&&await fs.realpath(getExchange()).catch(()=>null);
    for(const id of await fs.readdir(outbox)){if(!UUID.test(id))continue;const dir=path.join(outbox,id),m=await json(path.join(dir,'manifest.json'),null);if(!m)continue;
      await lineage.remember(m);
      const receipt=await json(path.join(dir,'published.json'),null),shared=root&&path.join(root,'snapshots',m.workspaceId,id);
      const missing=shared&&(!await exists(path.join(shared,'manifest.json'))||!await exists(path.join(shared,'database.sqlite3')));
      if(!receipt||missing&&!await lineage.pruned(m.workspaceId,id))entries.push({dir,m});
    }
    const remaining=new Map(entries.map(e=>[e.m.snapshotId,e]));
    // Checkpoints contain complete data. Metadata is already durable above, so
    // an unavailable old payload must not block publishing its complete child.
    while(remaining.size){let progress=false;for(const [id,e] of remaining){try{if(!getExchange())throw Error('尚未設定交換資料夾');await publish(e.m,e.dir);remaining.delete(id);progress=true;}catch(error){lastError=error.message;}}
      if(!progress)break;
    }pending=remaining.size;return {pending,error:lastError};
  }
  async function create(reason='manual',options={}){
    const graph=await database.summary(),s=await state(),h=head(s,graph.workspaceId);
    let m,created=false;
    if(options.force||h?.revision!==graph.revision){
      const snapshotId=crypto.randomUUID(),dir=path.join(outbox,snapshotId);await fs.mkdir(dir,{recursive:true});const candidate=path.join(dir,'database.sqlite3');
      await database.snapshot(candidate);const handle=await fs.open(candidate,'r+');try{await handle.sync();}finally{await handle.close();}
      const captured=inspectDatabase(candidate),assets=[];
      for(const f of captured.files){const source=resolveAttachment(f.id,f.filePath),sha256=await hashFile(source);if(sha256!==f.id||sha256!==f.sha256||(await fs.stat(source)).size!==f.size)throw Error('附件與資料庫不一致');assets.push({fileId:f.id,logicalPath:f.filePath,objectPath:`assets/${f.id.slice(0,2)}/${path.basename(source)}`,sha256,bytes:f.size});}
      const parentSnapshotId=options.parentSnapshotId===undefined?h?.snapshotId||null:options.parentSnapshotId;
      const parentSnapshotIds=[...new Set([parentSnapshotId,...(options.resolvedSnapshotIds||[])].filter(Boolean))];if(parentSnapshotIds.some(id=>!UUID.test(id)))throw Error('保存版本父節點無效');
      m={format:'inkbridge-snapshot',version:1,workspaceId:captured.workspaceId,snapshotId,sourceComputerId:s.deviceId,sourceComputerName:deviceName,parentSnapshotId,parentSnapshotIds,restoredFromSnapshotId:options.restoredFromSnapshotId||undefined,createdAt:new Date().toISOString(),appVersion:require('../../package.json').version,sqliteVersion:captured.sqliteVersion,revision:captured.revision,reason,summary:captured.summary,database:{path:'database.sqlite3',sha256:await hashFile(candidate),bytes:(await fs.stat(candidate)).size},assets};
      const authorityId=options.authorityId===undefined?h?.authorityId:options.authorityId;if(authorityId!=null&&!UUID.test(authorityId))throw Error('指定版本身分無效');if(options.authoritative){m.authorityId=snapshotId;m.isAuthoritative=true;}else if(authorityId)m.authorityId=authorityId;
      await writeJSON(path.join(dir,'manifest.json'),m);await saveHead(m);created=true;
    }
    const flushed=await flushOutbox(),current=m||h;
    // Retention never fails a save; it skips itself while anything is incomplete.
    if(created&&!flushed.pending)await retention.prune({workspaceId:graph.workspaceId}).catch(error=>console.error('Snapshot retention skipped:',error.message));
    return {configured:!!getExchange(),created,pending:flushed.pending,error:flushed.error,snapshotId:current?.snapshotId,workspaceId:graph.workspaceId,revision:m?.revision??h?.revision??graph.revision,createdAt:current?.createdAt};
  }
  async function index(){const root=getExchange();if(!root)return [];const base=path.join(root,'snapshots'),s=await state(),current=await database.summary(),rows=[];
    for(const w of await fs.readdir(base,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!w.isDirectory()||!UUID.test(w.name))continue;
      for(const e of await fs.readdir(path.join(base,w.name),{withFileTypes:true})){if(!e.isDirectory()||!UUID.test(e.name))continue;
        let m;try{m=await json(path.join(base,w.name,e.name,'manifest.json'),null);if(!m||m.format!=='inkbridge-snapshot'||m.version!==1||m.workspaceId!==w.name||m.snapshotId!==e.name||!UUID.test(m.sourceComputerId)||m.parentSnapshotId!==null&&!UUID.test(m.parentSnapshotId))throw Error('版本資料尚未到齊');
          await lineage.remember(m);const available=await payloadAvailable(m);rows.push({workspaceId:w.name,snapshotId:e.name,manifest:m,integrity:available?'complete':'incomplete',verification:'pending',relation:'unknown',...(!available?{error:'資料庫或附件尚未完整到齊'}:{})});
        }catch(error){rows.push({workspaceId:w.name,snapshotId:e.name,integrity:'incomplete',error:error.message,relation:'unknown'});}
      }
    }
    // An old, already-published local checkpoint can restore metadata that was
    // pruned by the legacy implementation. Never infer an edge from its date.
    for(const id of await fs.readdir(outbox).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!UUID.test(id))continue;const m=await json(path.join(outbox,id,'manifest.json'),null);if(m?.format==='inkbridge-snapshot'&&UUID.test(m.sourceComputerId||'')&&Number.isFinite(Date.parse(m.createdAt)))await lineage.remember(m);}
    return decorate(rows,current,s);
  }
  async function payloadAvailable(m){
    const root=getExchange();if(!root)return false;
    const size=async(file,expected)=>{try{const stat=await fs.stat(file);return stat.isFile()&&(expected===undefined||stat.size===expected);}catch{return false;}};
    if(!await size(path.join(root,'snapshots',m.workspaceId,m.snapshotId,'database.sqlite3'),m.database?.bytes))return false;
    for(const a of m.assets||[]){if(!isSnapshotAssetPath(a.objectPath)||!await size(path.join(root,a.objectPath),a.bytes))return false;}
    return true;
  }
  async function decorate(input,current,s){
    s=s||await state();current=current||await database.summary();const rows=input.map(r=>({...r})),byId=new Map(rows.map(r=>[r.snapshotId,r]));
    const records=await lineage.records();for(const row of rows)if(row.manifest){await lineage.remember(row.manifest);records.set(row.snapshotId,row.manifest);}
    for(const [id,m]of records){if(byId.has(id))continue;const discarded=await lineage.pruned(m.workspaceId,id);const row={workspaceId:m.workspaceId,snapshotId:id,manifest:m,metadataOnly:true,integrity:discarded?'history':'incomplete',verification:'metadata',relation:'unknown',...(!discarded?{error:'完整資料尚未到齊；版本關係已保留'}:{})};rows.push(row);byId.set(id,row);}
    const graph=new Map([...records]),kept=new Map();for(const id of new Set(rows.map(r=>r.workspaceId)))kept.set(id,await readRetention(getExchange(),id));
    const aliases=new Map(),ancestors=id=>ancestorsOf(new Map([...graph].map(([id,m])=>[id,{...m,parentSnapshotIds:(m.parentSnapshotIds||[m.parentSnapshotId]).filter(Boolean).map(canonical)}])),canonical(id));
    async function digest(m){const key=m.database?.sha256;if(!key)throw Error('No comparison hash');if(!comparedContent.has(key))comparedContent.set(key,await snapshotContent(path.join(getExchange(),'snapshots',m.workspaceId,m.snapshotId,'database.sqlite3'),m.database));return comparedContent.get(key);}
    // Only a restore of the same or a *successor* version is a mistaken join.
    // A deliberate rollback to an ancestor remains a real forward edit.
    const canonical=id=>{const seen=new Set();while(aliases.has(id)&&!seen.has(id)){seen.add(id);id=aliases.get(id);}return id;};
    const mergeGroups=new Map();for(const row of rows){const m=row.manifest;if(!m?.mergeDigest||!m.parentSnapshotIds?.length)continue;const key=m.workspaceId+'|'+[...m.parentSnapshotIds].sort().join(',')+'|'+m.mergeDigest;const group=mergeGroups.get(key)||[];group.push(row);mergeGroups.set(key,group);}
    for(const group of mergeGroups.values()){group.sort((a,b)=>a.snapshotId.localeCompare(b.snapshotId));const source=group[0].manifest;for(const row of group.slice(1)){const m=row.manifest;try{let proven=await readProof(getExchange(),m,source);if(!proven){const a=await readMergeState(m.snapshotId),b=await readMergeState(source.snapshotId);proven=mergeState.stateDigest(a.state)===m.mergeDigest&&mergeState.stateDigest(b.state)===m.mergeDigest;if(proven)await saveProof(getExchange(),m,source,m.mergeDigest).catch(()=>{});}if(proven){aliases.set(m.snapshotId,source.snapshotId);row.equivalentTo=source.snapshotId;}}catch{}}}
    for(let pass=0;pass<rows.length;pass++){let added=false;
      for(const row of rows){const m=row.manifest,source=m&&graph.get(m.restoredFromSnapshotId);if(!source||source.snapshotId===m.snapshotId||aliases.has(m.snapshotId)||source.workspaceId!==m.workspaceId||!m.parentSnapshotId||!ancestors(canonical(source.snapshotId)).set.has(canonical(m.parentSnapshotId)))continue;
        try{const root=getExchange();let proven=await readProof(root,m,source);if(!proven){const content=await digest(m);proven=content===await digest(source);if(proven)await saveProof(root,m,source,content);}if(proven){aliases.set(m.snapshotId,source.snapshotId);row.equivalentTo=source.snapshotId;added=true;}}catch{/* Missing or corrupt proof never authorises replacing content. */}
      }if(!added)break;
    }
    for(const row of rows){if(!row.manifest)continue;const h=head(s,row.workspaceId),base=canonical(h?.snapshotId),a=ancestors(row.snapshotId),b=ancestors(base);row.relation=row.workspaceId!==current.workspaceId?'other-workspace':aliases.has(row.snapshotId)?'equivalent':row.snapshotId===base?'current':h&&a.set.has(base)?'newer':h&&b.set.has(row.snapshotId)?'ancestor':h&&retainedAncestor(kept.get(row.workspaceId),row.snapshotId,base,ancestors,graph)?'ancestor':h?(decidable(a,kept.get(row.workspaceId))&&decidable(b,kept.get(row.workspaceId))?'branch':'unknown'):'unbased';}
    applyRetentionSuccessor(rows.filter(r=>r.workspaceId===current.workspaceId),kept.get(current.workspaceId),head(s,current.workspaceId)?.snapshotId,ancestors,graph);
    const authorities=require('./snapshot-authority.cjs').authorityHeads(rows.filter(r=>r.workspaceId===current.workspaceId)).heads,h=head(s,current.workspaceId);if(authorities.length===1&&h?.authorityId===authorities[0].snapshotId)for(const row of rows)if(row.workspaceId===current.workspaceId&&row.manifest&&(row.manifest.authorityId||null)!==h.authorityId)row.relation='authority-backup';
    return rows.sort(snapshotOrder);
  }
  async function describe(rows,current){const graph=current||await database.summary(),s=await state();return {configured:!!getExchange(),...startupSnapshotStatus({rows:rows.filter(r=>r.workspaceId===graph.workspaceId),workspaceId:graph.workspaceId,localRevision:graph.revision,head:head(s,graph.workspaceId)})};}
  async function scan({verify=false}={}){const rows=await index();if(!verify)return rows;const validated=await validator.scan();return decorate(validated,await database.summary());}
  async function startup(){if(!getExchange())return {configured:false,kind:'unconfigured'};const rows=await index(),graph=await database.summary(),s=await state();return {configured:true,...startupSnapshotStatus({rows:rows.filter(r=>r.workspaceId===graph.workspaceId),workspaceId:graph.workspaceId,localRevision:graph.revision,head:head(s,graph.workspaceId)})};}
  return {create,flushOutbox,index,startup,status,describe,decorate,readMergeState,prepareMerge,copyMergeAssets,prune:options=>retention.prune(options),setDeviceName:name=>{deviceName=name;},validate:validator.validate,scan,adopt:m=>saveHead(m,true),async manifest(w,id){if(!UUID.test(w)||!UUID.test(id))throw Error('無效的版本');const dir=path.join(getExchange(),'snapshots',w,id),m=await validator.validate(getExchange(),dir);return {...m,summary:m.summary||inspectDatabase(path.join(dir,'database.sqlite3')).summary};}};
}
module.exports={createSyncSnapshots};
