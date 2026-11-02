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
  launcher.splice(launcher.indexOf('set INKBRIDGE_PORTABLE=1'),0,'powershell.exe -NoProfile -NonInteractive -File "%~dp0Recover-InkBridge.ps1" -InstallRoot "%~dp0."','if errorlevel 1 exit /b 1');
  await fs.writeFile(path.join(output,'Start-InkBridge.bat'),launcher.join('\r\n'));
  await fs.writeFile(path.join(output,'使用說明.txt'),`InkBridge 墨橋 ${version}\r\n\r\n1. 請完整解壓 ZIP 到本機，例如 C:\\Apps\\InkBridge-${version}，不要直接在 ZIP 裡啟動。\r\n2. 雙擊 Start-InkBridge.bat。不需要安裝 Node.js、npm 或 FlexNote。\r\n3. 點左下角齒輪 → 儲存與同步 → 瀏覽 → 選擇此電腦對應的 OneDrive 交換資料夾，按套用。\r\n4. 接手另一台資料：等 OneDrive 檔案到齊，按重新掃描快照，選擇來源工作區的完整快照 → 載入。\r\n5. Ctrl+S、每 10 分鐘、正常關閉會保存有變更的快照。OneDrive 上傳完成由您確認。\r\n\r\n本機筆記、附件與設定：%LOCALAPPDATA%\\InkBridge\r\n本包不含任何既有筆記、帳號或同步路徑設定。\r\n更新程式：關閉 InkBridge，把新版 ZIP 解壓到另一個本機目錄，再啟動新版的 .bat；本機資料仍在相同 AppData 位置。保留舊版程式供回退。較新 Schema 的資料不保證可被舊版讀取，請先保存快照。\r\n這台目前若使用原始碼目錄的 Start-InkBridge.bat，其既有資料位置不會自動搬動；改用本包時請先在舊版建立快照，再於本包設定中載入。\r\n\r\n此為私人本機測試交付，不上傳公開 Release。\r\n`,'utf8');
  await fs.appendFile(path.join(output,'使用說明.txt'),`\r\n本次版本：${commit}\r\n啟動後會自動檢查已設定交換區，發現同一版本鏈的新版本會在右上提示；按保存本機後載入新版才會切換。遇到分支請查看所有版本，缺檔請等下載到齊後重新檢查。\r\n左下角「本機 v503｜快照 v501」是本機提交與最近快照的對照，不是快照份數，也不表示 OneDrive 上傳完成。\r\n`,'utf8');
  const files=[];
  async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),relative=path.relative(output,file).replaceAll('\\','/');
    if(entry.isSymbolicLink())throw Error('Portable build refuses symlinks: '+relative);
    if(entry.isDirectory()){if(/^(profiles|Profile|Session|Workspace|files|Recovery|exports|SnapshotStaging|Restore-)/i.test(entry.name))throw Error('Private data directory in package: '+relative);await walk(file);}
    else{if(/\.(sqlite3|db)(-|$)|token|storage-settings|snapshot-state|local-endpoint/i.test(entry.name)&&!relative.endsWith('storage-settings.cjs')&&!relative.endsWith('storage-settings.mjs'))throw Error('Private state in package: '+relative);files.push({path:relative,bytes:(await fs.stat(file)).size,sha256:await hash(file)});}
  }}
  await walk(output);files.sort((a,b)=>a.path.localeCompare(b.path));
  const manifest={format:'inkbridge-private-portable',version,commit,createdAt:new Date().toISOString(),electronVersion:require('electron/package.json').version,architecture:'win32-x64',entry:'Start-InkBridge.bat',dataDirectory:'%LOCALAPPDATA%\\InkBridge',files};
  manifest.buildId=crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  manifest.releaseSequence=Number(process.env.INKBRIDGE_RELEASE_SEQUENCE||1);
  await fs.writeFile(path.join(output,'portable-build.json'),JSON.stringify(manifest,null,2));
  const zip=output+'.zip';
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Compress-Archive -LiteralPath $env:INKBRIDGE_PORTABLE_DIR -DestinationPath $env:INKBRIDGE_PORTABLE_ZIP -CompressionLevel Optimal'],{env:{...process.env,INKBRIDGE_PORTABLE_DIR:output,INKBRIDGE_PORTABLE_ZIP:zip},windowsHide:true,stdio:'pipe'});
  const result={directory:output,manifest:path.join(output,'portable-build.json'),zip,zipSha256:await hash(zip),zipBytes:(await fs.stat(zip)).size};
  await fs.writeFile(zip+'.sha256',`${result.zipSha256}  ${path.basename(zip)}\n`);
  await fs.writeFile(path.join(project,'release','last-portable-build.json'),JSON.stringify(result,null,2));
  return result;
}
if(require.main===module)buildPortable().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={buildPortable};
