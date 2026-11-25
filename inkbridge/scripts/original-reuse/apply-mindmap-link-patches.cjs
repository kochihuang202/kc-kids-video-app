const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

module.exports = function applyMindmapLinkPatches({ root, changes = [] }) {
  const id = '71560';
  const file = path.join(root, 'source-modules', `module-${id}.cjs`);
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  function patch(anchor, replacement) {
    if (after.includes(replacement)) return;
    if (after.split(anchor).length !== 2) throw Error('Mindmap link source anchor changed: ' + anchor);
    after = after.replace(anchor, replacement);
  }

  // Include the foreground in the layout cache, since two fills in the same theme can differ.
  patch('"-loc").concat(B), H = e.data.lastEditedTime',
    '"-loc").concat(B).concat(t.inkbridgeWhiteboardLinkColor || ""), H = e.data.lastEditedTime');
  patch('o = i.d.toRichTextLines(e.data.content, M, a, B), s = (0, d.Q_)(e)',
    'o = i.d.toRichTextLines(e.data.content, M, a, B), linkColor = t.inkbridgeWhiteboardLinkColor, styledLines = linkColor && globalThis.__inkbridgeMindmapLinkLines ? globalThis.__inkbridgeMindmapLinkLines(o, linkColor) : o, s = (0, d.Q_)(e)');
  patch('c = this.renderer.layout(o, $ - 2 * P, n, l)',
    'c = this.renderer.layout(styledLines, $ - 2 * P, n, l)');

  // The native renderer reuses linkColor for icons and redraws live titles after a rename.
  patch('fontSize: a, linkColor: d });', 'fontSize: a, linkColor: d, inkbridgeLinkUnderline: e.attributes.inkbridgeLinkUnderline });');
  patch('buildMentionLinkLinePara(e, t, n, i) { var a;', 'buildMentionLinkLinePara(e, t, n, i, inkbridgeUnderline) { var a;');
  patch('fontSize: t, heightMultiplier: 1 }, textAlign: this.ck.TextAlign.Left }), s = (0, r.Qd)',
    'fontSize: t, heightMultiplier: 1, ...(inkbridgeUnderline ? { decoration: this.ck.UnderlineDecoration } : {}) }, textAlign: this.ck.TextAlign.Left }), s = (0, r.Qd)');
  patch('u = (n, i, r, a, o, c) => { if (!a || n >= i', 'u = (n, i, r, a, o, c, inkbridgeUnderline) => { if (!a || n >= i');
  patch('this.buildMentionLinkLinePara(a, o, c, h)', 'this.buildMentionLinkLinePara(a, o, c, h, inkbridgeUnderline)');
  patch('u(e.primaryStart, e.primaryEnd, e.layoutPrimary, t.primary, i, s)', 'u(e.primaryStart, e.primaryEnd, e.layoutPrimary, t.primary, i, s, e.inkbridgeLinkUnderline)');

  if (before === after) return;
  const hash = source => crypto.createHash('sha256').update(source).digest('hex');
  fs.writeFileSync(file, after);
  changes.push({ id, description: 'Mindmap board mention contrast and underline', beforeSha256: hash(before), afterSha256: hash(after) });
};
