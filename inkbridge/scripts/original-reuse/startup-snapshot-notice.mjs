// Reuses the existing validated scan/restore IPC; never chooses by timestamp.
export function installStartupSnapshotNotice({call,review}){
  const notice=document.createElement('aside');notice.id='startup-snapshot-notice';notice.hidden=true;notice.setAttribute('role','region');notice.setAttribute('aria-label','工作區版本檢查');
  notice.innerHTML=`<style>#startup-snapshot-notice{position:fixed;top:52px;right:18px;z-index:100000;width:min(430px,calc(100vw - 36px));padding:16px;border:1px solid #c7d8ce;border-radius:12px;background:#fff;box-shadow:0 6px 28px #0002;color:#27272a}#startup-snapshot-notice[hidden]{display:none}#startup-snapshot-notice h2{font-size:16px;font-weight:600;margin:0 0 8px}#startup-snapshot-notice p{font-size:13px;line-height:1.6;white-space:pre-wrap;margin:6px 0}#startup-snapshot-notice small{display:block;overflow-wrap:anywhere;color:#666;font-size:11px}#startup-snapshot-notice button{font-size:12px;padding:6px 10px;margin:10px 6px 0 0;border:1px solid #ccc;border-radius:6px;background:#f8faf9}#startup-snapshot-notice button:disabled{opacity:.5}</style><h2></h2><p></p><small></small><div></div>`;
  document.body.append(notice);
  const title=notice.querySelector('h2'),message=notice.querySelector('p'),details=notice.querySelector('small'),actions=notice.querySelector('div');
  let generation=0;
  const dismiss=()=>{generation++;notice.hidden=true;};
  function button(label,action){const el=document.createElement('button');el.textContent=label;el.onclick=action;actions.append(el);return el;}
  async function check(){
    const token=++generation;title.textContent='正在檢查工作區快照…';message.textContent='正在驗證這台 OneDrive 已到達的檔案，仍可繼續使用本機資料。';details.textContent='';actions.replaceChildren();button('稍後再說',dismiss);
    try{
      const result=await call({method:'startup'});if(token!==generation)return;
      if(!result.configured||result.kind==='current'){notice.hidden=true;return;}
      notice.hidden=false;
      title.textContent={newer:'發現同一版本鏈的新版本',branches:'發現不同版本分支',unknown:'版本鏈尚未到齊',incomplete:'快照檔案尚未到齊或驗證失敗','other-workspace':'發現其他電腦的工作區快照'}[result.kind];
      message.textContent=result.kind==='newer'?'OneDrive 已到達並驗證一份較新的版本，是否載入？':result.kind==='branches'?'有多個不同版本，無法只依時間決定。請查看並選擇要繼續的分支。':result.kind==='unknown'?'部分祖先版本尚未到達，無法確認哪份是後續版本。請等待同步或查看快照。':result.kind==='incomplete'?'暫不載入不完整的資料。請等 OneDrive 下載完成後重新檢查。':'目前本機與這些快照屬於不同工作區，請查看並選擇要載入的工作區。';
      if(result.hasLocalChanges)message.textContent+='\n本機也有快照後的新變更；載入前會先安全保存，保留兩邊版本。';
      if(result.kind!=='incomplete'&&result.counts.incomplete)message.textContent+=`\n另有 ${result.counts.incomplete} 份尚未完整到達或驗證失敗的快照。`;
      details.textContent=`本機 v${result.localRevision}｜最近快照 ${result.baseRevision===null?'尚無':`v${result.baseRevision}`}${result.candidate?`\n候選快照：${result.candidate.snapshotId}\n來源電腦：${result.candidate.sourceComputerId}`:''}`;
      actions.replaceChildren();
      if(result.candidate)button('保存本機後載入新版',async()=>{
        actions.querySelectorAll('button').forEach(el=>el.disabled=true);
        try{const loaded=await call({method:'restore',...result.candidate});if(loaded.cancelled){message.textContent='已取消載入，繼續使用本機資料。';}else message.textContent='正在重新啟動…';}
        catch(error){message.textContent='載入未完成：'+error.message;}
        finally{actions.querySelectorAll('button').forEach(el=>el.disabled=false);}
      });
      button('查看所有版本',async()=>{dismiss();await review();});button('重新檢查',check);button('稍後再說',dismiss);
    }catch(error){if(token!==generation)return;notice.hidden=false;title.textContent='無法檢查交換資料夾';message.textContent=`${error.message}\n繼續使用本機資料，不會覆寫筆記。`;actions.replaceChildren();button('重新檢查',check);button('稍後再說',dismiss);}
  }
  return {check};
}
