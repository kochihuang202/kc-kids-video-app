// InkBridge-owned exchange settings. Does not invoke FlexNote cloud/account services.
import {installStartupSnapshotNotice} from './startup-snapshot-notice.mjs';
import {enterWorkspace,localTime} from './operation-ui.mjs';
export function installStorageSettings() {
  const button = document.createElement('button');
  button.id = 'open-storage-settings'; button.textContent = '⚙'; button.title = '設定'; button.setAttribute('aria-label', '設定');
  document.querySelector('.sidebar-footer').append(button);
  const dialog = document.createElement('dialog'); dialog.id = 'storage-settings';
  dialog.innerHTML = `<style>
    #storage-settings{width:min(620px,85vw);max-height:85vh;overflow:auto;border:1px solid #dedee3;border-radius:14px;padding:24px;color:#25252b;background:white;box-shadow:0 12px 50px #0003}
    #storage-settings::backdrop{background:#0003}#storage-settings h2{font-size:20px;margin:0 0 16px}#storage-settings h3{margin:18px 0 8px;font-weight:600}
    #storage-settings p{font-size:13px;margin:8px 0;line-height:1.6}#storage-settings input{width:100%;border:1px solid #ccc;border-radius:6px;padding:9px;font-size:13px;box-sizing:border-box}
    #storage-settings button{border:1px solid #d4d4db;border-radius:6px;padding:6px 12px;margin:8px 6px 0 0;background:#f7f7fa}#storage-settings button:disabled{opacity:.45}#storage-settings footer{text-align:right;margin-top:16px}
    #storage-settings-status{white-space:pre-wrap;min-height:42px}#storage-settings .local-path{overflow-wrap:anywhere;color:#666}
  </style><h2>設定</h2><h3>儲存與同步</h3>
  <p>各電腦保留自己的本機資料庫。OneDrive 交換資料夾將用於不可變快照與共用附件。</p>
  <label for="exchange-directory">OneDrive 交換資料夾</label><input id="exchange-directory" readonly placeholder="尚未設定，請按瀏覽選擇">
  <button id="browse-exchange">瀏覽…</button><button id="check-exchange">檢查資料夾</button><button id="open-exchange">開啟已設定資料夾</button><button id="create-workspace-snapshot">建立快照</button>
  <p id="storage-settings-status" role="status"></p><p id="storage-version-summary"></p>
  <h3>本機工作資料</h3><p class="local-path" id="local-directory"></p><button id="open-local-data">開啟本機資料夾</button>
  <label for="sync-computer-name">這台電腦的名稱</label><input id="sync-computer-name" maxlength="64" placeholder="例如：公司電腦、家裡電腦"><button id="save-computer-name">保存名稱</button>
  <h3>工作區快照</h3><button id="scan-workspace-snapshots">重新掃描快照</button><div id="workspace-snapshot-list" style="max-height:220px;overflow:auto;font-size:12px"></div>
  <p>啟動與回到前景會自動接力，無衝突時直接更新原視窗。Ctrl+S、每 10 分鐘及關閉會保存有變更的版本。OneDrive 上傳由您確認。</p>
  <h3>程式版本</h3><button id="check-program-update">檢查程式更新</button>
  <footer><button id="cancel-storage-settings">取消</button><button id="apply-storage-settings">套用</button></footer>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector), call = request => window.inkbridge.storageSettings(request);
  let busy = false;
  const run = async action => {
    if (busy) return; busy = true;
    dialog.querySelectorAll('button').forEach(el => el.disabled = true);
    try { await action(); } catch (error) { $('#storage-settings-status').textContent = error.message; }
    finally { busy = false; dialog.querySelectorAll('button').forEach(el => el.disabled = false); }
  };
  button.onclick = () => { dialog.showModal(); return run(async () => {
    const settings = await call({method:'read'});
    $('#exchange-directory').value = settings.exchangeDirectory;
    $('#local-directory').textContent = settings.localDirectory;
    $('#workspace-snapshot-list').replaceChildren();
    $('#storage-settings-status').textContent = settings.exchangeDirectory ? '已記住此電腦的交換路徑。可以建立或掃描快照。' : '尚未設定交換資料夾；仍可在本機編輯。';
    const version=await call({method:'snapshotStatus'});$('#storage-version-summary').textContent=`本機 v${version.localRevision}｜最近快照 ${version.baseRevision===null?'尚無':`v${version.baseRevision}`}（本機提交紀錄，不代表 OneDrive 已上傳）`;
    $('#sync-computer-name').value=(await window.inkbridge.sync({method:'preferences'})).computerName;
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
