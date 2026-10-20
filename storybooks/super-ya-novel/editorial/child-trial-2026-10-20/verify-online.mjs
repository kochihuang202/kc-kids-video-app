import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=fileURLToPath(new URL('.',import.meta.url));
const root=path.resolve(here,'../..');
const stage=path.join(root,'output/drafts/super-ya-first-five-2026-10-20');
const dist=path.join(stage,'dist');
const origin='https://shimajiro-reading-trial.ji3cp31p4.workers.dev';
const production='https://shimajiro-reading.ji3cp31p4.workers.dev';
const cloudflareVersionId=process.argv[2];
assert.match(cloudflareVersionId||'',/^[a-f0-9-]{36}$/,'請傳入本次 Wrangler 部署回報的 Version ID');
const readJson=file=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function files(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(directory,item.name)):[path.join(directory,item.name)]);}

const expectedRelease=readJson(path.join(dist,'release.json'));
const before=readJson(path.join(stage,'production-before.json'));
const redirect=await fetch(origin+'/read',{redirect:'manual'});
assert.equal(redirect.status,302);
assert.equal(new URL(redirect.headers.get('location'),origin).href,origin+'/?book=super-ya-revisit&chapter=0&preview=1');
const paths=files(dist).filter(file=>!path.basename(file).startsWith('_'));
// Compare every deployed asset, including the phonetic font, against the reviewed build.
for(let start=0;start<paths.length;start+=8)await Promise.all(paths.slice(start,start+8).map(async file=>{
  const name=path.relative(dist,file).split(path.sep).join('/');
  const result=await fetch(origin+'/'+name,{cache:'no-store'});
  assert.equal(result.status,200,name);
  assert.equal(hash(Buffer.from(await result.arrayBuffer())),hash(readFileSync(file)),name);
}));
assert.match(readFileSync(path.join(dist,'index.html'),'utf8'),/name="reading-preview"/);
const story=await (await fetch(origin+'/books/super-ya-revisit/story.json')).json();
assert.equal(story.chapters.length,5);
assert.equal(story.edition,'first-five-child-trial-2026-10-20');
const after=await (await fetch(production+'/release.json',{cache:'no-store'})).json();
assert.equal(after.id,before.id,'正式站版本不可被試讀發布更動');
const record={date:'2026-10-20',worker:'shimajiro-reading-trial',cloudflareVersionId,origin,readingUrl:origin+'/read',release:expectedRelease,chapters:story.chapters.map(c=>c.title),verifiedAssets:paths.length,previewIsolated:true,productionReleaseBefore:before.id,productionReleaseAfter:after.id,notes:['此站為獨立靜態試讀；無 D1 綁定，不修改正式書架與進度。','閱讀位置與設定保存在試讀站目前瀏覽器；不具跨裝置雲端同步。','未做實體 iPad Safari 驗收。']};
writeFileSync(path.join(here,'deployment.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
