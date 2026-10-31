const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('inkbridge',{
  info:()=>ipcRenderer.invoke('inkbridge:info'),load:()=>ipcRenderer.invoke('inkbridge:load'),commit:request=>ipcRenderer.invoke('inkbridge:commit',request),
  history:request=>ipcRenderer.invoke('inkbridge:history',request),
  savePastedImageBuffers:request=>ipcRenderer.invoke('inkbridge:savePastedImageBuffers',request),
  savePureBase64Image:request=>ipcRenderer.invoke('inkbridge:savePureBase64Image',request),
  uploadFile:request=>ipcRenderer.invoke('inkbridge:uploadFile',request),
  ready:()=>ipcRenderer.send('inkbridge:renderer-ready'),
  onRevision:callback=>{const listener=(_event,rev)=>callback(rev);ipcRenderer.on('inkbridge:revision',listener);return ()=>ipcRenderer.removeListener('inkbridge:revision',listener);},
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
