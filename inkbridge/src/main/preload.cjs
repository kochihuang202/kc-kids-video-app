const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('inkbridge',{
  info:()=>ipcRenderer.invoke('inkbridge:info'),load:()=>ipcRenderer.invoke('inkbridge:load'),commit:request=>ipcRenderer.invoke('inkbridge:commit',request),
  history:request=>ipcRenderer.invoke('inkbridge:history',request),
  ready:()=>ipcRenderer.send('inkbridge:renderer-ready'),
  onCloseRequested:callback=>{const listener=(_event,request)=>callback(request);ipcRenderer.on('inkbridge:prepare-close',listener);return ()=>ipcRenderer.removeListener('inkbridge:prepare-close',listener);},
  onCloseCancelled:callback=>{const listener=(_event,request)=>callback(request);ipcRenderer.on('inkbridge:close-cancelled',listener);return ()=>ipcRenderer.removeListener('inkbridge:close-cancelled',listener);},
  closeResult:result=>ipcRenderer.send('inkbridge:close-result',result)
});
