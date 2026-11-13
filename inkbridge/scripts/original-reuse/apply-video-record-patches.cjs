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
  // The embedded side-panel player shows only its cover until clicked, so there is no
  // <video> to read and the original stored 0 (the 00:00 rows). Start it, wait for its
  // metadata, then read the exact time. A local video that cannot load adds no marker.
  {const head='let ej = async () => { let inkbridgeVideo = eh || (e.showVideo ? Y.current && Y.current.querySelector("video") : document.querySelector(".video-page-container video")) || null;';
   source=once(source,head,head+' if (!inkbridgeVideo && e.showVideo && Y.current) { let inkbridgeCover = Y.current.querySelector("img[alt=\\"video cover\\"]"); if (inkbridgeCover) { inkbridgeCover.parentElement.click(); for (let k = 0; k < 80 && !((inkbridgeVideo = Y.current && Y.current.querySelector("video")) && inkbridgeVideo.readyState >= 1); k++) await new Promise(r => setTimeout(r, 100)); if (!inkbridgeVideo || inkbridgeVideo.readyState < 1) return; } }','marker starts the embedded player');}
  // Opened with a time (a card's 📍 → original openVideoInSidebar → media view), the
  // embedded player stayed on its cover and the time was lost. Start it at that time, and
  // focus and scroll to the highlight at that time with the panel's own focus state.
  // Earlier form of the next patch did not re-run once the video card loaded.
  if(source.includes('}, [e.showVideo, e.initialTimeStamp, e.fileId]);')&&source.includes('cover.parentElement.click(); } for (let k = 0; k < 80 && !stop'))source=source.replace('}, [e.showVideo, e.initialTimeStamp, e.fileId]);','}, [e.showVideo, e.initialTimeStamp, e.fileId, null == m ? void 0 : m.id]);');
  {const at='let eR = ei ? en.filter(e => e.sourceId === ei) : [], eL = [...eR];';
   source=once(source,at,at+' (0, x.useEffect)(() => { let ts = Number(e.initialTimeStamp); if (!e.showVideo || !Y.current || !Number.isFinite(ts) || ts <= 0) return; let stop = !1; (async () => { let v = Y.current && Y.current.querySelector("video"); if (!v) { let cover = Y.current && Y.current.querySelector("img[alt=\\"video cover\\"]"); cover && cover.parentElement.click(); } for (let k = 0; k < 80 && !stop && !((v = Y.current && Y.current.querySelector("video")) && v.readyState >= 1); k++) await new Promise(r => setTimeout(r, 100)); if (stop || !v || v.readyState < 1) return; Math.abs(v.currentTime - ts) > .25 && (v.currentTime = ts); v.pause(); })(); return () => { stop = !0; }; }, [e.showVideo, e.initialTimeStamp, e.fileId, null == m ? void 0 : m.id]); (0, x.useEffect)(() => { let ts = Number(e.initialTimeStamp); if (!e.showVideo || !Number.isFinite(ts) || ts <= 0 || !eR.length) return; let h = eR.reduce((a, b) => Math.abs(b.timeStamp - ts) < Math.abs(a.timeStamp - ts) ? b : a); if (Math.abs(h.timeStamp - ts) > 1) return; n(h.id); let id = setTimeout(() => { let el = document.querySelector("[data-video-marker-id=\\"" + h.id + "\\"]"); el && el.scrollIntoView({ block: "center" }); }, 80); return () => clearTimeout(id); }, [e.showVideo, e.initialTimeStamp, eR.length]);','open at a time');}
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
 // 47766 video overlay: its root stops mousedown so the canvas never sees the click, and a
 // playing card could only be selected by dragging it (the card toolbar stayed hidden; the
 // original behaves the same). Keep stopping the event, and also select the overlay's own
 // node (user request 2026-11-13).
 // Capture phase: the player inside (video.js) stops the bubbling mousedown first.
 patch('47766','Select the video card when its playing overlay is pressed, so the card toolbar appears',source=>{
  const original='"data-video-overlay-content": !0, onMouseDown: e => e.stopPropagation(),';
  const earlier='"data-video-overlay-content": !0, onMouseDown: e => { e.stopPropagation(); S && S.node && globalThis.__inkbridgeSelectVideoNode && globalThis.__inkbridgeSelectVideoNode(S.node.id, e); },';
  if(source.includes(earlier))source=source.replace(earlier,()=>original);
  return once(source,original,'"data-video-overlay-content": !0, onMouseDownCapture: e => { S && S.node && globalThis.__inkbridgeSelectVideoNode && globalThis.__inkbridgeSelectVideoNode(S.node.id, e); }, onMouseDown: e => e.stopPropagation(),','overlay press');
 });
 // 84539 'open in sidebar' helpers decide whether a whiteboard is showing from
 // window.location, which never contains /flow in this host. A highlight card's 📍 then fell
 // back to the reference list and lost its time. Ask the host instead.
 patch('84539','Ask the host whether a whiteboard is showing before opening media in the side panel',source=>{
  const from='window.location.pathname.includes("/flow")',to='(globalThis.__inkbridgeOnWhiteboard ? globalThis.__inkbridgeOnWhiteboard() : window.location.pathname.includes("/flow"))';
  if(source.includes('__inkbridgeOnWhiteboard'))return source;if(source.split(from).length!==4)throw Error('Video record anchor missing: 84539 flow checks');return source.split(from).join(to);
 });
};
