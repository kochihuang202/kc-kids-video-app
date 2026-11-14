// Opening links from notes (src/main/open-links.cjs): web, mail and app links go straight to
// the system; local files, network paths and file-reaching Windows protocols ask first;
// script schemes are refused.
const test=require('node:test'),assert=require('node:assert/strict');
const {createLinkOpener,classify}=require('../src/main/open-links.cjs');
test('classification follows the user decision of 2026-11-14',()=>{
 for(const url of ['https://foxconn.sharepoint.com/:x:/s/ISGDPM/IQ?e=x&ovuser=a%40b','http://example.com','mailto:a@b.com','msteams:/l/chat/0/0','ms-excel:ofe|u|https://x/y.xlsx','zoommtg://zoom.us/join'])assert.equal(classify(url).kind,'external',url);
 assert.deepEqual(classify('file:///C:/Windows/notepad.exe'),{kind:'local',path:'C:\\Windows\\notepad.exe'});
 assert.deepEqual(classify('file://server/share/x.bat'),{kind:'local',path:'\\\\server\\share\\x.bat'});
 assert.deepEqual(classify('C:\\tools\\run.bat'),{kind:'local',path:'C:\\tools\\run.bat'});
 assert.deepEqual(classify('\\\\server\\share\\a.exe'),{kind:'local',path:'\\\\server\\share\\a.exe'});
 for(const url of ['search-ms:query=x','ms-msdt:/id x','shell:startup'])assert.equal(classify(url).kind,'confirm',url);
 for(const url of ['javascript:alert(1)','data:text/html,x','vbscript:x','flexnote://app/card?objectId=1','',' ','not a url','https://a\nb'])assert.equal(classify(url).kind,'refused',JSON.stringify(url));
 assert.equal(classify('https://x/'+'a'.repeat(9000)).kind,'refused');
});
test('opener: external directly, local only after confirmation, refused never',async()=>{
 const calls=[];let answer=1;
 const shell={openExternal:async url=>calls.push(['external',url]),openPath:async p=>{calls.push(['path',p]);return '';}};
 const dialog={showMessageBox:async(...args)=>{calls.push(['ask',(args.length>1?args[1]:args[0]).detail]);return {response:answer};}};
 const stat=async p=>p==='C:\\missing'?Promise.reject(Object.assign(Error('missing'),{code:'ENOENT'})):{isDirectory:()=>p==='C:\\Users\\ji3cp\\Documents\\ESS'};
 const {open}=createLinkOpener({shell,dialog,stat,appOrigin:'http://127.0.0.1:4000'});
 assert.deepEqual(await open('https://example.com/a'),{success:true,mode:'external'});
 assert.deepEqual(await open('C:\\tools\\run.bat'),{success:false,reason:'cancelled'});
 answer=0;assert.deepEqual(await open('C:\\tools\\run.bat'),{success:true,mode:'local'});
 assert.deepEqual(await open('search-ms:query=x'),{success:true,mode:'external'});
 assert.deepEqual(await open('javascript:alert(1)'),{success:false,reason:'scheme-javascript'});
 assert.deepEqual(calls.splice(0),[['external','https://example.com/a'],['ask','C:\\tools\\run.bat'],['ask','C:\\tools\\run.bat'],['path','C:\\tools\\run.bat'],['ask','search-ms:query=x'],['external','search-ms:query=x']]);
 // Folders open without asking; a missing path only says so; the app's own address is refused.
 answer=1;assert.deepEqual(await open('C:\\Users\\ji3cp\\Documents\\ESS'),{success:true,mode:'folder'});
 assert.deepEqual(await open('C:\\missing'),{success:false,reason:'not-found'});
 assert.deepEqual(await open('http://127.0.0.1:4000/server/share'),{success:false,reason:'app-origin'});
 assert.deepEqual(calls,[['path','C:\\Users\\ji3cp\\Documents\\ESS'],['ask','C:\\missing']]);
});
