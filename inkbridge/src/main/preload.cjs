const {contextBridge,ipcRenderer,webUtils}=require('electron');
const workspaceEpoch=ipcRenderer.sendSync('inkbridge:epoch');
const invoke=(channel,payload)=>ipcRenderer.invoke(channel,payload,workspaceEpoch);
contextBridge.exposeInMainWorld('inkbridge',{
  saveState:()=>invoke('inkbridge:save-state'),editingState:value=>invoke('inkbridge:editing-state',value),
  onSaveStateChanged:callback=>{const listener=()=>callback();ipcRenderer.on('inkbridge:save-state-changed',listener);return ()=>ipcRenderer.removeListener('inkbridge:save-state-changed',listener);},
  programUpdate:request=>invoke('inkbridge:program-update',request),
  sync:request=>invoke('inkbridge:sync',request),
  operations:()=>invoke('inkbridge:operations'),
  onOperation:callback=>{const listener=(_e,value)=>callback(value);ipcRenderer.on('inkbridge:operation',listener);return ()=>ipcRenderer.removeListener('inkbridge:operation',listener);},
  storageSettings:request=>invoke('inkbridge:storage-settings',request),
  createSnapshot:()=>invoke('inkbridge:create-snapshot'),
  onSnapshotSaved:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('inkbridge:snapshot-saved',listener);return ()=>ipcRenderer.removeListener('inkbridge:snapshot-saved',listener);},
  onSnapshotError:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('inkbridge:snapshot-error',listener);return ()=>ipcRenderer.removeListener('inkbridge:snapshot-error',listener);},
  info:()=>invoke('inkbridge:info'),load:()=>invoke('inkbridge:load'),commit:request=>invoke('inkbridge:commit',request),
  openStandaloneWindow:payload=>invoke('inkbridge:open-standalone-window',payload),
  openNoteWindow:payload=>invoke('inkbridge:open-note-window',payload),
  noteCall:request=>invoke('inkbridge:note-call',request),
  workspaceCommitted:()=>ipcRenderer.send('inkbridge:workspace-committed'),
  onWorkspaceUpdated:callback=>{const listener=()=>callback();ipcRenderer.on('inkbridge:workspace-updated',listener);return ()=>ipcRenderer.removeListener('inkbridge:workspace-updated',listener);},
  onBridgeRequest:callback=>{const listener=async(_event,request)=>{try{if(request.epoch!==workspaceEpoch)throw Object.assign(Error('Stale workspace request'),{code:'STALE_WORKSPACE_EPOCH'});ipcRenderer.send('inkbridge:bridge-result',{id:request.id,epoch:workspaceEpoch,ok:true,result:await callback(request.payload)});}catch(error){ipcRenderer.send('inkbridge:bridge-result',{id:request.id,epoch:workspaceEpoch,ok:false,error:{message:error.message,code:error.code}});}};ipcRenderer.on('inkbridge:bridge-request',listener);return ()=>ipcRenderer.removeListener('inkbridge:bridge-request',listener);},
  openAttachment:id=>invoke('inkbridge:open-attachment',id),
  exportArtifact:request=>invoke('inkbridge:export-artifact',request),
  history:request=>invoke('inkbridge:history',request),
  writeClipboardTextAndHtml:request=>invoke('inkbridge:writeClipboardTextAndHtml',request),
  savePastedImageBuffers:request=>invoke('inkbridge:savePastedImageBuffers',request),
  savePureBase64Image:request=>invoke('inkbridge:savePureBase64Image',request),
  uploadFile:request=>invoke('inkbridge:uploadFile',request),
  inspectFiles:request=>invoke('inkbridge:inspectFiles',request),
  ready:()=>ipcRenderer.send('inkbridge:renderer-ready',workspaceEpoch),
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
