// YouTube video cards (video record phase three; user decision 2026-11-14).
// Original FlexNote: the renderer embeds YouTube through a player page served by a local
// "shim" server (IPC get-youtube-shim-origin, 127.0.0.1, random port) because YouTube's embed
// refuses the app's own origin; the card talks to that page with postMessage
// ({__ytShim, action, value, requestId} -> {__ytShim, requestId, result}). This file serves an
// InkBridge page that speaks the same protocol with YouTube's public IFrame Player API.
// Title and cover: the original calls the YouTube Data API with FlexNote's own API key; InkBridge
// uses YouTube's key-free oEmbed endpoint instead and downloads the thumbnail once.
const http = require('node:http');
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_THUMBNAIL = 5 * 1024 * 1024;
// Hosts the embedded YouTube player needs; everything else stays blocked.
const YOUTUBE_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|ggpht\.com|gstatic\.com)(\/|$)|^https:\/\/jnn-pa\.googleapis\.com\/|^https:\/\/www\.google\.com\/js\/th\//;
const PLAYER = `<!doctype html>
<html><head><meta charset="utf-8"><title>player</title>
<style>html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}#player,iframe{display:block;width:100%;height:100%;border:0}</style>
</head><body><div id="player"></div><script>
(function(){
 var q=new URLSearchParams(location.search),id=q.get('v')||'',start=parseInt(q.get('start')||'0',10)||0,autoplay=q.get('autoplay')==='1',player=null,ready=false,last=-1;
 function send(message){if(window.parent&&window.parent!==window){message.__ytShim=true;window.parent.postMessage(message,'*');}}
 function answer(requestId,result){if(requestId)send({requestId:requestId,result:result});}
 window.addEventListener('message',function(event){
  var data=event.data;if(!data||data.__ytShim!==true||!data.action)return;
  if(!player||!ready){answer(data.requestId,null);return;}
  try{
   switch(data.action){
    case 'play':player.playVideo();answer(data.requestId,true);break;
    case 'pause':player.pauseVideo();answer(data.requestId,true);break;
    case 'seekTo':player.seekTo(Number(data.value)||0,true);answer(data.requestId,true);break;
    case 'setSpeed':player.setPlaybackRate(Number(data.value)||1);answer(data.requestId,true);break;
    case 'getCurrentTime':answer(data.requestId,player.getCurrentTime()||0);break;
    case 'getDuration':answer(data.requestId,player.getDuration()||0);break;
    default:answer(data.requestId,null);
   }
  }catch(error){answer(data.requestId,null);}
 });
 setInterval(function(){if(!player||!ready)return;var t=0,d=0;try{t=player.getCurrentTime()||0;d=player.getDuration()||0;}catch(e){return;}if(Math.abs(t-last)<0.2)return;last=t;send({type:'progress',currentTime:t,duration:d});},500);
 window.onYouTubeIframeAPIReady=function(){
  player=new YT.Player('player',{width:'100%',height:'100%',videoId:id,playerVars:{modestbranding:1,rel:0,playsinline:1,start:start,autoplay:autoplay?1:0,mute:autoplay?1:0},
   events:{onReady:function(){ready=true;send({type:'ready'});},onStateChange:function(e){send({type:'state',state:e.data});},onError:function(e){send({type:'error',code:e.data});}}});
 };
 var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';tag.onerror=function(){send({type:'error',code:-1});};document.head.appendChild(tag);
})();
</script></body></html>`;
// Highlight screenshot of the embedded player (original IPC screenshot-embedded-frame):
// the renderer gives the player's rectangle and "/embed/<id>"; the player controls inside the
// YouTube frame are hidden for the capture and restored afterwards.
const HIDE_CONTROLS = `(function(){var s=['.ytp-chrome-bottom','.ytp-chrome-top','.ytp-gradient-bottom','.ytp-gradient-top','.ytp-pause-overlay','.ytp-spinner','.ytp-cued-thumbnail-overlay','.ytp-large-play-button'],kept=[];s.forEach(function(q){document.querySelectorAll(q).forEach(function(el){kept.push([el,el.style.visibility,el.style.opacity]);el.style.visibility='hidden';el.style.opacity='0';});});window.__inkbridgeShotRestore=kept;var v=document.querySelector('video');return v?(v.currentTime||0):null;})()`;
const RESTORE_CONTROLS = `(function(){(window.__inkbridgeShotRestore||[]).forEach(function(k){k[0].style.visibility=k[1]||'';k[0].style.opacity=k[2]||'';});window.__inkbridgeShotRestore=null;return true;})()`;
async function screenshotEmbeddedFrame(webContents, { rect, frameUrlKeyword } = {}) {
  if (!rect || !(rect.width >= 8 && rect.height >= 8) || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
  const keyword = /^\/embed\/[A-Za-z0-9_-]{11}$/.test(frameUrlKeyword || '') ? frameUrlKeyword : '/embed/';
  let frame = null, currentTime = null;
  try { frame = webContents.mainFrame.framesInSubtree.find(f => { try { const u = new URL(f.url); return /(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname) && f.url.includes(keyword); } catch { return false; } }) || null; } catch { frame = null; }
  try {
    if (frame) { currentTime = await frame.executeJavaScript(HIDE_CONTROLS).catch(() => null); await new Promise(resolve => setTimeout(resolve, 80)); }
    const image = await webContents.capturePage({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
    const base64Image = image.toDataURL();
    return base64Image ? { base64Image, currentTime: typeof currentTime === 'number' ? currentTime : null } : null;
  } finally { if (frame) await frame.executeJavaScript(RESTORE_CONTROLS).catch(() => {}); }
}
function createYoutube({ fetch: fetchImpl = globalThis.fetch } = {}) {
  let server = null, origin = '';
  async function start() {
    if (origin) return origin;
    server = http.createServer((request, response) => {
      const path = (request.url || '').split('?')[0];
      if (request.method !== 'GET' || path !== '/player') { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not Found'); return; }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      response.end(PLAYER);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = 'http://127.0.0.1:' + server.address().port; return origin;
  }
  async function get(url, timeout = 10000) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try { return await fetchImpl(url, { signal: controller.signal, redirect: 'follow' }); } finally { clearTimeout(timer); }
  }
  // Title and cover for one video. The cover is returned as a data URL; the renderer saves it
  // through the original saveVideoScreenshot path, so it becomes a workspace file.
  async function meta(videoId) {
    if (!VIDEO_ID.test(videoId || '')) throw Error('無效的 YouTube 影片 ID');
    const watch = 'https://www.youtube.com/watch?v=' + videoId;
    const response = await get('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(watch));
    if (!response.ok) throw Error(response.status === 404 || response.status === 401 ? '找不到這部影片，或影片不允許嵌入' : 'YouTube 回應 ' + response.status);
    const info = await response.json(), title = typeof info.title === 'string' ? info.title.slice(0, 500) : '';
    let coverDataUrl = '';
    for (const name of ['maxresdefault', 'hqdefault']) {
      const image = await get('https://i.ytimg.com/vi/' + videoId + '/' + name + '.jpg').catch(() => null);
      if (!image?.ok) continue;
      const bytes = Buffer.from(await image.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_THUMBNAIL) continue;
      coverDataUrl = 'data:image/jpeg;base64,' + bytes.toString('base64'); break;
    }
    return { title, coverDataUrl };
  }
  function close() { server?.close(); server = null; origin = ''; }
  return { start, meta, close, origin: () => origin };
}
module.exports = { createYoutube, screenshotEmbeddedFrame, YOUTUBE_HOSTS, VIDEO_ID };
