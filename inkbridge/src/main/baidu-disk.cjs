// Baidu NetDisk for video cards (video record phase three; REG-160). Same services and results
// as the original main process (get-baidudisk-files / search / src / m3u8-src / subtitle /
// access_token / logout), with two differences agreed with the user (2026-11-14):
// - the Baidu developer app is the user's own (AppKey/SecretKey kept encrypted on this computer,
//   never in the workspace or Git); the original's built-in FlexNote app is never used;
// - login uses Baidu's device-code flow (code shown to the user, Baidu page opened in the
//   browser) instead of the original flexnote:// redirect, so no callback URL is needed.
// Tokens are kept encrypted next to the app credentials and refreshed when they expire.
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const OAUTH = 'https://openapi.baidu.com', PAN = 'https://pan.baidu.com';
// Playback: the original player loads the Baidu playlist and segments directly from Baidu (with a
// pan.baidu.com Referer added for the segment hosts). InkBridge's page only talks to its own
// origin, so the stream goes through this module instead: the playlist URL handed to the player
// is a local /baidu-media/<id> address, every playlist entry is rewritten to another local
// address, and serve() fetches the real Baidu URL (token never reaches the page). Failures are
// logged without query strings (tokens) for diagnosis.
const SEGMENT_HOSTS = /^https:\/\/(([a-z0-9-]+\.)*baidupcs\.com|v1-ant\.baidu\.com)\//i;
function createBaiduDisk({ dir, safeStorage, localOrigin = () => '', userAgent = '', log = () => {}, fetch = globalThis.fetch, openExternal, showCode, oauth = OAUTH, pan = PAN, now = () => Date.now(), wait = ms => new Promise(done => setTimeout(done, ms)) }) {
  const appFile = path.join(dir, 'baidu-app.json'), tokenFile = path.join(dir, 'baidu-token.json');
  const encrypt = async value => (safeStorage.encryptStringAsync ? await safeStorage.encryptStringAsync(value) : safeStorage.encryptString(value)).toString('base64');
  const decrypt = async value => { const b = Buffer.from(value, 'base64'); return safeStorage.decryptStringAsync ? (await safeStorage.decryptStringAsync(b)).result : safeStorage.decryptString(b); };
  async function writeSecret(file, format, value) {
    await fs.mkdir(dir, { recursive: true }); const tmp = file + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(tmp, JSON.stringify({ format, version: 1, encrypted: await encrypt(JSON.stringify(value)) }), { mode: 0o600 });
    try { await fs.rename(tmp, file); } finally { await fs.rm(tmp, { force: true }); }
  }
  async function readSecret(file, format) {
    let raw; try { raw = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    if (raw.format !== format || raw.version !== 1) throw Error('百度網盤設定格式無效');
    return JSON.parse(await decrypt(raw.encrypted));
  }
  async function setApp({ appKey, secretKey }) {
    if (!/^[A-Za-z0-9]{16,64}$/.test(appKey || '') || !/^[A-Za-z0-9]{16,64}$/.test(secretKey || '')) throw Error('百度 AppKey 或 SecretKey 格式不正確');
    await writeSecret(appFile, 'inkbridge-baidu-app', { appKey, secretKey });
  }
  const app = async () => { const v = await readSecret(appFile, 'inkbridge-baidu-app'); if (!v) throw Error('尚未設定百度開放平台的 AppKey 與 SecretKey'); return v; };
  const form = values => new URLSearchParams(values).toString();
  async function json(url, init) { const r = await fetch(url, init); const text = await r.text(); try { return JSON.parse(text); } catch { throw Error('百度回應無法解析 (' + r.status + ')'); } }
  async function saveToken(t) { const token = { access: t.access_token, refresh: t.refresh_token, expires: now() + 1000 * (Number(t.expires_in) || 0) }; await writeSecret(tokenFile, 'inkbridge-baidu-token', token); return token; }
  let refreshing = null;
  async function accessToken() {
    const token = await readSecret(tokenFile, 'inkbridge-baidu-token'); if (!token?.access) return null;
    if (token.expires - now() > 60000) return token.access;
    if (!token.refresh) return null;
    refreshing ||= (async () => { const { appKey, secretKey } = await app(); const t = await json(oauth + '/oauth/2.0/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'refresh_token', refresh_token: token.refresh, client_id: appKey, client_secret: secretKey }) }); if (t.error) { await fs.rm(tokenFile, { force: true }); return null; } return (await saveToken(t)).access; })().finally(() => { refreshing = null; });
    return refreshing;
  }
  // Device-code login: show the code, open Baidu's page, and poll in the background; the
  // original dialog polls get-baidudisk-access_token until it is set.
  let login = null;
  async function startAuth() {
    const { appKey, secretKey } = await app();
    const code = await json(oauth + '/oauth/2.0/device/code?' + form({ response_type: 'device_code', client_id: appKey, scope: 'basic,netdisk' }));
    if (!code.device_code) throw Error('百度登入代碼取得失敗：' + (code.error_description || code.error || '未知錯誤'));
    const id = crypto.randomUUID(); login = id;
    await openExternal(code.verification_url); showCode?.(code);
    (async () => {
      const until = now() + 1000 * (Number(code.expires_in) || 300); let interval = 1000 * (Number(code.interval) || 5);
      while (login === id && now() < until) {
        await wait(interval); if (login !== id) return;
        const t = await json(oauth + '/oauth/2.0/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ grant_type: 'device_token', code: code.device_code, client_id: appKey, client_secret: secretKey }) }).catch(() => ({ error: 'network' }));
        if (t.access_token) { await saveToken(t); login = null; return; }
        if (t.error === 'slow_down') interval += 5000; else if (t.error && !['authorization_pending', 'network'].includes(t.error)) { login = null; return; }
      }
    })();
    return { userCode: code.user_code, verificationUrl: code.verification_url };
  }
  async function logout() { login = null; await fs.rm(tokenFile, { force: true }); }
  const fileRow = e => ({ id: e.fs_id, name: e.server_filename, path: e.path, size: e.size, modified: 1000 * e.server_mtime, isdir: e.isdir });
  async function files(dir = '/') {
    const token = await accessToken(); if (!token) return { success: false, error: 'No access token found' };
    try { const a = await json(pan + '/rest/2.0/xpan/file?' + form({ method: 'list', access_token: token, dir: String(dir || '/') })); if (a.errno) return { success: false, error: 'Baidu API error: ' + (a.errmsg || a.errno) }; return { success: true, files: (a.list || []).map(e => ({ ...fileRow(e), ...e })) }; }
    catch { return { success: false, error: 'Failed to retrieve file list' }; }
  }
  async function search(key) {
    const token = await accessToken(); if (!token) throw Error('No access token found');
    const a = await json(pan + '/rest/2.0/xpan/file?' + form({ method: 'search', access_token: token, key: String(key || ''), web: 1, recursion: 1 }), { headers: { 'User-Agent': 'pan.baidu.com' } });
    if (a.errno) throw Error('Failed to search files');
    // Like the list (unlike the original search), keep Baidu's own fields: the modal imports with
    // String(fs_id), which the original search results lacked (card saved as "undefined").
    return (a.list || []).map(e => ({ ...fileRow(e), ...e }));
  }
  async function src(fsid) {
    if (!/^\d{1,20}$/.test(String(fsid))) throw Error('百度檔案代號無效');
    const token = await accessToken(); if (!token) throw Error('No access token found');
    return json(pan + '/rest/2.0/xpan/multimedia?' + form({ method: 'filemetas', access_token: token, fsids: '[' + fsid + ']', dlink: 1 }));
  }
  // Default cover (user agreement: every video card has one; REG-162). Local videos take a frame at
  // 10% through a hidden copy, which an HLS stream cannot give, so a Baidu card uses the
  // thumbnail Baidu makes for the video (filemetas thumb=1), as a data URL for the renderer.
  async function thumb(fsid) {
    if (!/^\d{1,20}$/.test(String(fsid))) throw Error('百度檔案代號無效');
    const token = await accessToken(); if (!token) return '';
    const meta = await json(pan + '/rest/2.0/xpan/multimedia?' + form({ method: 'filemetas', access_token: token, fsids: '[' + fsid + ']', thumb: 1 }));
    const thumbs = meta.list?.[0]?.thumbs || {}, url = thumbs.url3 || thumbs.url2 || thumbs.url1 || thumbs.icon;
    if (!url || !allowedUrl(url)) { log('no thumbnail ' + fsid + ' errno ' + (meta.errno ?? '')); return ''; }
    const r = await fetch(url, { headers: headers(url) }), type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) { log('thumbnail ' + r.status + ' ' + type + ' ' + safe(url)); return ''; }
    const bytes = Buffer.from(await r.arrayBuffer()); if (!bytes.length || bytes.length > 8 * 1024 * 1024) return '';
    return 'data:' + type + ';base64,' + bytes.toString('base64');
  }
  const streamUrl = (token, file, type, adToken) => pan + '/rest/2.0/xpan/file?' + form({ method: 'streaming', access_token: token, path: file, type, ...adToken ? { adToken } : {} });
  // Non-member streams first return an ad token and a wait (ltime, seconds), as in the original;
  // otherwise (e.g. members) the first answer is already the playlist.
  async function m3u8(file) {
    if (typeof file !== 'string' || !file.startsWith('/')) throw Error('百度檔案路徑無效');
    const token = await accessToken(); if (!token) throw Error('No access token found');
    const url = streamUrl(token, file, 'M3U8_AUTO_720'), r = await fetch(url, { headers: headers(url) }), text = await r.text();
    let target = url;
    if (!text.trimStart().startsWith('#EXTM3U')) {
      let first; try { first = JSON.parse(text); } catch { log('stream answer ' + r.status + ' ' + text.slice(0, 120)); throw Error('百度串流回應無法解析 (' + r.status + ')'); }
      if (first.adToken) { await wait(1000 * (Number(first.ltime) || 0)); target = streamUrl(token, file, 'M3U8_AUTO_720', first.adToken); }
      else if (first.errno) { log('stream errno ' + first.errno + ' ' + (first.errmsg || first.show_msg || '')); throw Error('百度串流取得失敗 (' + first.errno + ')'); }
    }
    return localOrigin() + '/baidu-media/' + register(target);
  }
  // Local addresses for Baidu URLs (only URLs this module fetched or found in a playlist).
  const media = new Map();
  function register(url) { const id = crypto.randomBytes(12).toString('hex'); media.set(id, url); if (media.size > 20000) media.delete(media.keys().next().value); return id; }
  const safe = url => { try { const u = new URL(url); return u.origin + u.pathname; } catch { return '?'; } };
  const headers = url => ({ ...userAgent ? { 'User-Agent': userAgent } : {}, ...SEGMENT_HOSTS.test(url) ? { Referer: 'https://pan.baidu.com' } : {} });
  const allowedUrl = url => { try { const u = new URL(url); return u.protocol === 'https:' || url.startsWith(pan + '/'); } catch { return false; } };
  function rewrite(text, base) {
    const local = ref => { const abs = new URL(ref, base).href; return allowedUrl(abs) ? localOrigin() + '/baidu-media/' + register(abs) : ref; };
    return text.split(/\r?\n/).map(line => { const t = line.trim(); if (!t) return line; if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, ref) => 'URI="' + local(ref) + '"'); return local(t); }).join('\n');
  }
  // Serves /baidu-media/<id>: playlists are rewritten, everything else streams through (with Range).
  async function serve(id, range) {
    const url = media.get(id); if (!url) return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not found' };
    let r; try { r = await fetch(url, { headers: { ...headers(url), ...range ? { Range: range } : {} }, redirect: 'follow' }); } catch (e) { log('fetch failed ' + safe(url) + ' ' + e.message); return { status: 502, headers: { 'content-type': 'text/plain' }, body: 'Baidu unreachable' }; }
    const type = r.headers.get('content-type') || '';
    if (!r.ok) log('status ' + r.status + ' ' + safe(url));
    if (/mpegurl/i.test(type) || /\.m3u8$/i.test(new URL(r.url || url).pathname) || url.includes('method=streaming') && !/^video\/|octet-stream/i.test(type)) {
      const text = await r.text();
      if (!text.trimStart().startsWith('#EXTM3U')) { log('not a playlist ' + r.status + ' ' + safe(url) + ' ' + text.slice(0, 160)); return { status: r.ok ? 502 : r.status, headers: { 'content-type': 'text/plain' }, body: 'Not a playlist' }; }
      return { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-store' }, body: rewrite(text, r.url || url) };
    }
    const out = { 'content-type': type || 'application/octet-stream', 'cache-control': 'no-store' };
    for (const k of ['content-length', 'content-range', 'accept-ranges']) if (r.headers.get(k)) out[k] = r.headers.get(k);
    return { status: r.status, headers: out, stream: r.body };
  }
  const parseSrt = text => text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map(block => { const lines = block.split(/\r?\n/), [start, end] = (lines[1] || '').split(' --> ').map(v => v.trim()); return { index: parseInt(lines[0], 10), start, end, text: lines.slice(2).join('\n').trim() }; });
  async function subtitle(file) {
    if (typeof file !== 'string' || !file.startsWith('/')) throw Error('百度檔案路徑無效');
    const token = await accessToken(); if (!token) throw Error('No access token found');
    const playlist = await (await fetch(streamUrl(token, file, 'M3U8_SUBTITLE_SRT'))).text(), tracks = []; let track = null;
    for (const line of playlist.trim().split('\n')) {
      if (line.includes('#EXT-X-MEDIA:TYPE=SUBTITLES')) { const t = {}; for (const part of line.slice(line.indexOf(':') + 1).split(',').map(v => v.trim())) { const [k, v] = part.split('='); t[k] = v?.replace(/^"|"$/g, ''); } track = { name: t.NAME, language: t.LANGUAGE, groupId: t['GROUP-ID'], default: t.DEFAULT === 'YES', autoselect: t.AUTOSELECT === 'YES', videoLang: t['VIDEO-LAN'], aiSub: t['AI-SUB'] === 'YES', url: null, data: null }; }
      else if (track && line.includes('http')) { track.url = line.trim(); tracks.push(track); track = null; }
    }
    for (const t of tracks) { if (!/^https:\/\//.test(t.url) && !t.url.startsWith(pan)) continue; try { t.data = parseSrt(await (await fetch(t.url)).text()); } catch {} }
    return tracks;
  }
  return { serve, thumb, setApp, hasApp: async () => !!await readSecret(appFile, 'inkbridge-baidu-app').catch(() => null), startAuth, accessToken, logout, files, search, src, m3u8, subtitle };
}
module.exports = { createBaiduDisk, SEGMENT_HOSTS };
