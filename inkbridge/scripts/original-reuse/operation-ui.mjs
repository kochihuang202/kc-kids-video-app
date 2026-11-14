export const localTime=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'';
// Operation notices (user decision 2026-11-14): progress and things waiting for a decision
// live on the bottom-left lamp (sidebar-footer.mjs); completions and failures use the
// original toast (55153.fz, the region mounted by the shell). No own notification boxes.
export function installOperationUI(){
  if(window.__inkbridgeOperationUI)return window.__inkbridgeOperationUI;
  const notices=new Map();
  const publish=()=>{window.__inkbridgeLampNotices=[...notices.values()];window.dispatchEvent(new Event('inkbridge:lamp-notices'));};
  const detailOf=value=>[value.computer,localTime(value.time),value.message].filter(Boolean).join(' · ');
  let replaying=false;
  // Notices replayed for a newly opened window restore the lamp only, never old toasts.
  function toast(value,color){if(replaying)return;const fz=window.__originalRequire?.(55153)?.fz,description=detailOf(value)||undefined;if(typeof fz==='function')fz({title:value.title,description,color});}
  const showVersions=()=>document.querySelector('#open-storage-settings')?.click();
  function show(value){
    if(value.key==='startup-retry'){window.dispatchEvent(new Event('inkbridge:startup-retry'));return;}
    if(value.state==='clear'){notices.delete(value.key);publish();return;}
    const detail=detailOf(value);
    if(value.action==='update'){
      notices.set(value.key,{key:value.key,kind:'attention',title:value.title,detail,actions:[{label:'更新並重新啟動',run:()=>window.inkbridge.programUpdate({method:'apply',releaseId:value.releaseId}).catch(error=>show({key:'update',state:'error',title:'更新未完成',message:error.message}))}]});
      publish();toast({...value,message:'點左下角燈號更新'},'primary');return;
    }
    if(value.state==='conflict'){
      notices.set(value.key,{key:value.key,kind:'attention',title:value.title,detail,actions:[{label:'查看版本',run:showVersions},{label:'保留本機版本',run:()=>window.inkbridge.sync({method:'keepLocal'}).catch(error=>show({key:'sync',state:'error',title:'尚未完成',message:error.message}))}]});
      publish();toast({...value,message:'點左下角燈號處理'},'warning');return;
    }
    if(value.state==='progress'||value.state==='waiting'){
      notices.set(value.key,{key:value.key,kind:'progress',title:value.title,detail,actions:value.details?[{label:'查看版本',run:showVersions}]:[]});publish();return;
    }
    notices.delete(value.key);publish();
    toast(value,value.state==='error'?'danger':value.state==='success'?'success':'default');
  }
  window.inkbridge.onOperation(show);window.inkbridge.operations().then(values=>{replaying=true;try{values.forEach(show);}finally{replaying=false;}}).catch(()=>{});
  return window.__inkbridgeOperationUI={show};
}
export async function enterWorkspace(mode='enter'){
  installOperationUI();
  window.inkbridge.programUpdate({method:'check'}).catch(()=>{});
  const screen=document.createElement('div');screen.id='sync-entry';screen.style.cssText='position:fixed;inset:36px 0 0;background:#fafafa;z-index:100005;display:flex;align-items:center;justify-content:center';const panel=document.createElement('section');panel.style.cssText='max-width:620px;padding:28px;background:white;border:1px solid #ddd;border-radius:12px';screen.append(panel);document.body.append(screen);
  let resolveReady,busy=false;const done=new Promise(resolve=>resolveReady=resolve);
  async function check(request={method:mode}){if(busy)return;busy=true;panel.replaceChildren();const title=document.createElement('h2');title.textContent='正在確認工作區版本…';panel.append(title);
    try{const result=await window.inkbridge.sync(request);if(result.kind==='ready'){screen.remove();window.removeEventListener('inkbridge:startup-retry',retryEvent);resolveReady();return;}
      title.textContent=result.kind==='pairing'?'第一次設定：共用哪個工作區？':result.kind==='branches'||result.kind==='conflict'?'兩台都有修改，請選擇版本':'正在等待同步資料';
      const text=document.createElement('p');text.textContent=result.kind==='pairing'?'只需設定一次。原有資料會先安全保存，不會合併或刪除。':result.error||'新版檔案尚未到齊，或需要確認分支。';panel.append(text);
      if(result.workspaces)for(const w of result.workspaces)for(const v of w.versions){const button=document.createElement('button');button.style.cssText='display:block;padding:12px;margin:8px 0;border:1px solid #ccc;border-radius:8px;text-align:left';button.textContent=`${v.name||'筆記工作區'} · ${localTime(v.createdAt)} · ${v.sourceComputerName}${v.boards!==undefined?` · ${v.boards} 白板 / ${v.cards} 卡片`:''}${w.local?'（本機）':''}`;button.onclick=()=>check({method:'select',pair:true,workspaceId:w.workspaceId,snapshotId:v.snapshotId});panel.append(button);}
      if(result.versions){for(const v of result.versions){const button=document.createElement('button');button.style.cssText='display:block;margin:8px;padding:8px';button.textContent=`${localTime(v.createdAt)} · ${v.sourceComputerName}`;button.onclick=()=>check({method:'select',workspaceId:v.workspaceId,snapshotId:v.snapshotId});panel.append(button);}const keep=document.createElement('button');keep.textContent='保留本機版本並繼續';keep.onclick=()=>check({method:'keepLocal'});panel.append(keep);}
      const retry=document.createElement('button');retry.textContent='重新檢查';retry.onclick=()=>check({method:mode});panel.append(retry);
      const offline=document.createElement('button');offline.textContent='使用本機版';offline.style.marginLeft='12px';offline.onclick=()=>check({method:'offline'});panel.append(offline);
    }catch(error){title.textContent='同步未完成';const text=document.createElement('p');text.textContent=error.message;panel.append(text);const offline=document.createElement('button');offline.textContent='使用本機版';offline.onclick=()=>check({method:'offline'});panel.append(offline);}
    finally{busy=false;}
  }
  const retryEvent=()=>check();window.addEventListener('inkbridge:startup-retry',retryEvent);await check();return done;
}
