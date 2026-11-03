// Display committed publication state, never infer a cloud upload from a timer.
export function installSaveIndicator(){
  let serial=0,inputPending=false,lastRevision=0,commitSerial=0,wasSaving=false,reported=false,running=false,again=false;
  const anchor=document.querySelector('#persistence-status'),lamp=anchor&&!document.querySelector('#sidebar-footer-ui')&&document.createElement('span');
  if(lamp){lamp.id='onedrive-save-indicator';lamp.setAttribute('role','status');lamp.style.cssText='display:inline-flex;align-items:center;gap:5px;font-size:10px;white-space:nowrap;margin:0 4px';lamp.innerHTML='<span style="width:9px;height:9px;border-radius:50%;background:#dc2626;flex:none"></span><span>尚未保存</span>';anchor.before(lamp);}
  function paint(green,text,createdAt=window.__inkbridgeSaveLamp?.createdAt||null){window.__inkbridgeSaveLamp={green,text,createdAt};window.dispatchEvent(new Event('inkbridge:save-lamp'));if(!lamp)return;lamp.dataset.state=green?'saved':'unsaved';lamp.firstElementChild.style.background=green?'#16a34a':'#dc2626';lamp.lastElementChild.textContent=text;lamp.title=green?'已完整保存到 OneDrive 本機交換資料夾；不代表雲端上傳完成。':text+'；按 Ctrl+S 保存至交換資料夾。';lamp.setAttribute('aria-label',lamp.title);}
  async function refresh(){if(running){again=true;return;}running=true;const started=serial;try{const s=await window.inkbridge.saveState();if(serial!==started){again=true;return;}if(!s.ownDirty)inputPending=false;const green=s.configured&&s.published&&s.localRevision===s.baseRevision&&!s.editing;paint(green,green?'已保存':!s.configured?'未設定 OneDrive':s.editing||s.localRevision!==s.baseRevision?'尚未保存':'等待寫入 OneDrive',s.createdAt);}catch{paint(false,'無法確認保存');}finally{running=false;if(again){again=false;refresh();}}}
  function report(dirty){reported=dirty;window.inkbridge.editingState({serial:++serial,dirty}).then(refresh).catch(()=>paint(false,'無法確認保存'));}
  function edited(){inputPending=true;paint(false,'尚未保存');report(true);}
  for(const name of ['input','compositionstart','paste','drop'])document.addEventListener(name,event=>{if(event.target.closest?.('#board,[contenteditable=true]')&&!event.target.closest?.('#sync-entry'))edited();},true);
  window.inkbridge.onSaveStateChanged(refresh);window.inkbridge.onSnapshotSaved(refresh);
  window.addEventListener('focus',refresh);if(lamp)setInterval(refresh,30000);
  return {refresh,persistence(value){if(value.saving&&!wasSaving)commitSerial=serial;if(value.dirty||value.saving||value.error){if(!reported)report(true);}else if(!inputPending||value.revision>lastRevision&&commitSerial===serial){inputPending=false;if(reported)report(false);}lastRevision=value.revision;wasSaving=value.saving;refresh();}};
}
