// YouTube video cards (video record phase three; user decision 2026-11-14).
// 84539: the original looks up a YouTube title and cover with the YouTube Data API using
// FlexNote's own API key. InkBridge answers through globalThis.__inkbridgeYoutubeMeta
// (oEmbed in the main process, src/main/youtube.cjs). The original key stays only in the
// private module and is never used. Idempotent, anchored on the original text, syntax-checked.
const fs = require('fs'), path = require('path'), ts = require('typescript'), crypto = require('crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
module.exports = ({ root, changes }) => {
  const id = '84539', file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8');
  let after = before;
  if (!after.includes('inkbridge-youtube-meta')) {
    const anchor = 'async function q(e) { let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "';
    if (after.split(anchor).length !== 2) throw Error('YouTube meta anchor missing or ambiguous');
    after = after.replace(anchor, () => 'async function q(e) { /* inkbridge-youtube-meta */ if (globalThis.__inkbridgeYoutubeMeta) return globalThis.__inkbridgeYoutubeMeta(e); let t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "');
  }
  if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('YouTube patch syntax');
  if (after !== before) fs.writeFileSync(file, after);
  changes.push({ id, description: 'YouTube title/cover through InkBridge oEmbed instead of the original keyed Data API', beforeSha256: hash(before), afterSha256: hash(after) });
};
