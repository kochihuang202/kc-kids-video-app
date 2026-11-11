const fs=require('node:fs/promises'),path=require('node:path');
// Build only the reader and service. Synthetic content is removed before deploy.
async function buildSite(){
 const project=path.resolve(__dirname,'../..'),root=path.join(project,'private-share-site'),fixture=path.join(root,'synthetic'),output=path.join(root,'deploy');
 require('../original-reuse/prepare-sharing.cjs').prepareSharing();require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../original-reuse/collect.cjs')],{cwd:project,windowsHide:true,stdio:'pipe'});
 await fs.mkdir(fixture,{recursive:true});require('./prepare.cjs').prepare();
 const graph=await require('../../tests/helpers/web-share-fixture.cjs')(fixture);
 const result=await require('../../src/main/web-share-export.cjs').exportWebShare({graph,rootBoardId:'root',workspaceDirectory:fixture,projectDirectory:project,outputDirectory:path.join(root,'packages')});
 const readerBuild='inkbridge-reader-v1',reader=path.join(output,'reader',readerBuild);await fs.mkdir(reader,{recursive:true});
 for(const entry of await fs.readdir(result.directory)){if(['assets','share.json','package-manifest.json','_headers','Start-Web.bat','serve.cjs','README.txt'].includes(entry))continue;await fs.cp(path.join(result.directory,entry),path.join(reader,entry),{recursive:true});}
 // The only dynamic values are same-origin data URLs; no key or note is embedded.
 let html=await fs.readFile(path.join(reader,'index.html'),'utf8');html=html.replace(/((?:src|href)=")\.\//g,'$1/reader/'+readerBuild+'/');await fs.writeFile(path.join(reader,'index.html'),html);
 await fs.copyFile(path.join(project,'share-site/_worker.js'),path.join(output,'_worker.js'));
 await fs.writeFile(path.join(output,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]}));
 await fs.writeFile(path.join(root,'wrangler.json'),JSON.stringify({name:'inkbridge-share',pages_build_output_dir:'./deploy',compatibility_date:'2026-11-01',r2_buckets:[{binding:'SHARE_BUCKET',bucket_name:'inkbridge-share'}]},null,2));
 await fs.mkdir(path.join(root,'.wrangler/deploy'),{recursive:true});await fs.writeFile(path.join(root,'.wrangler/deploy/config.json'),JSON.stringify({configPath:'../../wrangler.json'}));
 return {output,config:path.join(root,'wrangler.json'),readerBuild};
}
if(require.main===module)buildSite().then(v=>console.log(JSON.stringify(v))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={buildSite};
