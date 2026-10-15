import {readFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const [video,ffmpeg]=process.argv.slice(2);
if(!video||!ffmpeg)throw new Error('Usage: node scripts/extract-stills.mjs <video.mp4> <ffmpeg executable>');
const source=JSON.parse(readFileSync(path.join(root,'content/image-sources.json')));
mkdirSync(path.join(root,'public/assets/episode'),{recursive:true});
function capture(second,filter,destination){
  const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-ss',String(second),'-i',video,'-frames:v','1','-vf',filter,'-q:v','3','-y',destination],{stdio:'inherit'});
  if(r.error)throw r.error;if(r.status!==0)throw new Error(`Capture failed at ${second}s`);
}
for(const [name,second]of Object.entries(source.stills))capture(second,'scale=960:-1',path.join(root,'public/assets/episode',name+'.jpg'));
capture(source.avatar.second,`crop=${source.avatar.crop},scale=${source.avatar.size}:${source.avatar.size}`,path.join(root,'public/assets/shimajiro-avatar.jpg'));
console.log(`Extracted ${Object.keys(source.stills).length} stills and one avatar; original video unchanged.`);
