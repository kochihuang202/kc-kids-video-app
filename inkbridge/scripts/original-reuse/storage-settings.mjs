// InkBridge-owned exchange settings. Does not invoke FlexNote cloud/account services.
export function installStorageSettings() {
  const button = document.createElement('button');
  button.id = 'open-storage-settings'; button.textContent = '⚙'; button.title = '設定'; button.setAttribute('aria-label', '設定');
  document.querySelector('.sidebar-footer').append(button);
  const dialog = document.createElement('dialog'); dialog.id = 'storage-settings';
  dialog.innerHTML = `<style>
    #storage-settings{width:min(620px,85vw);border:1px solid #dedee3;border-radius:14px;padding:24px;color:#25252b;background:white;box-shadow:0 12px 50px #0003}
    #storage-settings::backdrop{background:#0003}#storage-settings h2{font-size:20px;margin:0 0 16px}#storage-settings h3{margin:18px 0 8px;font-weight:600}
    #storage-settings p{font-size:13px;margin:8px 0;line-height:1.6}#storage-settings input{width:100%;border:1px solid #ccc;border-radius:6px;padding:9px;font-size:13px;box-sizing:border-box}
    #storage-settings button{border:1px solid #d4d4db;border-radius:6px;padding:6px 12px;margin:8px 6px 0 0;background:#f7f7fa}#storage-settings button:disabled{opacity:.45}#storage-settings footer{text-align:right;margin-top:16px}
    #storage-settings-status{white-space:pre-wrap;min-height:42px}#storage-settings .local-path{overflow-wrap:anywhere;color:#666}
  </style><h2>設定</h2><h3>儲存與同步</h3>
  <p>各電腦保留自己的本機資料庫。OneDrive 交換資料夾將用於不可變快照與共用附件。</p>
  <label for="exchange-directory">OneDrive 交換資料夾</label><input id="exchange-directory" readonly placeholder="尚未設定，請按瀏覽選擇">
  <button id="browse-exchange">瀏覽…</button><button id="check-exchange">檢查資料夾</button><button id="open-exchange">開啟已設定資料夾</button>
  <p id="storage-settings-status" role="status"></p>
  <h3>本機工作資料</h3><p class="local-path" id="local-directory"></p><button id="open-local-data">開啟本機資料夾</button>
  <p>目前僅設定交換路徑，不搬移現有筆記。快照建立、掃描載入及程式更新尚未啟用。</p>
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
  button.onclick = () => { dialog.showModal(); run(async () => {
    const settings = await call({method:'read'});
    $('#exchange-directory').value = settings.exchangeDirectory;
    $('#local-directory').textContent = settings.localDirectory;
    $('#storage-settings-status').textContent = settings.exchangeDirectory ? '已記住此電腦的交換路徑。快照同步尚未啟用。' : '尚未設定交換資料夾；仍可在本機編輯。';
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
    $('#storage-settings-status').textContent = '已保存本機設定；現有筆記位置不變。快照同步尚未啟用。';
  });
  $('#open-local-data').onclick = () => run(() => call({method:'openLocal'}));
  $('#open-exchange').onclick = () => run(() => call({method:'openExchange'}));
  $('#cancel-storage-settings').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  call({method:'read'}).then(value => { if (!value.exchangeDirectory) button.title = '設定：尚未選擇交換資料夾'; }).catch(() => { button.title = '設定讀取失敗，請開啟查看'; });
}
