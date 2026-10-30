// Record the executable AND application components; EXE identity alone is insufficient.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),build=JSON.parse(fs.readFileSync(path.join(root,'release/last-build.json')));
const release=path.dirname(build.executable),appRoot=path.join(release,'resources/app');
if(!release.startsWith(path.join(root,'release')+path.sep))throw Error('Unexpected release path');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files={};
function scan(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())scan(file);else files[path.relative(release,file).split(path.sep).join('/')]=hash(file);}}
scan(path.join(appRoot,'src'));
for(const name of ['package.json','build/editor.mjs','node_modules/canvaskit-wasm/bin/full/canvaskit.wasm'])files['resources/app/'+name]=hash(path.join(appRoot,name));
const manifest={product:build.product,version:build.version,executable:path.relative(root,build.executable).split(path.sep).join('/'),exeSha256:hash(build.executable),createdAt:build.createdAt,files};
const filename=build.version==='0.2.0'?'m2-build-manifest.json':`build-${build.version}-manifest.json`;
fs.writeFileSync(path.join(root,'docs/benchmarks',filename),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({executable:manifest.executable,exeSha256:manifest.exeSha256,components:Object.keys(files).length}));
