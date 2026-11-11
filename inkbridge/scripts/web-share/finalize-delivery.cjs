const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function finalize(){
 const project=path.resolve(__dirname,'../..'),d=JSON.parse(await fsp.readFile(path.join(project,'release/last-portable-candidate.json'))),m=JSON.parse(await fsp.readFile(d.manifest)),zip=d.directory+'.zip',h=crypto.createHash('sha256');
 for await(const b of fs.createReadStream(zip))h.update(b);
 const sha=h.digest('hex'),out={...d,candidateOnly:undefined,zip,zipSha256:sha,zipBytes:(await fsp.stat(zip)).size};
 await fsp.writeFile(path.join(project,'release/last-portable-build.json'),JSON.stringify(out,null,2));await fsp.writeFile(zip+'.sha256',sha+'  '+path.basename(zip)+'\n');
 const name='Start-InkBridge-'+m.version,folder=path.join(project,'release/onedrive-delivery');await fsp.mkdir(folder,{recursive:true});
 await fsp.copyFile(path.join(project,'scripts/original-reuse/OneDrive-Launcher.ps1'),path.join(folder,name+'.ps1'));
 await fsp.writeFile(path.join(folder,name+'.json'),JSON.stringify({format:'inkbridge-local-launcher',version:1,zipName:path.basename(zip),packageFolder:path.basename(d.directory),sha256:sha,buildId:m.buildId},null,2));
 const command=String.raw`"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0%~n0.ps1" %*`;
 await fsp.writeFile(path.join(folder,name+'.bat'),['@echo off','setlocal','set PSModulePath=',command,'if errorlevel 1 (','  pause','  exit /b 1',')',''].join('\r\n'));
 return {zip,sha256:sha,bytes:out.zipBytes,launcher:path.join(folder,name+'.bat')};
}
if(require.main===module)finalize().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={finalize};
