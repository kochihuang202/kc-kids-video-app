const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const {json,writeJSON}=require('./sync-files.cjs');
function installLiveSync({app,powerMonitor,windows,localDirectory,database,snapshots,getExchange,queue,notify,swap,startupStatus,save,canRun}){
  const settingsFile=path.join(localDirectory,'Profile','sync-settings.json'),deviceFile=path.join(localDirectory,'Profile','device-state.json');
  let settings={},device={},watcher,timer,debounce,initial=true,epoch=0,checking=null,offline=false,deviceTail=Promise.resolve();
  const ready=new Map(),waiting=new Map();
  async function init(){settings=await json(settingsFile,{});device=await json(deviceFile,{});if(settings.computerName)snapshots.setDeviceName(settings.computerName);watch();}
  function watch(){watcher?.close();watcher=null;try{if(getExchange())watcher=fs.watch(getExchange(),{recursive:true},()=>{clearTimeout(debounce);debounce=setTimeout(()=>check().catch(()=>{}),500);});watcher?.on('error',()=>{});}catch{}}
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
      else{const workspaces=[];for(const id of ids){const group=rows.filter(r=>r.workspaceId===id&&r.manifest),parents=new Set(group.map(r=>r.manifest.parentSnapshotId)),versions=[];for(const row of group.filter(r=>!parents.has(r.snapshotId))){try{const m=await snapshots.manifest(id,row.snapshotId);versions.push({snapshotId:m.snapshotId,...m.summary,createdAt:m.createdAt,sourceComputerName:m.sourceComputerName||'另一台電腦',revision:m.revision});}catch{}}workspaces.push({workspaceId:id,local:id===current.workspaceId,versions});}return {kind:'pairing',workspaces};}
    }
    if(settings.workspaceId!==current.workspaceId)return {kind:'pairing',workspaces:[]};
    const ignored=new Set(settings.resolvedHeads||[]);
    // Ignore only acknowledged side branches, including their ancestors.
    const byId=new Map(rows.filter(r=>r.manifest).map(r=>[r.snapshotId,r]));
    for(const id of [...ignored]){let p=byId.get(id)?.manifest.parentSnapshotId;while(p&&byId.get(p)&&!ignored.has(p)){if(byId.get(p).relation==='current'||byId.get(p).relation==='ancestor')break;ignored.add(p);p=byId.get(p).manifest.parentSnapshotId;}}
    const activeRows=rows.filter(r=>r.workspaceId===current.workspaceId&&r.manifest&&!ignored.has(r.snapshotId));
    const status=await startupStatus(activeRows,current);
    if(status.kind==='newer'){
      const m=await snapshots.manifest(status.candidate.workspaceId,status.candidate.snapshotId).catch(error=>{return {error:error.message};});
      if(m.error)return {...status,kind:'incomplete',error:m.error};
      status.candidate.manifest=m;
    }
    if(['branches','unknown'].includes(status.kind)||status.kind==='newer'&&status.hasLocalChanges){const parents=new Set(activeRows.map(r=>r.manifest.parentSnapshotId));status.versions=activeRows.filter(r=>!parents.has(r.snapshotId)).map(r=>({workspaceId:r.workspaceId,snapshotId:r.snapshotId,...r.manifest.summary,createdAt:r.manifest.createdAt,sourceComputerName:r.manifest.sourceComputerName||'另一台電腦'}));}
    return status;
  }
  async function apply(candidate,automatic){
    const m=candidate.manifest||await snapshots.manifest(candidate.workspaceId,candidate.snapshotId);
    const before=await snapshots.status();
    if(candidate.pair&&m.workspaceId===before.workspaceId){await bind(m.workspaceId);return {kind:'ready'};}
    if(!initial){await windows.pause();const after=await snapshots.status();if(automatic&&after.localRevision!==after.baseRevision){await windows.resume();return {kind:'conflict',hasLocalChanges:true};}await save('before-load',true);}
    else if(!automatic)await save('before-join',true);
    notify({key:'sync',state:'progress',title:'正在同步工作區…'});
    try{
      await swap(m,initial,{advance:()=>++epoch,resetReady:()=>{ready.clear();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error("Cancelled old workspace initialization"));}waiting.clear();},wait:async()=>{const all=windows.list();const promises=all.map(awaitReady);for(const win of all)win.webContents.reload();await Promise.all(promises);}});
      if(!automatic){await bind(m.workspaceId);const rows=await snapshots.index();settings.resolvedHeads=rows.filter(r=>r.workspaceId===m.workspaceId&&r.relation==='branch').map(r=>r.snapshotId);await writeJSON(settingsFile,settings);}
      notify({key:'sync',state:'success',title:'已更新內容',time:m.createdAt,computer:m.sourceComputerName||'另一台電腦'});
      return {kind:'ready',updated:true};
    }catch(error){if(!initial)await windows.resume();throw error;}
  }
  async function decision(){
    if(offline&&initial)return {kind:'ready',offline:true};
    let value;try{value=await inspect();}catch(error){value={kind:'unavailable',error:error.message};}
    if(value.kind==='newer'&&!value.hasLocalChanges){return apply(value.candidate,true);}
    if(value.kind==='newer'&&value.hasLocalChanges)value.kind='conflict';
    if(['current','unconfigured'].includes(value.kind))return {kind:'ready'};
    return value;
  }
  async function enter(){if(!initial)return {kind:'ready'};if(!checking)checking=queue.run('startup-sync',decision).finally(()=>checking=null);const result=await checking;if(result.kind==='ready')initial=false;return result;}
  async function check(){if(checking)return;if(initial){notify({key:'startup-retry'});return;}if(!canRun())return;checking=queue.run('check-sync',decision).then(value=>{if(value.kind!=='ready')notify({key:'sync',state:value.kind==='incomplete'||value.kind==='unavailable'?'waiting':'conflict',title:value.kind==='conflict'||value.kind==='branches'?'兩台都有新版本，請選擇':'正在同步，等待資料到齊',details:value});return value;}).finally(()=>checking=null);return checking;}
  async function call(request){
    if(request.method==='preferences'){await initialized;return {computerName:settings.computerName||require('node:os').hostname()};}
    if(request.method==='computerName'){await initialized;if(typeof request.name!=='string'||!request.name.trim()||request.name.length>64||/[\x00-\x1f]/.test(request.name))throw Error('電腦名稱需為 1–64 個字');settings.computerName=request.name.trim();snapshots.setDeviceName(settings.computerName);await writeJSON(settingsFile,settings);return {ok:true};}
    if(request.method==='enter'){await initialized;return enter();}
    if(request.method==='offline'){offline=true;initial=false;notify({key:'sync',state:'waiting',title:'目前使用本機版，恢復後會重新檢查'});return {kind:'ready'};}
    if(request.method==='check'){await initialized;return initial?enter():check();}
    if(request.method==='setup'){await initialized;return queue.run('setup-sync',decision);}
    if(request.method==='select'){await initialized;const result=await queue.run('select-workspace',()=>apply(request,false));if(result.kind==='ready')initial=false;return result;}
    if(request.method==='keepLocal'){await initialized;return queue.run('keep-local',async()=>{const wasInitial=initial;if(!initial)await windows.pause();try{await save('resolve-local',true);const graph=await database.summary();await bind(graph.workspaceId);const rows=await snapshots.index();settings.resolvedHeads=rows.filter(r=>r.workspaceId===graph.workspaceId&&r.relation==='branch').map(r=>r.snapshotId);await writeJSON(settingsFile,settings);initial=false;notify({key:'sync',state:'success',title:'已保留本機版本，其他分支仍保留'});return {kind:'ready'};}finally{if(!wasInitial)await windows.resume();}});}
    if(request.method==='deviceRead')return device;
    if(request.method==='deviceWrite'){
      if(!['boardViews','activeBoards'].includes(request.key)||typeof request.value!=='object'||JSON.stringify(request.value).length>1024*1024)throw Error('Invalid device state');
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
