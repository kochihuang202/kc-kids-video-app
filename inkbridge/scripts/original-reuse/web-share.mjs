// Standalone publishing replaces the account/server part of native share78178.
// Native92570/48626 remain the exported reader, including nested navigation.
export function installWebShare({getBoardId,isHome,flush,onError}){
 const button=document.createElement('button');button.id='export-web-share';button.textContent='匯出唯讀網頁';button.title='匯出目前白板及所有子白板，包含本機附件';
 button.style.cssText='position:absolute;right:20px;top:12px;z-index:15;padding:6px 12px;border:1px solid #ddd;border-radius:9px;background:white;color:#444;font-size:12px';document.querySelector('.canvas-wrap').append(button);
 const update=()=>{button.hidden=isHome();};const observer=new MutationObserver(update);observer.observe(document.querySelector('#board'),{attributes:true,attributeFilter:['data-flow-canvas-whiteboard-id']});update();
 button.onclick=async()=>{if(button.disabled)return;button.disabled=true;button.textContent='正在匯出…';try{await flush();const result=await window.inkbridge.webShare({method:'create',boardId:getBoardId()});
   document.querySelector('#web-share-result')?.remove();const note=document.createElement('section');note.id='web-share-result';note.style.cssText='padding:14px;margin-bottom:8px;background:white;color:#27272a;border:1px solid #ccd9d0;border-radius:10px;box-shadow:0 4px 20px #0002;pointer-events:auto;font-size:13px';
   const title=document.createElement('strong');title.textContent='唯讀網頁已匯出';const text=document.createElement('p');text.textContent=`包含 ${result.boards} 張白板與必要附件`;note.append(title,text);document.querySelector('#operation-notifications').append(note);
   const open=document.createElement('button');open.textContent='開啟資料夾';open.style.cssText='margin-top:8px;padding:4px 8px';open.onclick=()=>window.inkbridge.webShare({method:'open',exportId:result.exportId}).catch(onError);note.append(open);const close=document.createElement('button');close.textContent='關閉';close.style.marginLeft='12px';close.onclick=()=>note.remove();note.append(close);
  }catch(error){window.__inkbridgeOperationUI?.show({key:'web-export',state:'error',title:'網頁尚未匯出',message:error.message});onError(error);}finally{button.disabled=false;button.textContent='匯出唯讀網頁';}};
 return ()=>{button.remove();observer.disconnect();};
}
