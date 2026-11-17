// Complete 1.1.70 drop handlers and backend bundler; bind only host boundaries.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript');
module.exports=function({root,changes=[]}){
 const input=path.join(root,'html-drop-research'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
 const identities={71891:'5017cbe041a968b9021a76240461c6ee7745068ffcef0b7245df399359e97b9d',28416:'5fa1ba3ebfcec4add5c0d826763f711a5b90dee1c72ee342e8344044d98f3526',61186:'bb847084b30ec5d62d472b4ba0025699d8024753f8f625709d6d19caceadf21a'};
 const formatted={71891:'615629a7c8b7da77dd92c6d40841bd1d988ec907271c512332bba12a0d1fcbd7',28416:'bce1da1568e8a366cdc2721ad3e61cd80fdf8c4c2f0b5ec458b52655487c7e50',61186:'9baea1325ad77a23008cf64c0d5f77bd310bb882cde16f9fe521a4bc306892b4',78784:'ab89d62cd3c7e227d47649f91d17759daf78f23b326cd6a682a79cd7e85a927a',19281:'be84338dc9d99694b95a66d0f735b6e6a2617061f67880571e0b44a35c55ac9b'};
 function read(id,main=false){const name=(main?'main-':'module-')+id+'.cjs',source=fs.readFileSync(path.join(input,name),'utf8'),ast=ts.createSourceFile(name,source,99,true);if(ast.parseDiagnostics.length||sha(source)!==formatted[id])throw Error('Invalid or changed HTML source '+id);return source;}
 function write(id,source){const file=path.join(root,'source-modules/module-'+id+'.cjs');if(ts.createSourceFile(file,source,99,true).parseDiagnostics.length)throw Error('Invalid HTML integration '+id);const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;const backup=path.join(root,'html-source-backups',path.basename(file));fs.mkdirSync(path.dirname(backup),{recursive:true});if(before!==null&&!fs.existsSync(backup))fs.writeFileSync(backup,before);fs.writeFileSync(file,source);changes.push({id,description:'Complete native HTML drop integration',referenceFactorySha256:identities[id],afterSha256:sha(source)});return source;}
 // Newer reducer ID is the same shared flow slice contract; keep one singleton.
 write(97101,read(28416).replace('n(62429)','n(23407)'));
 write(61186,read(61186).replace('n(62429)','n(23407)'));
 const helper=write(78784,read(78784));
 fs.writeFileSync(path.join(root,'html-page-modules.json'),JSON.stringify({78784:{file:'source-modules/module-78784.cjs',sha256:sha(helper),referenceFactorySha256:sha(read(78784))}},null,2));
 // Reuse the complete native WebsiteCard constructor with its file/raw fields.
 const file=path.join(root,'source-modules/module-19281.cjs');let current=fs.readFileSync(file,'utf8');
 const latest=read(19281);function method(source){const ast=ts.createSourceFile('model',source,99,true);let result;function visit(n){if(ts.isMethodDeclaration(n)&&n.name.getText(ast)==='newWebsiteCard')result={start:n.getStart(ast),end:n.end,text:n.getText(ast)};ts.forEachChild(n,visit);}visit(ast);if(!result)throw Error('Missing native WebsiteCard constructor');return result;}
 const old=method(current),next=method(latest).text.replace('N.newEmptyEditorContent()','D.newEmptyEditorContent()').replaceAll('k.h3','C.h3');
 current=current.slice(0,old.start)+next+current.slice(old.end);write(19281,current);
 // Expose the complete native collector; SQLite/CAS commit remains owned by InkBridge.
 let backend=read(71891,true).replace('PM: () => le,','InkBridgePackage: () => Ie, PM: () => le,');
 fs.writeFileSync(path.join(root,'html-page-runtime.cjs'),backend);
 fs.writeFileSync(path.join(root,'html-page-source-receipt.json'),JSON.stringify({version:'1.1.70',artifactSha256:'55f2510a542593342409e591b3d0040b51702f64306fb629d9820c37fe474f4b',identities,backendSha256:sha(backend)},null,2));
};
