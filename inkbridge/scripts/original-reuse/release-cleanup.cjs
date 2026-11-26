const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { verifyReleaseZip, readZipEnvelope } = require('../../src/main/release-zip.cjs');
const { verifyEnvelope } = require('../../src/main/program-updates.cjs');
const { writeJSON } = require('../../src/main/sync-files.cjs');
const { hashFile } = require('../../src/main/stream-files.cjs');

const buildName = /^InkBridge-\d+\.\d+\.\d+-[a-f0-9]+-[a-f0-9]+$/i;
const testName = /^inkbridge-update-acceptance-[a-z0-9]{6}$/i;
const signedFullName = /^InkBridge-release-\d+\.\d+\.\d+-[a-f0-9-]+\.zip$/i;
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));

async function directDirectory(root, location, pattern) {
  const resolved = await fs.realpath(location);
  if (path.dirname(resolved) !== root || !pattern.test(path.basename(resolved)) ||
      path.join(root, path.basename(location)) !== resolved || !(await fs.lstat(location)).isDirectory()) {
    throw Error('Unsafe release cleanup directory: ' + location);
  }
  return resolved;
}

async function ownedBuild(directory) {
  const manifest = await readJSON(path.join(directory, 'portable-build.json'));
  if (manifest.format !== 'inkbridge-private-portable' || !Number.isSafeInteger(manifest.releaseSequence) ||
      !/^[a-f0-9]{64}$/.test(manifest.buildId) || !Array.isArray(manifest.files)) throw Error('Unknown build manifest');
  const files = new Set(manifest.files.map(row => row.path));
  files.add('portable-build.json');
  const directories = new Set();
  for (const file of files) {
    for (let parent=path.posix.dirname(file); parent!=='.'&&!directories.has(parent); parent=path.posix.dirname(parent)) {
      directories.add(parent);
      if(parent==='/')break;
    }
  }
  async function check(prefix = '') {
    for (const entry of await fs.readdir(path.join(directory,prefix), { withFileTypes:true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory() && directories.has(name)) await check(name+'/');
      else if (!entry.isFile() || !files.has(name)) throw Error('Unexpected build entry: ' + name);
    }
  }
  await check();
  return manifest;
}

async function containsOnlyRegularEntries(directory) {
  for (const entry of await fs.readdir(directory,{withFileTypes:true})) {
    if(entry.isDirectory())await containsOnlyRegularEntries(path.join(directory,entry.name));
    else if(!entry.isFile())throw Error('Unexpected entry in temporary test directory');
  }
}

async function deliverValidatedRelease({ release, exchange, key, releaseRoot, temporaryRoot = os.tmpdir(), deliver }) {
  releaseRoot = await fs.realpath(releaseRoot);
  temporaryRoot = await fs.realpath(temporaryRoot);
  const acceptance = await readJSON(path.join(releaseRoot,'program-update-acceptance.json'));
  const manifest = (await verifyReleaseZip(release,key)).descriptor;
  if (acceptance.format!=='inkbridge-release-acceptance' || acceptance.targetBuildId!==manifest.targetBuildId ||
      !acceptance.actualElectronUpdateButton || !acceptance.programRestartedHealthy ||
      !acceptance.latestEditorTextPreserved || !acceptance.localSettingsPreserved || !acceptance.closedUpdatedWindowNormally ||
      !/^InkBridge-update-[a-f0-9-]+\.zip$/i.test(acceptance.deltaName)) throw Error('Validated portable upgrade receipt required');
  const base = await directDirectory(releaseRoot,acceptance.baseDirectory,buildName);
  const target = await directDirectory(releaseRoot,acceptance.targetDirectory,buildName);
  const tested = await directDirectory(temporaryRoot,acceptance.root,testName);
  const marker = await readJSON(path.join(tested,'release-acceptance.json'));
  if(JSON.stringify(marker)!==JSON.stringify(acceptance))throw Error('Test directory receipt does not match');
  const baseBuild = await ownedBuild(base), targetBuild = await ownedBuild(target);
  if(baseBuild.buildId!==acceptance.baseBuildId||targetBuild.buildId!==manifest.targetBuildId||
     baseBuild.releaseSequence>=manifest.sequence||targetBuild.releaseSequence!==manifest.sequence)throw Error('Packed build does not match validated directories');
  const deltaFile = path.join(tested,'Exchange',acceptance.deltaName);
  if(path.dirname(await fs.realpath(deltaFile))!==path.join(tested,'Exchange'))throw Error('Tested delta escapes test directory');
  const full = await deliver({release,exchange,key,delta:{file:deltaFile,baseBuildId:baseBuild.buildId}});
  const resultFile=path.join(releaseRoot,`delivery-${manifest.targetVersion}.json`);
  const result={full,delta:full.delta,cleanup:{removed:[],skipped:[]}};
  await writeJSON(resultFile,result);
  await writeJSON(path.join(releaseRoot,'last-portable-build.json'),{
    directory:target,manifest:path.join(target,'portable-build.json'),zip:full.zip,
    zipSha256:full.sha256,zipBytes:full.bytes,version:manifest.targetVersion,buildId:manifest.targetBuildId,
  });
  const {removed,skipped}=result.cleanup;
  const attempt=async(name,action)=>{
    try{await action();removed.push(name);}
    catch(error){skipped.push({name,reason:error.message});}
  };
  for(const entry of await fs.readdir(releaseRoot,{withFileTypes:true})){
    const location=path.join(releaseRoot,entry.name);
    if(entry.isDirectory()&&buildName.test(entry.name)&&location!==base&&location!==target){
      await attempt(entry.name,async()=>{
        const directory=await directDirectory(releaseRoot,location,buildName),old=await ownedBuild(directory);
        if(old.releaseSequence>=manifest.sequence)throw Error('Current or newer build');
        await fs.rm(directory,{recursive:true});
        const zip=location+'.zip', checksum=zip+'.sha256';
        const stat=await fs.lstat(zip).catch(error=>{if(error.code!=='ENOENT')throw error;});
        if(!stat)return;
        await attempt(path.basename(zip),async()=>{
          if(!stat.isFile()||!(await fs.lstat(checksum)).isFile())throw Error('Unknown loose full package');
          const [expected]= (await fs.readFile(checksum,'utf8')).trim().split(/\s+/);
          if(!/^[a-f0-9]{64}$/.test(expected)||await hashFile(zip)!==expected)throw Error('Loose full package hash differs');
          await fs.unlink(zip);
          await fs.unlink(checksum);
        });
      });
    }
    if(entry.isDirectory()&&/^final-\d+\.\d+\.\d+(?:-(?:r\d+|verified))?$/.test(entry.name)){
      const directory=await directDirectory(releaseRoot,location,/^final-/);
      for(const file of await fs.readdir(directory,{withFileTypes:true})){
        if(!file.isFile()||!signedFullName.test(file.name))continue;
        const filePath=path.join(directory,file.name);
        if(filePath===path.resolve(release))continue;
        await attempt(path.join(entry.name,file.name),async()=>{
          const old=verifyEnvelope(await readZipEnvelope(filePath),key);
          if(old.mode!=='full'||old.sequence>=manifest.sequence)throw Error('Current or newer full release');
          await fs.unlink(filePath);
        });
      }
    }
  }
  await attempt(path.basename(tested),async()=>{
    const directory=await directDirectory(temporaryRoot,tested,testName);
    await containsOnlyRegularEntries(directory);
    await fs.rm(directory,{recursive:true});
  });
  await writeJSON(resultFile,result);
  return result;
}

module.exports={deliverValidatedRelease};
