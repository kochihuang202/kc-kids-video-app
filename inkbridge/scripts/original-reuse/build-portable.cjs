// Private local delivery: explicit runtime allowlist, never profile/data copying.
const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const project=path.resolve(__dirname,'../..');
const hash=async file=>{const h=crypto.createHash('sha256');for await(const bytes of fss.createReadStream(file))h.update(bytes);return h.digest('hex');};
async function buildPortable(){
  const commit=execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:project,encoding:'utf8',windowsHide:true}).trim();
  const version=require('../../package.json').version;
  const name=`InkBridge-${version}-${commit}-${crypto.randomUUID().slice(0,6)}`;
  const output=path.join(project,'release',name),app=path.join(output,'app');await fs.mkdir(app,{recursive:true});
  const copy=async(from,to)=>{await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true,errorOnExist:true,force:false,dereference:false});};
  await copy(path.join(project,'node_modules/electron/dist'),path.join(output,'runtime'));
  for(const dir of ['src/main','src/core'])await copy(path.join(project,dir),path.join(app,dir));
  await copy(path.join(__dirname,'Recover-InkBridge.ps1'),path.join(output,'Recover-InkBridge.ps1'));
  for(const file of ['index.html','styles.css'])await copy(path.join(project,'src/renderer',file),path.join(app,'src/renderer',file));
  // Copy only runtime integration files; no tests, extraction tools or evidence.
  for(const file of await fs.readdir(__dirname))if(file.endsWith('.mjs')||['host.cjs','compact-shell.css','standalone-card.html','probe.js'].includes(file))await copy(path.join(__dirname,file),path.join(app,'scripts/original-reuse',file));
  const privateRoot=path.join(project,'private-original-editor');
  for(const file of ['runtime.js','register-original.js'])await copy(path.join(privateRoot,file),path.join(app,'private-original-editor',file));
  for(const dir of ['_next','canvaskit','fonts','pdfjs'])await copy(path.join(privateRoot,'vendor/app',dir),path.join(app,'private-original-editor/vendor/app',dir));
  await fs.writeFile(path.join(app,'package.json'),JSON.stringify({name:'inkbridge-portable',version,private:true,main:'scripts/original-reuse/host.cjs'},null,2));
  const launcher=['@echo off','setlocal','cd /d "%~dp0"','set ELECTRON_RUN_AS_NODE=','set INKBRIDGE_ORIGINAL_PROBE_DATA=','set INKBRIDGE_PORTABLE=1','set INKBRIDGE_ORIGINAL_VIEW=board','if not exist "runtime\\electron.exe" goto missing','if not exist "app\\private-original-editor\\register-original.js" goto missing','"%~dp0runtime\\electron.exe" %* "%~dp0app\\scripts\\original-reuse\\host.cjs"','if errorlevel 1 (','  echo InkBridge could not finish. Your data remains in %LOCALAPPDATA%\\InkBridge.','  pause',')','exit /b',':missing','echo Extract the entire ZIP before running Start-InkBridge.bat.','pause','exit /b 1',''];
  launcher.splice(launcher.indexOf('set INKBRIDGE_PORTABLE=1'),0,'"'+path.win32.join('%SystemRoot%','System32','WindowsPowerShell','v1.0','powershell.exe')+'" -NoProfile -NonInteractive -File "%~dp0Recover-InkBridge.ps1" -InstallRoot "%~dp0."','if errorlevel 1 exit /b 1');
  await fs.writeFile(path.join(output,'Start-InkBridge.bat'),launcher.join('\r\n'));
  await fs.writeFile(path.join(output,'使用說明.txt'),`InkBridge 墨橋 ${version}\r\n本次版本：${commit}\r\n\r\n首次換用（兩台各做一次）\r\n1. 完整解壓此 ZIP 到本機獨立資料夾，例如 C:\\Apps\\InkBridge。不要直接在 ZIP 或 OneDrive 交換根目錄中執行。\r\n2. 雙擊 Start-InkBridge.bat。不需要安裝 Node.js、npm 或 FlexNote。\r\n3. 左下角齒輪 → 儲存與同步 → 瀏覽，選此電腦的 OneDrive 交換資料夾，按套用。\r\n4. 若列出不同工作區，以保存時間、電腦名稱、白板和卡片數選定同一份工作區，只需設定一次；原資料保留，不自動合併。\r\n5. 舊開發版資料不會自動搬動：先在舊版 Ctrl+S 建立快照，再關閉舊版，於此版本選擇那份工作區。\r\n\r\n日常使用\r\n啟動、回到前景、休眠恢復與交換檔案到達時檢查。同一工作區的完整後續版本且本機無修改時，直接在原視窗更新。真正雙邊修改保留分支，再請您選擇。缺檔時自動重試，也可選「使用本機版」。\r\nCtrl+S、正常關閉、每 10 分鐘有變更時及切到背景會嘗試保存。右上角顯示保存結果；交換區不可用時先保存本機待送快照，恢復後重試。這不是 OneDrive 已上傳完成的保證。\r\n本機 v503｜快照 v501 是本機提交與快照的對照，不是快照份數；時間、電腦名稱可於設定查看。\r\n\r\n後續程式更新\r\n發現 OneDrive 已到達且相容的簽章增量包時，右上角顯示「更新並重新啟動」。按一次即可保存、更新及重開，不需手動解壓。檔案不完整會等待，失敗會保留或回復舊程式；開發用 Git 目錄不會被更新器覆寫。\r\n\r\n本機筆記、附件及設定：%LOCALAPPDATA%\\InkBridge\r\n本包不含既有筆記、帳號、私鑰或預設同步路徑。只供私人本機測試，不發布公開 Release。\r\n`,'utf8');
  const files=[];
  async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),relative=path.relative(output,file).replaceAll('\\','/');
    if(entry.isSymbolicLink())throw Error('Portable build refuses symlinks: '+relative);
    if(entry.isDirectory()){if(/^(profiles|Profile|Session|Workspace|files|Recovery|exports|SnapshotStaging|Restore-)/i.test(entry.name))throw Error('Private data directory in package: '+relative);await walk(file);}
    else{if(/\.(sqlite3|db)(-|$)|token|storage-settings|snapshot-state|local-endpoint/i.test(entry.name)&&!relative.endsWith('storage-settings.cjs')&&!relative.endsWith('storage-settings.mjs'))throw Error('Private state in package: '+relative);files.push({path:relative,bytes:(await fs.stat(file)).size,sha256:await hash(file)});}
  }}
  await walk(output);files.sort((a,b)=>a.path.localeCompare(b.path));
  for(const required of ['Start-InkBridge.bat','Recover-InkBridge.ps1','runtime/electron.exe'])if(!files.some(f=>f.path===required))throw Error('Missing portable entry: '+required);
  const manifest={format:'inkbridge-private-portable',version,commit,createdAt:new Date().toISOString(),electronVersion:require('electron/package.json').version,architecture:'win32-x64',entry:'Start-InkBridge.bat',dataDirectory:'%LOCALAPPDATA%\\InkBridge',files};
  manifest.buildId=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  manifest.releaseSequence=Number(process.env.INKBRIDGE_RELEASE_SEQUENCE||1);
  manifest.sourceTreeClean=!execFileSync('git',['diff','--name-only','HEAD','--','src','scripts/original-reuse'],{cwd:project,encoding:'utf8',windowsHide:true}).trim();
  await fs.writeFile(path.join(output,'portable-build.json'),JSON.stringify(manifest,null,2));
  if(process.env.INKBRIDGE_BUILD_DIRECTORY_ONLY==='1'){const result={directory:output,manifest:path.join(output,'portable-build.json'),candidateOnly:true};await fs.writeFile(path.join(project,'release','last-portable-candidate.json'),JSON.stringify(result,null,2));return result;}
  const zip=output+'.zip';
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath $env:INKBRIDGE_PORTABLE_DIR -DestinationPath $env:INKBRIDGE_PORTABLE_ZIP -CompressionLevel Optimal'],{env:{...process.env,INKBRIDGE_PORTABLE_DIR:output,INKBRIDGE_PORTABLE_ZIP:zip},windowsHide:true,stdio:'pipe'});
  const result={directory:output,manifest:path.join(output,'portable-build.json'),zip,zipSha256:await hash(zip),zipBytes:(await fs.stat(zip)).size};
  await fs.writeFile(zip+'.sha256',`${result.zipSha256}  ${path.basename(zip)}\n`);
  await fs.writeFile(path.join(project,'release','last-portable-build.json'),JSON.stringify(result,null,2));
  return result;
}
if(require.main===module)buildPortable().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={buildPortable};
