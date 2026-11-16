const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {json,writeJSON}=require('./sync-files.cjs');
const {readRetention}=require('./snapshot-retention.cjs');
const {snapshotOrder}=require('./snapshot-order.cjs');
const parentsOf=m=>m?.parentSnapshotIds||[m?.parentSnapshotId];
function payloadTips(rows){
  const graph=new Map(rows.filter(r=>r.manifest).map(r=>[r.snapshotId,r.manifest])),ancestors=new Set();
  const candidates=rows.filter(r=>r.manifest&&!r.metadataOnly&&r.integrity==='complete');
  for(const row of candidates){const todo=[...parentsOf(row.manifest)],seen=new Set();while(todo.length){const id=todo.pop();if(!id||seen.has(id))continue;seen.add(id);ancestors.add(id);if(graph.has(id))todo.push(...parentsOf(graph.get(id)));}}
  return candidates.filter(r=>!ancestors.has(r.snapshotId)).sort(snapshotOrder);
}
function installLiveSync({app,powerMonitor,windows,localDirectory,database,snapshots,getExchange,queue,notify,swap,startupStatus,save,canRun}){
  const settingsFile=path.join(localDirectory,'Profile','sync-settings.json'),deviceFile=path.join(localDirectory,'Profile','device-state.json');
  let settings={},device={},watcher,timer,debounce,initial=true,epoch=0,checking=null,offline=false,deviceTail=Promise.resolve();
  const ready=new Map(),waiting=new Map();
  async function init(){settings=await json(settingsFile,{});device=await json(deviceFile,{});if(settings.computerName)snapshots.setDeviceName(settings.computerName);watch();}
  function watch(){watcher?.close();watcher=null;try{if(getExchange())watcher=fs.watch(getExchange(),{recursive:true},()=>{if(debounce)return;debounce=setTimeout(()=>{debounce=null;notify({key:'snapshot-list-changed',state:'clear'});check().catch(()=>{});},500);});watcher?.on('error',()=>{});}catch{}}
  function markedReady(id){ready.set(id,epoch);const row=waiting.get(id);if(row){clearTimeout(row.timer);waiting.delete(id);row.resolve();}}
  function awaitReady(win){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(win.webContents.id);reject(Error('工作區畫面未完成初始化'));},30000);waiting.set(win.webContents.id,{resolve,reject,timer});});}
  function assertEpoch(value){if(value!==epoch)throw Object.assign(Error('舊工作區的操作已取消；資料未覆寫'),{code:'STALE_WORKSPACE_EPOCH'});}
  function bind(id){settings.workspaceId=id;settings.resolvedHeads=[];return writeJSON(settingsFile,settings);}
  async function inspect(){
    if(!getExchange())return {kind:'unconfigured'};
    await snapshots.flushOutbox();
    const rows=await snapshots.index(),current=await database.summary(),ids=[...new Set(rows.filter(r=>r.manifest).map(r=>r.workspaceId))];
    if(!settings.workspaceId){
      if(ids.length===0||ids.length===1&&ids[0]===current.workspaceId){await bind(current.workspaceId);}
      else{const workspaces=[];for(const id of ids){const group=rows.filter(r=>r.workspaceId===id&&r.manifest),versions=[],retention=await readRetention(getExchange(),id),anchorPresent=retention&&group.some(r=>r.snapshotId===retention.anchor);for(const row of payloadTips(group).filter(r=>!(anchorPresent&&retention.ancestors.has(r.snapshotId)))){try{const m=await snapshots.manifest(id,row.snapshotId);versions.push({snapshotId:m.snapshotId,...m.summary,createdAt:m.createdAt,sourceComputerName:m.sourceComputerName||'另一台電腦',revision:m.revision});}catch{}}workspaces.push({workspaceId:id,local:id===current.workspaceId,versions});}return {kind:'pairing',workspaces};}
    }
    if(settings.workspaceId!==current.workspaceId)return {kind:'pairing',workspaces:[]};
    const ignored=new Set(settings.resolvedHeads||[]);
    // Ignore only acknowledged side branches, including their ancestors.
    const byId=new Map(rows.filter(r=>r.manifest).map(r=>[r.snapshotId,r]));
    for(const id of [...ignored]){const todo=[...parentsOf(byId.get(id)?.manifest)];while(todo.length){const p=todo.pop();if(!p||ignored.has(p)||!byId.has(p))continue;if(['current','ancestor'].includes(byId.get(p).relation))continue;ignored.add(p);todo.push(...parentsOf(byId.get(p).manifest));}}
    const activeRows=rows.filter(r=>r.workspaceId===current.workspaceId&&r.manifest&&r.relation!=='superseded'&&!ignored.has(r.snapshotId));
    const status=await startupStatus(activeRows,current);
    if(status.kind==='newer'){
      const m=await snapshots.manifest(status.candidate.workspaceId,status.candidate.snapshotId).catch(error=>{return {error:error.message};});
      if(m.error)return {...status,kind:'incomplete',error:m.error};
      status.candidate.manifest=m;
    }
    if(['branches','unknown'].includes(status.kind)||status.kind==='newer'&&status.hasLocalChanges)status.versions=payloadTips(activeRows).map(r=>({workspaceId:r.workspaceId,snapshotId:r.snapshotId,...r.manifest.summary,createdAt:r.manifest.createdAt,sourceComputerName:r.manifest.sourceComputerName||'另一台電腦'}));
    return status;
  }
  async function apply(candidate,automatic,restoreSelected=false){
    const m=candidate.manifest||await snapshots.manifest(candidate.workspaceId,candidate.snapshotId);
    const before=await snapshots.status();
    if(candidate.pair&&m.workspaceId===before.workspaceId){await bind(m.workspaceId);return {kind:'ready'};}
    let saved,currentParent,restoreParents=[];
    try{
      if(!initial){await windows.pause();const after=await snapshots.status();if(automatic&&after.localRevision!==after.baseRevision){await windows.resume();return {kind:'conflict',hasLocalChanges:true};}
        if(restoreSelected&&after.workspaceId===m.workspaceId&&after.localRevision===after.baseRevision){const selected=(await snapshots.index()).find(r=>r.snapshotId===m.snapshotId);if(selected&&['current','newer','equivalent'].includes(selected.relation))restoreSelected=false;}
        saved=await save(restoreSelected?'before-restore':'before-load',true);
      }else if(!automatic){if(restoreSelected&&before.workspaceId===m.workspaceId&&before.localRevision===before.baseRevision){const selected=(await snapshots.index()).find(r=>r.snapshotId===m.snapshotId);if(selected&&['current','newer','equivalent'].includes(selected.relation))restoreSelected=false;}saved=await save('before-join',true);}
      if(restoreSelected){const status=await snapshots.status();currentParent=status.workspaceId===m.workspaceId?status.baseSnapshotId:m.snapshotId;restoreParents=payloadTips((await snapshots.index()).filter(r=>r.workspaceId===m.workspaceId)).map(r=>r.snapshotId).filter(id=>id!==currentParent);}
    }catch(error){if(!initial)await windows.resume();throw error;}
    notify({key:'sync',state:'progress',title:'正在同步工作區…'});
    try{
      let restored;
      await swap(m,initial,{afterSwitch:restoreSelected?async()=>{restored=await snapshots.create('restore',{force:true,parentSnapshotId:currentParent||m.snapshotId,restoredFromSnapshotId:m.snapshotId,resolvedSnapshotIds:restoreParents});}:undefined,advance:()=>++epoch,resetReady:()=>{ready.clear();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error("Cancelled old workspace initialization"));}waiting.clear();},wait:async()=>{const all=windows.list();const promises=all.map(awaitReady);for(const win of all)win.webContents.reload();await Promise.all(promises);}});
      if(!automatic){await bind(m.workspaceId);const rows=await snapshots.index();settings.resolvedHeads=rows.filter(r=>r.workspaceId===m.workspaceId&&r.relation==='branch').map(r=>r.snapshotId);await writeJSON(settingsFile,settings);}
      notify({key:'sync',state:'success',title:restoreSelected?'已還原選定內容':'已更新內容',time:restoreSelected?restored?.createdAt:m.createdAt,computer:m.sourceComputerName||'另一台電腦'});
      notify({key:'snapshot-list-changed',state:'clear'});
      return {kind:'ready',updated:true,restored:restoreSelected,restoredSnapshotId:restored?.snapshotId,preservedSnapshotId:saved?.snapshotId};
    }catch(error){if(!initial)await windows.resume();throw error;}
  }
  async function decision(){
    if(offline&&initial)return {kind:'ready',offline:true};
    let value;try{value=await inspect();}catch(error){value={kind:'unavailable',error:error.message};}
    if(value.kind==='newer'&&!value.hasLocalChanges){return apply(value.candidate,true);}
    if(value.kind==='newer'&&value.hasLocalChanges)value.kind='conflict';
    // Status is only computed for the paired workspace; snapshots of other workspaces in the exchange
    // folder (an old test, another install) do not affect it and are never a decision (REG-165).
    if(['current','unconfigured','other-workspace'].includes(value.kind))return {kind:'ready'};
    return value;
  }
  async function enter(){if(!initial)return {kind:'ready'};if(!checking)checking=queue.run('startup-sync',decision).finally(()=>checking=null);const result=await checking;if(result.kind==='ready')initial=false;return result;}
  async function check(){if(checking)return checking;if(initial){notify({key:'startup-retry'});return;}if(!canRun())return;checking=queue.run('check-sync',decision).then(value=>{if(value.kind==='ready'){if(!value.updated)notify({key:'sync',state:'clear'});}else notify({key:'sync',state:value.kind==='incomplete'||value.kind==='unavailable'?'waiting':'conflict',title:value.kind==='conflict'||value.kind==='branches'?'兩台都有新版本，請選擇':value.kind==='unknown'?'版本鏈尚未到齊，無法判斷先後':value.kind==='pairing'?'請選擇要使用的工作區':'正在同步，等待資料到齊',details:value});return value;}).finally(()=>checking=null);return checking;}
  async function call(request){
    if(request.method==='preferences'){await initialized;return {computerName:settings.computerName||require('node:os').hostname()};}
    if(request.method==='computerName'){await initialized;if(typeof request.name!=='string'||!request.name.trim()||request.name.length>64||/[\x00-\x1f]/.test(request.name))throw Error('電腦名稱需為 1–64 個字');settings.computerName=request.name.trim();snapshots.setDeviceName(settings.computerName);await writeJSON(settingsFile,settings);return {ok:true};}
    if(request.method==='enter'){await initialized;return enter();}
    if(request.method==='offline'){offline=true;initial=false;notify({key:'sync',state:'waiting',title:'目前使用本機版，恢復後會重新檢查'});return {kind:'ready'};}
    if(request.method==='check'){await initialized;return initial?enter():check();}
    if(request.method==='setup'){await initialized;return queue.run('setup-sync',decision);}
    if(request.method==='select'){await initialized;const target={workspaceId:request.workspaceId,snapshotId:request.snapshotId,pair:!!request.pair};const result=await queue.run('select-workspace',()=>apply(target,false,!target.pair));if(result.kind==='ready')initial=false;return result;}
    if(request.method==='restore'){await initialized;const result=await queue.run('restore-workspace',()=>apply({workspaceId:request.workspaceId,snapshotId:request.snapshotId},false,true));if(result.kind==='ready')initial=false;return result;}
    if(request.method==='keepLocal'){await initialized;return queue.run('keep-local',async()=>{const wasInitial=initial;if(!initial)await windows.pause();try{
      await save('before-resolve-local',true);const graph=await database.summary(),status=await snapshots.status(),tips=payloadTips((await snapshots.index()).filter(r=>r.workspaceId===graph.workspaceId));
      await snapshots.create('resolve-local',{force:true,parentSnapshotId:status.baseSnapshotId,resolvedSnapshotIds:tips.map(r=>r.snapshotId).filter(id=>id!==status.baseSnapshotId)});
      await bind(graph.workspaceId);initial=false;notify({key:'sync',state:'success',title:'已選用本機內容，其他版本仍可還原'});notify({key:'snapshot-list-changed',state:'clear'});return {kind:'ready'};
    }finally{if(!wasInitial)await windows.resume();}});}
    if(request.method==='deviceRead')return device;
    if(request.method==='deviceWrite'){
      if(!['boardViews','activeBoards','editorPreferences'].includes(request.key)||!request.value||typeof request.value!=='object'||JSON.stringify(request.value).length>1024*1024)throw Error('Invalid device state');
      if(request.key==='editorPreferences'&&(!Number.isInteger(request.value.cardMaxHeight)||request.value.cardMaxHeight<160||request.value.cardMaxHeight>10000))throw Error('Invalid card height');
      device[request.key]={...(device[request.key]||{}),...request.value};deviceTail=deviceTail.catch(()=>{}).then(()=>writeJSON(deviceFile,device));await deviceTail;return {ok:true};
    }
    throw Error('Unknown sync operation');
  }
  const initialized=init();
  timer=setInterval(()=>check().catch(()=>{}),30000);timer.unref();
  app.on('browser-window-focus',()=>check().catch(()=>{}));
  powerMonitor.on('resume',()=>check().catch(()=>{}));
  return {call,check,watch,markedReady,assertEpoch,get epoch(){return epoch;},get initial(){return initial;},dispose(){clearInterval(timer);clearTimeout(debounce);watcher?.close();}};
}
module.exports={installLiveSync};
