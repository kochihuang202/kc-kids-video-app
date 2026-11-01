// Reversible private-source instrumentation. It logs only when explicitly enabled.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../private-original-editor'),file=path.join(root,'source-modules/module-10969.cjs'),backup=file+'.before-menu-trace',sha=text=>crypto.createHash('sha256').update(text).digest('hex');
if(process.argv.includes('--restore')){if(fs.existsSync(backup))fs.copyFileSync(backup,file);process.exit(0);}
const before=fs.readFileSync(file,'utf8');let after=before;
for(const [anchor,replacement]of [
 ['(0, i.useCallback)(() => n(!1), [])',"(0, i.useCallback)(() => {if(globalThis.__inkbridgeTraceMenus)globalThis.__toolbarMenuTrace?.push({kind:'close-set',time:performance.now(),stack:new Error().stack});n(!1);}, [])"],
 ['c = (0, i.useCallback)(e => { e && s(), n(e); }, [s])',"c = (0, i.useCallback)(e => {if(globalThis.__inkbridgeTraceMenus)globalThis.__toolbarMenuTrace?.push({kind:'onOpenChange',open:e,time:performance.now(),stack:new Error().stack});e && s(), n(e); }, [s])"],
 ['() => { a.delete(o); }',"() => {if(globalThis.__inkbridgeTraceMenus)globalThis.__toolbarMenuTrace?.push({kind:'hook-unmount',time:performance.now(),stack:new Error().stack});a.delete(o); }"],
 ]){if(after.includes(replacement))continue;if(after.split(anchor).length!==2)throw Error('Menu trace anchor is not unique');after=after.replace(anchor,replacement);}
if(!fs.existsSync(backup))fs.writeFileSync(backup,before);fs.writeFileSync(file,after);fs.writeFileSync(path.join(root,'menu-trace-patch.json'),JSON.stringify({beforeSha256:sha(before),afterSha256:sha(after),backup:path.basename(backup),conditional:'__inkbridgeTraceMenus'},null,2));
