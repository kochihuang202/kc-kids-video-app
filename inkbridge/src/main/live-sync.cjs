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
function installLiveSync({app,powerMonitor,windows,localDirectory,database,snapshots,getExchange,queue,notify,swap,startupStatus,save,canRun,writeBarrier={freeze:async()=>{},assertClean:()=>{},resume:()=>{}}}){
  const settingsFile=path.join(localDirectory,'Profile','sync-settings.json'),deviceFile=path.join(localDirectory,'Profile','device-state.json');
  let settings={},device={},watcher,timer,debounce,initial=true,epoch=0,checking=null,offline=false,deviceTail=Promise.resolve();
  const ready=new Map(),waiting=new Map();
  const merger=require('./sync-merge.cjs').createSyncMerge({localDirectory,snapshots,getExchange});
  let lastDecisionNotice='';
  async function authoritativeLocal(){
    if(!getExchange())throw Error('請先設定 OneDrive 交換資料夾');let paused=false;
    try{
      if(!initial){await windows.pause();paused=true;}
      await save('before-authoritative-local',true);const frozen=await writeBarrier.freeze();if(frozen?.drainedActive)throw Error('仍有編輯或附件操作剛完成，請稍後再指定；原始資料已保留');
      const status=await snapshots.status(),rows=await snapshots.index(),own=rows.filter(r=>r.workspaceId===status.workspaceId&&r.manifest);
      if(!settings.workspaceId&&rows.some(r=>r.manifest&&r.workspaceId!==status.workspaceId))throw Error('請先完成共用工作區配對，才能讓同一工作區的電腦對齊');
      const parents=[...new Set([...payloadTips(own).map(r=>r.snapshotId),...require('./snapshot-authority.cjs').authorityHeads(own).heads.map(r=>r.snapshotId)])].filter(id=>id!==status.baseSnapshotId);
      writeBarrier.assertClean();const result=await snapshots.create('authoritative-local',{force:true,authoritative:true,parentSnapshotId:status.baseSnapshotId,resolvedSnapshotIds:parents});
      await bind(status.workspaceId);await merger.completed();initial=false;lastDecisionNotice='';
      notify({key:'sync',state:result.pending?'waiting':'success',title:result.pending?'已保存本機，指定版本等待發布':'已指定這台為準，其他電腦收到後會對齊',time:result.createdAt});notify({key:'snapshot-list-changed',state:'clear'});
      return {kind:'ready',authoritative:true,...result};
    }finally{writeBarrier.resume();if(paused)await windows.resume();}
  }
  async function mergeFlow({finish=false,sessionId}={}){
    let paused=false;
    try{
      if(!initial){await windows.pause();paused=true;}
      await save('before-merge',true);
      const frozen=await writeBarrier.freeze();if(frozen?.drainedActive)throw Error('仍有附件或編輯操作剛完成，已保留原視窗，稍後重新合併');
      const status=await snapshots.status(),rows=await snapshots.index(),review=await merger.plan(rows,status);
      if(!review)return {kind:'ready'};
      if(review.conflicts.length&&(!finish||review.sessionId!==sessionId))return {...review,changed:finish&&review.sessionId!==sessionId};
      if(review.remaining)return review;
      const m=await merger.prepare();
      writeBarrier.assertClean();const latest=await snapshots.status();if(latest.localRevision!==status.localRevision||latest.baseSnapshotId!==status.baseSnapshotId)throw Error('合併期間又有新修改，原始內容已保留，稍後重新確認');
      notify({key:'sync',state:'progress',title:'正在合併兩台的修改…'});
      await swap(m,initial,{advance:()=>++epoch,resetReady:()=>{ready.clear();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error('Cancelled old workspace initialization'));}waiting.clear();},wait:async()=>{const all=windows.list(),promises=all.map(awaitReady);for(const win of all)win.webContents.reload();await Promise.all(promises);}});
      paused=false;await merger.completed();lastDecisionNotice='';
      notify({key:'sync',state:'success',title:'已合併兩台的修改',time:m.createdAt});notify({key:'snapshot-list-changed',state:'clear'});
      return {kind:'ready',updated:true,merged:true,snapshotId:m.snapshotId};
    }finally{writeBarrier.resume();if(paused)await windows.resume();}
  }
  function announce(value){
    const key=JSON.stringify([value.kind,value.sessionId,value.error,value.candidate?.snapshotId,value.versions?.map(v=>v.snapshotId)]);
    if(key===lastDecisionNotice)return;lastDecisionNotice=key;
    notify({key:'sync',state:['incomplete','unavailable'].includes(value.kind)?'waiting':'conflict',title:value.kind==='authority-conflict'?'兩台都指定了自己為準':value.kind==='merge-conflicts'?`有 ${value.conflicts.length} 項修改需要確認`:value.kind==='conflict'||value.kind==='branches'?'兩台都有新版本，請選擇':value.kind==='unknown'?'缺少共同版本，已保留雙方修改':value.kind==='pairing'?'請選擇要使用的工作區':'正在同步，等待資料到齊',details:value});
  }
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
    const authority=require('./snapshot-authority.cjs').authorityDecision(rows,await snapshots.status());if(authority)return authority;
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
      if(!initial){await windows.pause();const after=await snapshots.status();if(automatic&&!candidate.alignAuthority&&after.localRevision!==after.baseRevision){await windows.resume();return {kind:'conflict',hasLocalChanges:true};}
        if(restoreSelected&&after.workspaceId===m.workspaceId&&after.localRevision===after.baseRevision){const selected=(await snapshots.index()).find(r=>r.snapshotId===m.snapshotId);if(selected&&['current','newer','equivalent'].includes(selected.relation))restoreSelected=false;}
        saved=await save(candidate.alignAuthority?'before-authority-align':restoreSelected?'before-restore':'before-load',true);
      }else if(candidate.alignAuthority){saved=await save('before-authority-align',true);}
      else if(!automatic){if(restoreSelected&&before.workspaceId===m.workspaceId&&before.localRevision===before.baseRevision){const selected=(await snapshots.index()).find(r=>r.snapshotId===m.snapshotId);if(selected&&['current','newer','equivalent'].includes(selected.relation))restoreSelected=false;}saved=await save('before-join',true);}
      if(restoreSelected){const status=await snapshots.status();currentParent=status.workspaceId===m.workspaceId?status.baseSnapshotId:m.snapshotId;restoreParents=payloadTips((await snapshots.index()).filter(r=>r.workspaceId===m.workspaceId)).map(r=>r.snapshotId).filter(id=>id!==currentParent);}
      const frozen=await writeBarrier.freeze();if(frozen?.drainedActive)throw Error('仍有編輯或附件剛完成，原視窗保留，稍後重新同步');
    }catch(error){writeBarrier.resume();if(!initial)await windows.resume();throw error;}
    notify({key:'sync',state:'progress',title:'正在同步工作區…'});
    try{
      let restored;
      await swap(m,initial,{afterSwitch:restoreSelected?async()=>{restored=await snapshots.create('restore',{force:true,parentSnapshotId:currentParent||m.snapshotId,restoredFromSnapshotId:m.snapshotId,resolvedSnapshotIds:restoreParents,authorityId:before.authorityId||null});}:undefined,advance:()=>++epoch,resetReady:()=>{ready.clear();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error("Cancelled old workspace initialization"));}waiting.clear();},wait:async()=>{const all=windows.list();const promises=all.map(awaitReady);for(const win of all)win.webContents.reload();await Promise.all(promises);}});
      if(!automatic){await bind(m.workspaceId);const rows=await snapshots.index();settings.resolvedHeads=rows.filter(r=>r.workspaceId===m.workspaceId&&r.relation==='branch').map(r=>r.snapshotId);await writeJSON(settingsFile,settings);}
      writeBarrier.resume();notify({key:'sync',state:'success',title:candidate.alignAuthority?'已對齊指定電腦的內容':restoreSelected?'已還原選定內容':'已更新內容',time:restoreSelected?restored?.createdAt:m.createdAt,computer:m.sourceComputerName||'另一台電腦'});
      notify({key:'snapshot-list-changed',state:'clear'});
      return {kind:'ready',updated:true,restored:restoreSelected,restoredSnapshotId:restored?.snapshotId,preservedSnapshotId:saved?.snapshotId};
    }catch(error){writeBarrier.resume();if(!initial)await windows.resume();throw error;}
  }
  async function decision(){
    if(offline&&initial)return {kind:'ready',offline:true};
    let value;try{value=await inspect();}catch(error){value={kind:'unavailable',error:error.message};}
    if(value.kind==='authority-align')return apply(value.candidate,true);
    if(value.kind==='newer'&&!value.hasLocalChanges){const result=await apply(value.candidate,true);return result.kind==='conflict'?mergeFlow():result;}
    if(value.kind==='newer'&&value.hasLocalChanges)value.kind='conflict';
    if(['branches','conflict','unknown'].includes(value.kind)){
      try{return await mergeFlow();}catch(error){return {...value,kind:'unknown',error:error.message};}
    }
    // Status is only computed for the paired workspace; snapshots of other workspaces in the exchange
    // folder (an old test, another install) do not affect it and are never a decision (REG-165).
    if(['current','unconfigured','other-workspace'].includes(value.kind))return {kind:'ready'};
    return value;
  }
  async function enter(){if(!initial)return {kind:'ready'};if(!checking)checking=queue.run('startup-sync',decision).finally(()=>checking=null);const result=await checking;if(result.kind==='ready')initial=false;return result;}
  async function check(){if(checking)return checking;if(initial){notify({key:'startup-retry'});return;}if(!canRun())return;checking=queue.run('check-sync',decision).then(value=>{if(value.kind==='ready'){lastDecisionNotice='';if(!value.updated)notify({key:'sync',state:'clear'});}else announce(value);return value;}).finally(()=>checking=null);return checking;}
  async function call(request){
    if(request.method==='authoritativeLocal'){await initialized;return queue.run('authoritative-local',authoritativeLocal);}
    if(request.method==='mergeReview'){await initialized;return queue.run('review-merge',()=>mergeFlow());}
    if(request.method==='mergeChoice'){await initialized;return queue.run('choose-merge',()=>merger.choose(request));}
    if(request.method==='mergeFinish'){await initialized;const result=await queue.run('finish-merge',()=>mergeFlow({finish:true,sessionId:request.sessionId}));if(result.kind==='ready')initial=false;return result;}
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
