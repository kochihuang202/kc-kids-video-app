// Windows folder/file paths as links in notes (user decision 2026-11-14; REG-156). Not in the
// original: its link editor turns every non-web address into about:blank (91362) and its
// auto-link only recognises web addresses, e-mail and flexnote:// (73866). With the desktop
// flag `globalThis.__inkbridgeLocalLinks` (set by the InkBridge desktop renderers, never by the
// web reader) both accept `C:\…` and `\\server\…`. The link node's own DOM href stays
// sanitised; a click reads the stored URL and goes through 'openUrl' (src/main/open-links.cjs).
// Idempotent, anchored on the original text, syntax-checked.
const fs = require('fs'), path = require('path'), ts = require('typescript'), crypto = require('crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const LOCAL = String.raw`/^(?:[A-Za-z]:[\\/]|\\\\[^\\\s])/`;
// A drive or UNC path, up to the next space or character not allowed in Windows paths.
const AUTOLINK = String.raw`/(?:[A-Za-z]:\\|\\\\[^\\\s<>"|?*]+\\)[^\s<>"|?*]*/`;
// The literals are written into the module as source; check what they mean before patching.
{
  const local = eval(LOCAL), auto = eval(AUTOLINK);
  const ok = local.test('C:\\Users\\a') && local.test('\\\\srv\\s') && !local.test('https://x') && !local.test('c:x')
    && auto.exec('見 C:\\Users\\ji3cp\\Documents\\ESS 資料夾')?.[0] === 'C:\\Users\\ji3cp\\Documents\\ESS'
    && auto.exec('\\\\server\\share\\a.xlsx')?.[0] === '\\\\server\\share\\a.xlsx' && auto.exec('https://x.com') === null;
  if (!ok) throw Error('Link path regular expressions changed meaning');
}
module.exports = ({ root, changes }) => {
  function patch(id, description, apply) {
    const file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8'), after = apply(before);
    if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Link path patch syntax: ' + id);
    if (after !== before) fs.writeFileSync(file, after);
    changes.push({ id, description, beforeSha256: hash(before), afterSha256: hash(after) });
  }
  const once = (source, from, to, marker, label) => {
    if (source.includes(marker)) return source;
    if (source.split(from).length !== 2) throw Error('Link path anchor missing or ambiguous: ' + label);
    return source.replace(from, () => to);
  };
  patch('91362', 'Link editor: accept Windows paths (desktop only)', source => {
    source = once(source, 'function r(e) { try {',
      'function r(e) { /* inkbridge-local-path: sanitize */ if (globalThis.__inkbridgeLocalLinks && "string" == typeof e && ' + LOCAL + '.test(e.trim())) return e.trim(); try {',
      'inkbridge-local-path: sanitize', 'sanitize');
    return once(source, 'function o(e) { return "https://" === e || i.test(e); }',
      'function o(e) { /* inkbridge-local-path: validate */ return "https://" === e || i.test(e) || !!globalThis.__inkbridgeLocalLinks && "string" == typeof e && ' + LOCAL + '.test(e.trim()); }',
      'inkbridge-local-path: validate', 'validate');
  });
  patch('73866', 'Auto-link: recognise Windows paths (desktop only)', source => once(source, 'let eP = [(0, ef.vP)(',
    'let eP = [/* inkbridge-local-path: autolink */ e => { if (!globalThis.__inkbridgeLocalLinks) return null; let t = ' + AUTOLINK + '.exec(e); return t ? { index: t.index, length: t[0].length, text: t[0], url: t[0] } : null; }, (0, ef.vP)(',
    'inkbridge-local-path: autolink', 'autolink'));
};
