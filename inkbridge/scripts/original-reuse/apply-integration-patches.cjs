// Minimal, reversible visibility/callback patches; no editor/draw logic replaced.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../private-original-editor'),hash=value=>crypto.createHash('sha256').update(value).digest('hex'),changes=[];
function patch(id,anchor,replacement,description){
  const file=path.join(root,'source-modules',`module-${id}.cjs`),source=fs.readFileSync(file,'utf8');
  if(source.includes(replacement)){changes.push({id,description,status:'already applied',afterSha256:hash(source)});return;}
  if(source.split(anchor).length!==2)throw Error('Original integration anchor is not unique: '+id);
  const after=source.replace(anchor,replacement),backup=file+'.before-inkbridge';if(!fs.existsSync(backup))fs.writeFileSync(backup,source);
  fs.writeFileSync(file,after);changes.push({id,description,beforeSha256:hash(source),afterSha256:hash(after)});
}
patch('64744','default: function () { return oI; }','InkBridgeCanvasHostProvider: function () { return ov; }, default: function () { return oI; }','Expose the existing complete CanvasKit host provider');
patch('34883','id: u, onBlur: J, editorBlocks: n','id: u, onEditorReady: e.onEditorReady, onBlur: J, editorBlocks: n','Pass an existing optional Editor callback through the original flow wrapper');
patch('58850','let p = (e, t) => (0, o.d)()', 'let p = (e, t) => globalThis.__inkbridgeServices?.has(e) ? globalThis.__inkbridgeServices.call(e, t) : (0, o.d)()', 'Delegate explicitly supported original service calls to the real InkBridge data boundary');
patch('23733','Tabbar: function () { return e5; }','InkBridgeHistoryTabs: function () { return eR; }, Tabbar: function () { return e5; }','Expose the complete original history-tab strip without substituting its logic');
patch('41','n: function () { return iV; }','InkBridgeFlowOutline: function () { return nk; }, n: function () { return iV; }','Expose the complete original flow card-list/search component');
patch('64744','InkBridgeCanvasHostProvider: function () { return ov; },','InkBridgeCreateWhiteboard: function () { return rb; }, InkBridgeCanvasHostProvider: function () { return ov; },','Expose the complete original whiteboard creation dialog');
patch('36339','"flexnote://".concat(r.YH.spaceId','"inkbridge://".concat(r.YH.spaceId','Use the InkBridge scheme in the original link formatter; no OS registration changed');
patch('64744','InkBridgeCreateWhiteboard: function () { return rb; },','InkBridgeCreateFolder: function () { return rw; }, InkBridgeCreateWhiteboard: function () { return rb; },','Expose the existing complete original folder dialog');
fs.writeFileSync(path.join(root,'integration-patches.json'),JSON.stringify(changes,null,2));console.log(JSON.stringify(changes));
