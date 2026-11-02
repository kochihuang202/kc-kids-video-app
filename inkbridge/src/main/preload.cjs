const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('inkbridge',{
  info:()=>ipcRenderer.invoke('inkbridge:info'),load:()=>ipcRenderer.invoke('inkbridge:load'),commit:request=>ipcRenderer.invoke('inkbridge:commit',request),
  openNoteWindow:payload=>ipcRenderer.invoke('inkbridge:open-note-window',payload),
  noteCall:request=>ipcRenderer.invoke('inkbridge:note-call',request),
  workspaceCommitted:()=>ipcRenderer.send('inkbridge:workspace-committed'),
  onWorkspaceUpdated:callback=>{const listener=()=>callback();ipcRenderer.on('inkbridge:workspace-updated',listener);return ()=>ipcRenderer.removeListener('inkbridge:workspace-updated',listener);},
  onBridgeRequest:callback=>{const listener=async(_event,request)=>{try{ipcRenderer.send('inkbridge:bridge-result',{id:request.id,ok:true,result:await callback(request.payload)});}catch(error){ipcRenderer.send('inkbridge:bridge-result',{id:request.id,ok:false,error:{message:error.message,code:error.code}});}};ipcRenderer.on('inkbridge:bridge-request',listener);return ()=>ipcRenderer.removeListener('inkbridge:bridge-request',listener);},
  openAttachment:id=>ipcRenderer.invoke('inkbridge:open-attachment',id),
  exportArtifact:request=>ipcRenderer.invoke('inkbridge:export-artifact',request),
  history:request=>ipcRenderer.invoke('inkbridge:history',request),
  writeClipboardTextAndHtml:request=>ipcRenderer.invoke('inkbridge:writeClipboardTextAndHtml',request),
  savePastedImageBuffers:request=>ipcRenderer.invoke('inkbridge:savePastedImageBuffers',request),
  savePureBase64Image:request=>ipcRenderer.invoke('inkbridge:savePureBase64Image',request),
  uploadFile:request=>ipcRenderer.invoke('inkbridge:uploadFile',request),
  inspectFiles:request=>ipcRenderer.invoke('inkbridge:inspectFiles',request),
  ready:()=>ipcRenderer.send('inkbridge:renderer-ready'),
  onCloseRequested:callback=>{const listener=(_event,request)=>callback(request);ipcRenderer.on('inkbridge:prepare-close',listener);return ()=>ipcRenderer.removeListener('inkbridge:prepare-close',listener);},
  onCloseCancelled:callback=>{const listener=(_event,request)=>callback(request);ipcRenderer.on('inkbridge:close-cancelled',listener);return ()=>ipcRenderer.removeListener('inkbridge:close-cancelled',listener);},
  closeResult:result=>ipcRenderer.send('inkbridge:close-result',result)
});
contextBridge.exposeInMainWorld('ipc',{
  getPathForFile:file=>webUtils?webUtils.getPathForFile(file):'',
  on:()=>()=>{},
  send:()=>{},
  invoke:async()=>null
});
