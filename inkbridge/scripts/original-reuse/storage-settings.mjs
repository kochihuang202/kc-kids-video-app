import {settingsFields} from './settings-frame.mjs';
import {installCardHeightSettings} from './card-height-settings.mjs';
// InkBridge-owned exchange settings. Does not invoke FlexNote cloud/account services.
import {installStartupSnapshotNotice} from './startup-snapshot-notice.mjs';
import {enterWorkspace,localTime} from './operation-ui.mjs';
export function installStorageSettings() {
  const button = document.createElement('button');
  button.id = 'open-storage-settings'; button.textContent = '⚙'; button.title = '設定'; button.setAttribute('aria-label', '設定');
  document.querySelector('.sidebar-footer').append(button);
  const dialog=document.createElement('div');dialog.id='storage-settings-fields';dialog.hidden=true;dialog.innerHTML=settingsFields;
  const local=dialog.querySelector('#settings-panel-sync');local.id='settings-panel-local';local.querySelector('h2').textContent='本地存儲與備份';local.append(dialog.querySelector('#settings-panel-workspace'),dialog.querySelector('#settings-panel-backup'));
  for(const [key,label,description]of [['editor','編輯器','文字與卡片的編輯偏好'],['appearance','外觀定制','介面與白板的顯示偏好'],['shortcuts','快捷鍵','鍵盤操作與快捷鍵偏好']]){const section=document.createElement('section');section.id='settings-panel-'+key;section.className='settings-fields';section.innerHTML=`<h2>${label}</h2><p class="intro">${description}</p><div class="settings-empty">相關設定將在後續版本提供。</div>`;dialog.append(section);}
  const attachments=document.createElement('section');attachments.id='settings-panel-attachments';attachments.className='settings-fields';attachments.innerHTML='<h2>附件管理</h2><p class="intro">目前工作區使用的圖片、PDF 與其他原始檔案。</p><div class="settings-card"><h3>本機附件</h3><div id="settings-attachment-summary" class="settings-metrics"></div><p>附件以獨立檔案保留，備份版本共用相同內容。</p></div>';dialog.append(attachments);
  document.body.append(dialog);const cardHeightSettings=installCardHeightSettings(dialog);
  const $ = selector => document.querySelector(selector), call = request => window.inkbridge.storageSettings(request);
  let busy = false;
  const frame=window.__inkbridgeSettingsFrame={open:false,busy:false,close:()=>{if(!busy)dialog.close();}};
  const changed=()=>window.dispatchEvent(new Event('inkbridge:settings-frame'));
  dialog.showModal=()=>{frame.open=true;changed();};dialog.close=()=>{frame.open=false;changed();};
  const fieldsButtons=()=>document.querySelectorAll('.settings-fields button,.settings-bottom button');
  const run = async action => {
    if (busy) return;const previousFocus=document.activeElement;busy = true;frame.busy=true;changed();
    fieldsButtons().forEach(el => el.disabled = true);
    try { await action(); } catch (error) { $('#storage-settings-status').textContent = error.message; }
    finally { busy = false;frame.busy=false;changed(); fieldsButtons().forEach(el => el.disabled = false);const modal=document.querySelector('#storage-settings');if(frame.open&&modal&&!modal.contains(document.activeElement)){const target=previousFocus?.isConnected&&modal.contains(previousFocus)?previousFocus:modal.querySelector('[role=tab][aria-selected=true]');target?.focus({preventScroll:true});} }
  };
  button.onclick = () => { dialog.showModal(); return run(async () => {
    await cardHeightSettings.read();
    const settings = await call({method:'read'});
    $('#exchange-directory').value = settings.exchangeDirectory;
    $('#local-directory').textContent = settings.localDirectory;
    $('#workspace-snapshot-list').replaceChildren();
    $('#storage-settings-status').textContent = settings.exchangeDirectory ? '已記住此電腦的交換路徑。可以建立或掃描快照。' : '尚未設定交換資料夾；仍可在本機編輯。';
    const version=await call({method:'snapshotStatus'});$('#storage-version-summary').textContent=`本機 v${version.localRevision}｜最近快照 ${version.baseRevision===null?'尚無':`v${version.baseRevision}`}（本機提交紀錄，不代表 OneDrive 已上傳）`;
    $('#sync-computer-name').value=(await window.inkbridge.sync({method:'preferences'})).computerName;
    const graph=await window.inkbridge.load(),info=await window.inkbridge.info();$('#settings-app-version').textContent='InkBridge '+info.version;$('#settings-workspace-summary').textContent=`${graph.boards.filter(row=>!row.attributes?.isTrashed).length} 張白板 · ${graph.contents.length} 張卡片`;$('#settings-workspace-id').textContent=graph.workspaceId;const total=(graph.files||[]).reduce((sum,f)=>sum+(f.size||0),0);$('#settings-attachment-summary').textContent=`${(graph.files||[]).length} 個附件 · ${(total/1024/1024).toFixed(2)} MB`;
  }); };
  $('#browse-exchange').onclick = () => run(async () => {
    const result = await call({method:'choose'}); if (result.cancelled) return;
    $('#exchange-directory').value = result.directory;
    $('#storage-settings-status').textContent = '已選擇，尚未套用。';
  });
  $('#check-exchange').onclick = () => run(async () => {
    const result = await call({method:'check', directory:$('#exchange-directory').value});
    $('#storage-settings-status').textContent = `本機可讀寫。已找到目錄：${result.directories.join('、') || '尚無 snapshots/、assets/'}。\n此檢查不代表 OneDrive 已上傳，也未驗證快照完整性。`;
  });
  $('#apply-storage-settings').onclick = () => run(async () => {
    $('#storage-settings-status').textContent = '正在等待所有編輯視窗保存…';
    const settings = await call({method:'apply', directory:$('#exchange-directory').value});
    $('#exchange-directory').value = settings.exchangeDirectory;
    button.title = '設定';
    $('#storage-settings-status').textContent = '已保存本機設定；現有筆記位置不變。可按「建立快照」保存第一版。';
    dialog.close();await enterWorkspace('setup');
  });
  $('#create-workspace-snapshot').onclick=()=>run(async()=>{
    $('#storage-settings-status').textContent='正在等待保存並驗證快照…';
    const result=await window.inkbridge.createSnapshot();
    $('#storage-settings-status').textContent=!result.configured?'已保存本機；可設定交換資料夾。':result.pending?'已保存本機，等待交換資料夾恢復。':result.created?`已保存 · ${localTime(result.createdAt)}`:'沒有新變更，已保留原保存版本。';
    if(result.configured){$('#storage-version-summary').textContent=`快照 v${result.revision}`;$('#storage-version-summary').title=result.snapshotId;}
  });
  $('#scan-workspace-snapshots').onclick=()=>run(async()=>{
    $('#storage-settings-status').textContent='正在讀取並驗證本機已到達的快照與附件…';
    const rows=await call({method:'scan'}),list=$('#workspace-snapshot-list');list.replaceChildren();
    const labels={current:'目前版本',newer:'同一版本鏈的較新版本',ancestor:'同一版本鏈的舊版',branch:'另一個獨立分支',unbased:'尚未載入的版本',unknown:'版本鏈尚未到齊，關係未確認','other-workspace':'其他工作區（可載入）'};
    for(const row of rows){
      const item=document.createElement('div');item.style.cssText='border-bottom:1px solid #ddd;padding:10px 0;overflow-wrap:anywhere';
      const text=document.createElement('div');text.textContent=`${row.manifest?`${localTime(row.manifest.createdAt)} · ${row.manifest.sourceComputerName||'其他電腦'}\n`:''}${row.integrity==='complete'?labels[row.relation]:'尚未完整下載／驗證失敗'}${row.manifest?` · v${row.manifest.revision}`:''}${row.error?'\n'+row.error:''}`;text.style.whiteSpace='pre-wrap';item.append(text);const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='詳細資訊';details.append(summary,document.createTextNode(`工作區 ${row.workspaceId}\n快照 ${row.snapshotId}`));item.append(details);
      if(row.integrity==='complete'){
        const load=document.createElement('button');load.textContent='載入此快照';load.dataset.snapshotId=row.snapshotId;
        load.onclick=()=>run(async()=>{const result=await call({method:'restore',workspaceId:row.workspaceId,snapshotId:row.snapshotId});$('#storage-settings-status').textContent=result.cancelled?'已取消載入。':'正在重新啟動…';});item.append(load);
      }
      list.append(item);
    }
    $('#storage-settings-status').textContent=rows.length?`找到 ${rows.length} 份快照；僅驗證完整者可載入。`:'目前沒有已到達的快照。';
  });
  $('#open-local-data').onclick = () => run(() => call({method:'openLocal'}));
  $('#check-program-update').onclick=()=>run(async()=>{const result=await window.inkbridge.programUpdate({method:'check'});$('#storage-settings-status').textContent=result?.supported===false?'開發版本不會被自動覆寫；可攜版才啟用程式更新。':result?.releaseId?'找到新版，請按右上角「更新並重新啟動」。':result?.incomplete?'更新檔案尚未到齊，稍後會再檢查。':'目前沒有可套用的新版本。';});
  $('#save-computer-name').onclick=()=>run(async()=>{await window.inkbridge.sync({method:'computerName',name:$('#sync-computer-name').value});$('#storage-settings-status').textContent='電腦名稱已保存，後續快照會使用這個名稱。';});
  $('#open-exchange').onclick = () => run(() => call({method:'openExchange'}));
  $('#cancel-storage-settings').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  call({method:'read'}).then(value => { if (!value.exchangeDirectory) button.title = '設定：尚未選擇交換資料夾'; }).catch(() => { button.title = '設定讀取失敗，請開啟查看'; });
  const startup=installStartupSnapshotNotice({call,review:async()=>{await button.onclick();$('#scan-workspace-snapshots').click();}});
  return {checkOnStartup:()=>startup.check()};
}
