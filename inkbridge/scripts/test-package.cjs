const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const project=path.resolve(__dirname,'..');const build=JSON.parse(fs.readFileSync(path.join(project,'release/last-build.json')));
const executable=path.resolve(build.executable);
if(!executable.startsWith(path.join(project,'release')+path.sep)||path.basename(executable)!=='InkBridge.exe')throw Error('Unexpected package path');
const result=spawnSync(process.execPath,[path.join(project,'node_modules/@playwright/test/cli.js'),'test','--grep','actual Electron|add Chinese|Lexical rich text|Chromium IME|pressure scenes|switching cards|overlay accurately|newly created long card|timed-out close'],{
  cwd:project,stdio:'inherit',env:{...process.env,INKBRIDGE_PACKAGED_EXE:executable}});
if(result.error)throw result.error;process.exitCode=result.status??1;
