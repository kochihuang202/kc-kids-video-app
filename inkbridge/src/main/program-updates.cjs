const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const {promisify}=require('node:util'),exec=promisify(execFile);
const {json,exists,writeJSON,UUID}=require('./sync-files.cjs'),{hashFile}=require('./workspace-snapshots.cjs');
const {readZipEnvelope}=require('./release-zip.cjs');
function helperEnvironment(){const env={...process.env};delete env.PSModulePath;return env;}
function safePath(value){if(typeof value!=='string'||value.includes('\\')||value.includes(':')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))||!(value.startsWith('app/')||value.startsWith('runtime/')||value==='portable-build.json'||value==='使用說明.txt'||value==='Start-InkBridge.bat'||value==='Recover-InkBridge.ps1')||/(^|\/)(profiles|Profile|Session|Workspace|files|Recovery|Outbox|\.git)(\/|$)/i.test(value))throw Error('更新檔路徑無效');return value;}
function verifyEnvelope(envelope,key){
 const payload=Buffer.from(envelope?.payload||'','base64');if(payload.length>4*1024*1024||!crypto.verify('RSA-SHA256',payload,key.pem,Buffer.from(envelope?.signature||'','base64')))throw Error('更新簽章無效');
 const m=JSON.parse(payload),v2=m.version===2,full=v2&&m.mode==='full';
 if(m.format!=='inkbridge-update'||![1,2].includes(m.version)||v2&&!['full','delta'].includes(m.mode)||!UUID.test(m.releaseId)||m.platform!=='win32-x64'||m.schemaVersion!==1||(!full&&!/^[a-f0-9]{64}$/.test(m.baseBuildId))||!/^[a-f0-9]{64}$/.test(m.targetBuildId)||m.baseBuildId===m.targetBuildId||!Number.isSafeInteger(m.sequence)||m.sequence<1||!Array.isArray(m.files)||m.files.length>20000||!v2&&(!/^InkBridge-update-[a-f0-9-]+\.zip$/.test(m.zip?.name)||!/^[a-f0-9]{64}$/.test(m.zip?.sha256)))throw Error('不相容的更新格式');
 const seen=new Set();for(const f of m.files){safePath(f.path);const p=f.path.toLowerCase();if(seen.has(p))throw Error('更新檔重複路徑');seen.add(p);for(const h of full?[f.sha256]:[f.sha256,f.oldSha256])if(h!==null&&!/^[a-f0-9]{64}$/.test(h))throw Error('更新檔雜湊無效');if(v2&&f.sha256&&(!Number.isSafeInteger(f.bytes)||f.bytes<0))throw Error('更新檔長度無效');}
 if(full&&(!m.files.length||!m.files.some(f=>f.path==='portable-build.json')||m.files.some(f=>!f.sha256)))throw Error('完整更新清單無效');return m;
}
function fullOperations(current,m,manifestSha){
 const previous=new Map();for(const f of current.files||[]){safePath(f.path);if(!/^[a-f0-9]{64}$/.test(f.sha256)||previous.has(f.path.toLowerCase()))throw Error('目前程式清單無效');previous.set(f.path.toLowerCase(),f);}
 previous.set('portable-build.json',{path:'portable-build.json',sha256:manifestSha});
 const next=new Map(m.files.map(f=>[f.path.toLowerCase(),f]));
 return [...m.files.map(f=>({...f,oldSha256:previous.get(f.path.toLowerCase())?.sha256||null})),...[...previous].filter(([p])=>!next.has(p)).map(([_p,f])=>({path:f.path,oldSha256:f.sha256,sha256:null}))];
}
function createProgramUpdates({installRoot,localDirectory,getExchange,portable,notify,queue,prepareClose,exit,resume=async()=>{}}){
  const jobs=path.join(localDirectory,'Updater');let candidate=null,checking=null,applying=null;const failedTargets=new Set();
  const installed=()=>json(path.join(installRoot,'portable-build.json'),null);
  async function reportPrevious(){const active=await json(path.join(jobs,'active.json'),null);if(!active||path.resolve(active.installRoot)!==path.resolve(installRoot))return;const relative=path.relative(jobs,active.jobDirectory);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))return;const result=await json(path.join(active.jobDirectory,'result.json'),null);if(!result)return;if(!result.success){const plan=await json(path.join(active.jobDirectory,'plan.json'),{});failedTargets.add(plan.targetBuildId);}if(await exists(path.join(active.jobDirectory,'notified.json')))return;notify({key:'update-result',state:result.success?'success':'error',title:result.success?'程式已更新':'更新失敗，已恢復原版本',time:result.completedAt,message:result.message});await writeJSON(path.join(active.jobDirectory,'notified.json'),{shown:true});}
  async function check(){if(!portable)return {supported:false};if(applying)return {supported:true,updating:true};if(!getExchange())return {supported:true,configured:false};if(checking)return checking;checking=(async()=>{
    await reportPrevious();const current=await installed(),key=await json(path.join(installRoot,'app/src/main/publisher-public.json'),null);if(!current?.buildId||!key)return null;
    let entries;try{entries=await fs.readdir(getExchange());}catch{return null;}
    const signed=[];for(const name of entries.filter(n=>/^InkBridge-(update|release)-(?:[0-9]+\.[0-9]+\.[0-9]+-)?[a-f0-9-]+\.(json|zip)$/.test(n))){try{
      const zipped=name.endsWith('.zip'),envelope=zipped?await readZipEnvelope(path.join(getExchange(),name)):await json(path.join(getExchange(),name),null),m=verifyEnvelope(envelope,key);
      if(zipped&&m.version!==2||!zipped&&m.version!==1)continue;signed.push({name,envelope,m,packageName:zipped?name:m.zip.name});
    }catch{/* Untrusted/incomplete descriptors cannot become updates. */}}
    const matching=signed.filter(r=>!failedTargets.has(r.m.targetBuildId)&&r.m.targetBuildId!==current.buildId&&(r.m.mode==='full'||r.m.baseBuildId===current.buildId)&&r.m.sequence>(current.releaseSequence||0)).sort((a,b)=>b.m.sequence-a.m.sequence||(a.m.mode==='full'?1:0)-(b.m.mode==='full'?1:0));
    candidate=matching[0]||null;if(candidate){const zip=path.join(getExchange(),candidate.packageName);if(!await exists(zip)||candidate.m.version===1&&candidate.m.zip.bytes&&(await fs.stat(zip)).size!==candidate.m.zip.bytes){notify({key:'update',state:'waiting',title:'新版更新檔尚未到齊'});return {supported:true,incomplete:true};}notify({key:'update',state:'waiting',title:'發現程式新版本',message:candidate.m.targetVersion||'可更新',action:'update',releaseId:candidate.m.releaseId});return {supported:true,releaseId:candidate.m.releaseId,targetVersion:candidate.m.targetVersion,mode:candidate.m.mode||'delta'};}
    if(signed.some(r=>!failedTargets.has(r.m.targetBuildId)&&r.m.sequence>(current.releaseSequence||0)))notify({key:'update',state:'waiting',title:'新版更新檔尚未到齊',message:'等待對應目前版本的增量包，不會強行覆蓋。'});return null;
  })().finally(()=>checking=null);return checking;}
  async function stage(releaseId){await check();if(!candidate||candidate.m.releaseId!==releaseId)throw Error('找不到相容的更新，請重新檢查');const current=await installed(),key=await json(path.join(installRoot,'app/src/main/publisher-public.json'),null),m=verifyEnvelope(candidate.envelope,key);if(m.mode!=='full'&&m.baseBuildId!==current.buildId)throw Error('更新來源版本不符');
    const within=(a,b)=>{const r=path.relative(a,b);return !r||!r.startsWith('..')&&!path.isAbsolute(r);};if(within(installRoot,localDirectory)||within(localDirectory,installRoot)||getExchange()&&(within(installRoot,getExchange())||within(getExchange(),installRoot)))throw Error('程式目錄不可與本機資料或 OneDrive 交換區重疊，請先移到本機獨立資料夾');
    const dir=path.join(jobs,crypto.randomUUID());await fs.mkdir(dir,{recursive:true});const zip=path.join(dir,'package.zip');await fs.copyFile(path.join(getExchange(),candidate.packageName),zip);
    if(m.version===1){if(await hashFile(zip)!==m.zip.sha256)throw Error('更新 ZIP 尚未完整下載或雜湊不符');}
    else{const copied=await readZipEnvelope(zip);verifyEnvelope(copied,key);if(copied.payload!==candidate.envelope.payload||copied.signature!==candidate.envelope.signature)throw Error('更新包在複製期間改變');}
    const baseManifestSha=await hashFile(path.join(installRoot,'portable-build.json'));
    if(m.mode==='full'){if(crypto.createHash('sha256').update(JSON.stringify(current.files)).digest('hex')!==current.buildId)throw Error('目前完整程式清單身分不符');await fs.copyFile(path.join(installRoot,'portable-build.json'),path.join(dir,'base-manifest.json'));}
    const operations=m.mode==='full'?fullOperations(current,m,baseManifestSha):m.files;
    for(const f of operations){const target=path.join(installRoot,safePath(f.path));let previous=null;if(await exists(target)){const real=await fs.realpath(target),relative=path.relative(installRoot,real);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('更新目的地越界');previous=await hashFile(target);}if(previous!==f.oldSha256)throw Error('程式檔案與更新基底不符：'+f.path);}
    await writeJSON(path.join(dir,'envelope.json'),candidate.envelope);await writeJSON(path.join(dir,'public.json'),key);
    await fs.copyFile(path.join(__dirname,'update-helper.ps1'),path.join(dir,'helper.ps1'));
    const plan={installRoot,jobDirectory:dir,zip,parentPid:process.pid,localAppData:path.dirname(localDirectory),baseBuildId:current.buildId,baseManifestSha,targetBuildId:m.targetBuildId,healthFile:path.join(dir,'health.json')};await writeJSON(path.join(dir,'plan.json'),plan);
    const command=exec('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(dir,'helper.ps1'),'-PlanFile',path.join(dir,'plan.json'),'-Mode','Stage'],{windowsHide:true,env:helperEnvironment()});command.child.stdin.end();
    try{await command;}catch(error){const detail=await fs.readFile(path.join(dir,'helper-error.log'),'utf8').catch(()=>'');throw Error(detail.trim()||error.message);}
    return {dir,plan,m};
  }
  function apply(releaseId){if(applying)return applying;applying=performApply(releaseId).finally(()=>applying=null);return applying;}
  async function performApply(releaseId){if(!portable)throw Error('開發版本不會被自動更新覆寫');notify({key:'update',state:'progress',title:'正在驗證並準備程式更新…'});const staged=await stage(releaseId);
    return queue.run('program-update',async()=>{await prepareClose();try{await writeJSON(path.join(jobs,'active.json'),{jobDirectory:staged.dir,installRoot});
      const dispatch=exec('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(staged.dir,'helper.ps1'),'-PlanFile',path.join(staged.dir,'plan.json'),'-Mode','Dispatch'],{windowsHide:true,env:helperEnvironment()});dispatch.child.stdin.end();await dispatch;
      const deadline=Date.now()+15000;while(!await exists(path.join(staged.dir,'helper-started.json'))){if(Date.now()>deadline)throw Error('更新小工具未確認接手；程式保留開啟，請查看更新記錄');await new Promise(r=>setTimeout(r,100));}
      await exit();return {restarting:true};}catch(error){await resume();notify({key:'update',state:'error',title:'更新未完成，已保留原程式',message:error.message});throw error;}
    });
  }
  return {check,apply,async health(){const file=process.env.INKBRIDGE_UPDATE_HEALTH_FILE;if(!file)return;const relative=path.relative(jobs,file);if(relative.startsWith('..')||path.isAbsolute(relative)||path.basename(file)!=='health.json')return;const current=await installed();await writeJSON(file,{buildId:current?.buildId,ready:true});const timer=setTimeout(()=>reportPrevious().catch(()=>{}),1000);timer.unref();},call:request=>request.method==='check'?check():request.method==='apply'?apply(request.releaseId):Promise.reject(Error('Unknown update operation'))};
}
module.exports={safePath,verifyEnvelope,createProgramUpdates,fullOperations};
