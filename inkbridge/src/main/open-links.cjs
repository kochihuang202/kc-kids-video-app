// Opening links from notes (user decision 2026-11-14).
// Original FlexNote (1.1.70 main): the main window's window-open handler and the "openUrl"
// service hand every non-FlexNote URL to shell.openExternal; nothing opens inside the app.
// InkBridge does the same, except that targets which run or reveal local files ask first:
// file: URLs, Windows paths and UNC paths, and the Windows protocols that reach local files or
// programs. Script and in-browser schemes are refused. Nothing is opened inside InkBridge.
// Folders (user decision 2026-11-14, REG-156) open in Explorer without asking; a path that
// does not exist on this computer only says so.
const {fileURLToPath}=require('node:url'),fsp=require('node:fs/promises');
const MAX_LENGTH=8192;
const REFUSED=new Set(['javascript:','vbscript:','data:','blob:','about:','chrome:','devtools:','view-source:','flexnote:']);
const CONFIRM=new Set(['search-ms:','search:','ms-msdt:','shell:','ms-settings:']);
function classify(value){
 if(typeof value!=='string')return {kind:'refused',reason:'missing-url'};
 const url=value.trim();if(!url||url.length>MAX_LENGTH||/[\u0000-\u001f]/.test(url))return {kind:'refused',reason:'invalid-url'};
 // Windows drive and UNC paths written directly as the link.
 if(/^[a-zA-Z]:[\\/]/.test(url)||/^\\\\[^\\]/.test(url))return {kind:'local',path:url};
 let parsed;try{parsed=new URL(url);}catch{return {kind:'refused',reason:'invalid-url'};}
 const scheme=parsed.protocol.toLowerCase();
 if(scheme==='file:'){try{return {kind:'local',path:fileURLToPath(parsed,{windows:true})};}catch{return {kind:'refused',reason:'invalid-file-url'};}}
 if(REFUSED.has(scheme))return {kind:'refused',reason:'scheme-'+scheme.slice(0,-1)};
 if(CONFIRM.has(scheme))return {kind:'confirm',url:parsed.href};
 return {kind:'external',url:parsed.href};
}
function createLinkOpener({shell,dialog,stat=p=>fsp.stat(p),appOrigin=null}){
 async function confirm(window,detail){
  const options={type:'warning',buttons:['開啟','取消'],defaultId:1,cancelId:1,noLink:true,title:'InkBridge',message:'這個連結會開啟電腦或網路磁碟上的檔案（可能是程式）。要開啟嗎？',detail};
  const result=window&&!window.isDestroyed()?await dialog.showMessageBox(window,options):await dialog.showMessageBox(options);
  return result.response===0;
 }
 async function open(value,window){
  const target=classify(value);
  if(target.kind==='refused')return {success:false,reason:target.reason};
  // A relative link (e.g. a UNC path through window.open) resolves to the app's own address.
  if(target.kind==='external'&&appOrigin&&new URL(target.url).origin===appOrigin)return {success:false,reason:'app-origin'};
  if(target.kind==='local'){
   const info=await stat(target.path).catch(()=>null);
   if(!info){const options={type:'info',buttons:['確定'],noLink:true,title:'InkBridge',message:'這台電腦上找不到這個位置。',detail:target.path};await (window&&!window.isDestroyed()?dialog.showMessageBox(window,options):dialog.showMessageBox(options));return {success:false,reason:'not-found'};}
   if(info.isDirectory()){const error=await shell.openPath(target.path);return error?{success:false,reason:error}:{success:true,mode:'folder'};}
  }
  if(target.kind==='external'){await shell.openExternal(target.url);return {success:true,mode:'external'};}
  if(!await confirm(window,target.path||target.url))return {success:false,reason:'cancelled'};
  if(target.kind==='local'){const error=await shell.openPath(target.path);return error?{success:false,reason:error}:{success:true,mode:'local'};}
  await shell.openExternal(target.url);return {success:true,mode:'external'};
 }
 return {open,classify};
}
module.exports={createLinkOpener,classify};
