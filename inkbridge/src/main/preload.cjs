const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('inkbridge',{info:()=>ipcRenderer.invoke('inkbridge:info')});
