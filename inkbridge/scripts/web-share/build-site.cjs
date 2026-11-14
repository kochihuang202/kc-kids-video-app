const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const exists=p=>fs.access(p).then(()=>true,()=>false);
async function list(dir,prefix=''){const out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+e.name;if(e.isDirectory())out.push(...await list(path.join(dir,e.name),rel+'/'));else out.push(rel);}return out;}
// Build only the reader and service. Synthetic content is removed before deploy.
async function buildSite(){
 const project=path.resolve(__dirname,'../..'),root=path.join(project,'private-share-site'),fixture=path.join(root,'synthetic'),output=path.join(root,'deploy');
 require('../original-reuse/prepare-sharing.cjs').prepareSharing();require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../original-reuse/collect.cjs')],{cwd:project,windowsHide:true,stdio:'pipe'});
 await fs.mkdir(fixture,{recursive:true});require('./prepare.cjs').prepare();
 const graph=await require('../../tests/helpers/web-share-fixture.cjs')(fixture);
 const result=await require('../../src/main/web-share-export.cjs').exportWebShare({graph,rootBoardId:'root',workspaceDirectory:fixture,projectDirectory:project,outputDirectory:path.join(root,'packages')});
 // Reader builds are named by content hash so browsers may keep them forever (the worker sends
 // immutable caching for /reader/inkbridge-reader-<hash>/). current.json names the build shares
 // open with. The previous build and the old fixed name stay deployed for pages already open.
 const staging=path.join(root,'reader-staging');await fs.rm(staging,{recursive:true,force:true});await fs.mkdir(staging,{recursive:true});
 for(const entry of await fs.readdir(result.directory)){if(['assets','share.json','package-manifest.json','_headers','Start-Web.bat','serve.cjs','README.txt'].includes(entry))continue;await fs.cp(path.join(result.directory,entry),path.join(staging,entry),{recursive:true});}
 const digest=crypto.createHash('sha256');for(const file of (await list(staging)).sort()){digest.update(file+'\0');digest.update(await fs.readFile(path.join(staging,file)));}
 const readerBuild='inkbridge-reader-'+digest.digest('hex').slice(0,12),archive=path.join(root,'reader-archive');
 const place=async name=>{const reader=path.join(output,'reader',name);await fs.cp(staging,reader,{recursive:true});
  // The only dynamic values are same-origin data URLs; no key or note is embedded.
  let html=await fs.readFile(path.join(reader,'index.html'),'utf8');html=html.replace(/((?:src|href)=")\.\//g,'$1/reader/'+name+'/');await fs.writeFile(path.join(reader,'index.html'),html);return reader;};
 await fs.rm(path.join(output,'reader'),{recursive:true,force:true});
 await place(readerBuild);await place('inkbridge-reader-v1');
 await fs.mkdir(archive,{recursive:true});const archived=path.join(archive,readerBuild);if(!await exists(archived))await fs.cp(path.join(output,'reader',readerBuild),archived,{recursive:true});
 const previous=(await Promise.all((await fs.readdir(archive)).filter(n=>n!==readerBuild&&/^inkbridge-reader-[a-f0-9]{12}$/.test(n)).map(async n=>({n,t:(await fs.stat(path.join(archive,n))).mtimeMs})))).sort((a,b)=>b.t-a.t).slice(0,1);
 for(const {n} of previous)await fs.cp(path.join(archive,n),path.join(output,'reader',n),{recursive:true});
 await fs.writeFile(path.join(output,'reader','current.json'),JSON.stringify({build:readerBuild}));
 await fs.rm(staging,{recursive:true,force:true});
 await fs.copyFile(path.join(project,'share-site/_worker.js'),path.join(output,'_worker.js'));
 await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]}));
 await fs.writeFile(path.join(root,'wrangler.json'),JSON.stringify({name:'inkbridge-share',pages_build_output_dir:'./deploy',compatibility_date:'2026-11-01',r2_buckets:[{binding:'SHARE_BUCKET',bucket_name:'inkbridge-share'}]},null,2));
 await fs.mkdir(path.join(root,'.wrangler/deploy'),{recursive:true});await fs.writeFile(path.join(root,'.wrangler/deploy/config.json'),JSON.stringify({configPath:'../../wrangler.json'}));
 return {output,config:path.join(root,'wrangler.json'),readerBuild,keptBuilds:previous.map(p=>p.n)};
}
if(require.main===module)buildSite().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={buildSite};
