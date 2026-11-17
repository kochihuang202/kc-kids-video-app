// Private local delivery: explicit runtime allowlist, never profile/data copying.
const fs=require('node:fs/promises'),fss=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const project=path.resolve(__dirname,'../..');
const hash=async file=>{const h=crypto.createHash('sha256');for await(const bytes of fss.createReadStream(file))h.update(bytes);return h.digest('hex');};
async function buildPortable(){
  require('./prepare-sharing.cjs').prepareSharing();
  require('./apply-edit-layout-patches.cjs')({root:path.join(project,'private-original-editor')});
  require('./apply-html-page-patches.cjs')({root:path.join(project,'private-original-editor')});
  execFileSync(process.execPath,[path.join(__dirname,'collect.cjs')],{cwd:project,windowsHide:true,stdio:'pipe'});
  const commit=execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:project,encoding:'utf8',windowsHide:true}).trim();
  const version=require('../../package.json').version;
  const name=`InkBridge-${version}-${commit}-${crypto.randomUUID().slice(0,6)}`;
  const output=path.join(project,'release',name),app=path.join(output,'app');await fs.mkdir(app,{recursive:true});
  const copy=async(from,to)=>{await fs.mkdir(path.dirname(to),{recursive:true});await fs.cp(from,to,{recursive:true,errorOnExist:true,force:false,dereference:false});};
  await copy(path.join(project,'node_modules/electron/dist'),path.join(output,'runtime'));
  for(const dir of ['src/main','src/core','src/web-share'])await copy(path.join(project,dir),path.join(app,dir));
  // Only the real image-worker dependency closure; never copy development tools.
  const copiedPackages=new Set();
  async function codecPackage(name,optional=false){
    if(copiedPackages.has(name))return;
    const from=path.join(project,'node_modules',name),metadata=path.join(from,'package.json');
    if(!fss.existsSync(metadata)){if(optional)return;throw Error('Missing codec dependency: '+name);}
    const pkg=JSON.parse(await fs.readFile(metadata,'utf8'));
    if(pkg.os&&!pkg.os.includes('win32')||pkg.cpu&&!pkg.cpu.includes('x64')){if(optional)return;throw Error('Incompatible codec dependency: '+name);}
    copiedPackages.add(name);await copy(from,path.join(app,'node_modules',name));
    for(const dependency of Object.keys(pkg.dependencies||{}))await codecPackage(dependency);
    for(const dependency of Object.keys(pkg.optionalDependencies||{}))await codecPackage(dependency,true);
  }
  // harfbuzzjs: per-publication font subsets (src/main/share-fonts.cjs).
  await codecPackage('sharp');await codecPackage('bmp-js');await codecPackage('harfbuzzjs');await codecPackage('cheerio');
  await copy(path.join(__dirname,'Recover-InkBridge.ps1'),path.join(output,'Recover-InkBridge.ps1'));
  for(const file of ['Diagnose-Sync.ps1','Diagnose-Sync.bat','sync-read-diagnostic.cjs'])await copy(path.join(__dirname,file),path.join(app,'scripts/original-reuse',file));
  for(const file of ['index.html','styles.css'])await copy(path.join(project,'src/renderer',file),path.join(app,'src/renderer',file));
  // Copy only runtime integration files; no tests, extraction tools or evidence.
  for(const file of await fs.readdir(__dirname))if(file.endsWith('.mjs')||['host.cjs','compact-shell.css','standalone-card.html','probe.js'].includes(file))await copy(path.join(__dirname,file),path.join(app,'scripts/original-reuse',file));
  const privateRoot=path.join(project,'private-original-editor');
  require('../web-share/prepare.cjs').prepare();
  await copy(path.join(privateRoot,'web-runtime'),path.join(app,'private-original-editor/web-runtime'));
  for(const file of ['runtime.js','register-original.js','html-page-runtime.cjs'])await copy(path.join(privateRoot,file),path.join(app,'private-original-editor',file));
  for(const dir of ['_next','canvaskit','fonts','pdfjs'])await copy(path.join(privateRoot,'vendor/app',dir),path.join(app,'private-original-editor/vendor/app',dir));
  await fs.writeFile(path.join(app,'package.json'),JSON.stringify({name:'inkbridge-portable',version,private:true,main:'scripts/original-reuse/host.cjs'},null,2));
  const launcher=['@echo off','setlocal','cd /d "%~dp0"','set ELECTRON_RUN_AS_NODE=','set INKBRIDGE_ORIGINAL_PROBE_DATA=','set INKBRIDGE_PORTABLE=1','set INKBRIDGE_ORIGINAL_VIEW=board','if not exist "runtime\\electron.exe" goto missing','if not exist "app\\private-original-editor\\register-original.js" goto missing','"%~dp0runtime\\electron.exe" %* "%~dp0app\\scripts\\original-reuse\\host.cjs"','if errorlevel 1 (','  echo InkBridge could not finish. Your data remains in %LOCALAPPDATA%\\InkBridge.','  pause',')','exit /b',':missing','echo Extract the entire ZIP before running Start-InkBridge.bat.','pause','exit /b 1',''];
  launcher.splice(launcher.indexOf('set INKBRIDGE_PORTABLE=1'),0,'"'+path.win32.join('%SystemRoot%','System32','WindowsPowerShell','v1.0','powershell.exe')+'" -NoProfile -NonInteractive -File "%~dp0Recover-InkBridge.ps1" -InstallRoot "%~dp0."','if errorlevel 1 exit /b 1');
  await fs.writeFile(path.join(output,'Start-InkBridge.bat'),launcher.join('\r\n'));
  await fs.writeFile(path.join(output,'使用說明.txt'),require('./portable-instructions.cjs')({version,commit}),'utf8');
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
