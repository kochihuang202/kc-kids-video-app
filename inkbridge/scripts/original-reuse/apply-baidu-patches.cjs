// Baidu NetDisk (video record phase three; REG-160). The original video dialog (67569) has five
// source tabs: local, remote, baidu, quark, aliyun. User decision 2026-11-14: Baidu only; the
// Quark and Aliyun tabs (which would need their own accounts and keys) are removed, including
// from the remembered last tab. Baidu itself runs on the original modal (89944) and player
// (59771) through the services in original-shell.mjs. Idempotent, anchored, syntax-checked.
const fs = require('fs'), path = require('path'), ts = require('typescript'), crypto = require('crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const loose = text => new RegExp(text.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g');
const MARK = 'inkbridge-baidu-only';
module.exports = ({ root, changes }) => {
  const id = '67569', file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8');
  let after = before;
  if (!after.includes(MARK)) for (const [from, to, label] of [
    ['$ = ["local", "remote", "baidu", "quark", "aliyun"];', '$ = ["local", "remote", "baidu"]; /* ' + MARK + ' */', 'tabs kept'],
    [', (0, i.jsx)(p.r, { title: H("quarkDisk") }, "quark"), (0, i.jsx)(p.r, { title: H("aliyunDisk") }, "aliyun")]', ']', 'tab list'],
  ]) {
    const re = loose(from), found = after.match(re)?.length || 0;
    if (found !== 1) throw Error('Baidu anchor count ' + found + '/1: ' + label);
    after = after.replace(re, () => to);
  }
  if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Baidu patch syntax: ' + id);
  if (after !== before) fs.writeFileSync(file, after);
  changes.push({ id, description: 'Video dialog: Baidu NetDisk only (no Quark/Aliyun tabs)', beforeSha256: hash(before), afterSha256: hash(after) });
  // 80716: a video card without a cover takes one from its first frame through e.data.objectId.
  // Local videos get their cover at import, so only Baidu cards reach it, and one of the card's
  // renders has no data (page error "reading 'objectId'"); skip the capture there.
  {
    const id = '80716', file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8');
    let after = before;
    if (!after.includes(MARK)) {
      const re = loose('onFirstFrameLoaded: t => { e.cover || (0, A.I)({ objectId: e.data.objectId,'), found = after.match(re)?.length || 0;
      if (found !== 1) throw Error('Baidu anchor count ' + found + '/1: first-frame cover');
      after = after.replace(re, () => 'onFirstFrameLoaded: t => { /* ' + MARK + ' */ e.cover || !e.data || (0, A.I)({ objectId: e.data.objectId,');
    }
    if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Baidu patch syntax: ' + id);
    if (after !== before) fs.writeFileSync(file, after);
    changes.push({ id, description: 'Video card first-frame cover: skip renders without card data (Baidu cards)', beforeSha256: hash(before), afterSha256: hash(after) });
  }
};
