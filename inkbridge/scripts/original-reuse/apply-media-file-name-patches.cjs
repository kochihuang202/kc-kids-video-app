// Media file names per board and per kind (user decision 2026-11-14; REG-157). The original
// has one global switch, showMediaFileNameOnCanvas, read by the media drawer (176) for both
// image and video cards. InkBridge asks globalThis.__inkbridgeMediaFileName(kind, ctx)
// (media-file-names.mjs: the current board's own image/video value, else the global switch).
// Idempotent, anchored on the original text (whitespace-insensitive), syntax-checked.
const fs = require('fs'), path = require('path'), ts = require('typescript'), crypto = require('crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const loose = text => new RegExp(text.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g');
const ask = (kind, ctx) => '(globalThis.__inkbridgeMediaFileName ? globalThis.__inkbridgeMediaFileName(' + kind + ', ' + ctx + ') : ' + ctx + '.showMediaFileNameOnCanvas)';
module.exports = ({ root, changes }) => {
  const id = '176', file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8');
  let after = before;
  if (!after.includes('inkbridge-media-file-name')) {
    const replace = (from, to, count, label) => {
      const re = loose(from), found = after.match(re)?.length || 0;
      if (found !== count) throw Error('Media file name anchor count ' + found + '/' + count + ': ' + label);
      after = after.replace(re, () => to);
    };
    // Placeholders (before an image/video is decoded) hide their title when the name is on top.
    replace('hideTitle: !!c.showMediaFileNameOnCanvas', 'hideTitle: !!' + ask('"image"', 'c'), 2, 'image placeholder');
    replace('hideTitle: !!d.showMediaFileNameOnCanvas', 'hideTitle: !!' + ask('"video"', 'd'), 2, 'video placeholder');
    // The name drawn above the card: decide per kind after the kind is known.
    replace('if (!n.showMediaFileNameOnCanvas || !n.fontMgr) return; let c = null === (i = t.data) || void 0 === i ? void 0 : i.mediaType; if (c !== o.S.image && c !== o.S.video) return;',
      '/* inkbridge-media-file-name */ if (!n.fontMgr) return; let c = null === (i = t.data) || void 0 === i ? void 0 : i.mediaType; if (c !== o.S.image && c !== o.S.video) return; if (!' + ask('c === o.S.image ? "image" : "video"', 'n') + ') return;', 1, 'name on top');
    if (/showMediaFileNameOnCanvas/.test(after.replace(/: [a-z]\.showMediaFileNameOnCanvas\)/g, ''))) throw Error('Media file name: an unpatched use remains');
  }
  if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Media file name patch syntax');
  if (after !== before) fs.writeFileSync(file, after);
  changes.push({ id, description: 'Media file names per board and per kind (image/video)', beforeSha256: hash(before), afterSha256: hash(after) });
  // 66597: the canvas pass that draws names above media cards returns early on the global
  // switch; it runs when either kind is on for the current board (the drawer decides per card).
  {
    const id = '66597', file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8');
    let after = before;
    if (!after.includes('inkbridge-media-file-name')) {
      const re = loose('drawMediaFileNamesAboveNodeLayers(e, t) { if (!t.showMediaFileNameOnCanvas) return;'), found = after.match(re)?.length || 0;
      if (found !== 1) throw Error('Media file name anchor count ' + found + '/1: names pass');
      after = after.replace(re, () => 'drawMediaFileNamesAboveNodeLayers(e, t) { /* inkbridge-media-file-name */ if (!(globalThis.__inkbridgeMediaFileName ? globalThis.__inkbridgeMediaFileName("image", t) || globalThis.__inkbridgeMediaFileName("video", t) : t.showMediaFileNameOnCanvas)) return;');
    }
    if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Media file name patch syntax: 66597');
    if (after !== before) fs.writeFileSync(file, after);
    changes.push({ id, description: 'Media file names: names pass runs when either kind is on for the board', beforeSha256: hash(before), afterSha256: hash(after) });
  }
};
