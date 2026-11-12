// Video record (highlight) integration patches. Sources and reasons: docs/VIDEO_RECORD.md.
// Each change is idempotent, anchored on the original text, and syntax-checked.
const fs=require('fs'),path=require('path'),ts=require('typescript'),crypto=require('crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=({root,changes})=>{
 function patch(id,description,apply){
  const file=path.join(root,'source-modules/module-'+id+'.cjs'),before=fs.readFileSync(file,'utf8'),after=apply(before);
  if(ts.createSourceFile(file,after,99,true,ts.ScriptKind.JS).parseDiagnostics.length)throw Error('Video record patch syntax: '+id);
  if(after!==before)fs.writeFileSync(file,after);
  changes.push({id,description,beforeSha256:hash(before),afterSha256:hash(after)});
 }
 const once=(source,from,to,label)=>{if(source.includes(to))return source;if(source.split(from).length!==2)throw Error('Video record anchor missing or ambiguous: '+label);return source.replace(from,()=>to);};
 // 59771 player: the linked local file is served by the flexnote: scheme with CORS headers.
 // Without crossOrigin the original frame capture (79719 eS) taints its canvas and
 // toDataURL throws, so neither covers nor highlight screenshots can be produced.
 // The player option alone is applied after the tech has started loading its source; the
 // attribute on the video-js tag is copied to the <video> before the first request.
 patch('59771','Request the local video with CORS so the original frame capture is not tainted',source=>once(once(source,
  'r = { autoplay: s, controls: !0, responsive: !0, fluid: !0, sources: [',
  'r = { autoplay: s, controls: !0, responsive: !0, fluid: !0, crossOrigin: "anonymous", sources: [','player options'),
  'let t = document.createElement("video-js");',
  'let t = document.createElement("video-js"); t.setAttribute("crossorigin", "anonymous");','player tag'));
 patch('79719','Highlight panel: exact marker time, and -5s/-1s/play/+1s/+5s controls (user decisions 2026-11-12)',source=>{
  const live='(eh && Number.isFinite(eh.currentTime) ? eh.currentTime : C)';
  // The original marks with C, a value polled once per second (up to 1s stale), and only
  // binds its <video> two seconds after mounting (or never, in the embedded sidebar player
  // when the load callback was missed): a marker pressed before that was stored as 0.
  // Resolve the player element at press time and read its exact position.
  const begin=source.indexOf('let ej = async () => {'),finish=source.indexOf('(0, z.y1)("m", ej)',begin);if(begin<0||finish<0)throw Error('Video record anchor missing: marker handler');
  let handler=source.slice(begin,finish);
  if(!handler.includes('inkbridgeVideo')){
   const head='let ej = async () => { eS(); let t = async (t) => { let i = w.YH.newVideoHighlight(C, ',capture='eC(e.fileId, ek(), C)';
   if(handler.split(head).length!==2||handler.split(capture).length!==2)throw Error('Video record anchor missing: marker time');
   handler=handler.replace(head,()=>'let ej = async () => { let inkbridgeVideo = eh || (e.showVideo ? Y.current && Y.current.querySelector("video") : document.querySelector(".video-page-container video")) || null; inkbridgeVideo && !eh && (ep(inkbridgeVideo), inkbridgeVideo.pause()); eS(); let inkbridgeTime = inkbridgeVideo && Number.isFinite(inkbridgeVideo.currentTime) ? inkbridgeVideo.currentTime : C; "number" == typeof inkbridgeTime && O(inkbridgeTime); let t = async (t) => { let i = w.YH.newVideoHighlight(inkbridgeTime, ').replace(capture,()=>'eC(e.fileId, inkbridgeVideo || ek(), inkbridgeTime)');
   source=source.slice(0,begin)+handler+source.slice(finish);
  }
  source=once(source,'eC(e.fileId, ek(), C)','eC(e.fileId, ek(), '+live+')','screenshot time');
  // Bind the record page's player promptly instead of after two seconds.
  source=once(source,'r && ev(r); }, 2e3); return () => { t = !0, window.clearTimeout(i); };','r && ev(r); }, 300); return () => { t = !0, window.clearTimeout(i); };','player binding delay');
  source=once(source,'(0, z.y1)("left", eA);','(0, z.y1)("left", eA), (0, z.y1)("shift+right", () => eD(1)), (0, z.y1)("shift+left", () => eD(-1));','one-second shortcuts');
  if(!source.includes('"data-inkbridge-seek"')){
   const start=source.indexOf('(0, i.jsxs)(d.g, { children: [(0, i.jsx)(l.e, { content: r("videoRewindTips")'),endMark='startContent: (0, i.jsx)(K.default, { width: 14 }) }) })] })',end=source.indexOf(endMark,start);
   if(start<0||end<0)throw Error('Video record anchor missing: control row');
   const block=source.slice(start,end+endMark.length),playStart=block.indexOf('(0, i.jsx)(l.e, { content: X ? r("videoPauseTips")'),playEnd=block.indexOf(', (0, i.jsx)(l.e, { content: r("videoForwardTips")');
   if(playStart<0||playEnd<0)throw Error('Video record anchor missing: play control');
   const play=block.slice(playStart,playEnd),seek=(delta,tip)=>'(0, i.jsx)(l.e, { content: '+tip+', placement: "top", color: "foreground", size: "sm", children: (0, i.jsx)(c.A, { size: "sm", onPress: () => eD('+delta+'), variant: "flat", className: "min-w-9 px-1.5 text-xs tabular-nums", "data-inkbridge-seek": "'+delta+'", children: "'+(delta>0?'+':'−')+Math.abs(delta)+'s" }) })';
   source=source.slice(0,start)+'(0, i.jsxs)(d.g, { children: ['+[seek(-5,'r("videoRewindTips")'),seek(-1,'"−1s (Shift+←)"'),play,seek(1,'"+1s (Shift+→)"'),seek(5,'r("videoForwardTips")')].join(', ')+'] })'+source.slice(end+endMark.length);
  }
  return source;
 });
};
