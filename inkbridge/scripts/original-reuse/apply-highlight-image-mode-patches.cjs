// Video highlight panel: a third display mode, large images (user request 2026-11-14; REG-159).
// The original panel (61453) has one toggle, standard ↔ compact, kept in localStorage
// "videoHighlightCompact" and passed to the list (79719) as isCompact; standard shows the frame
// screenshot as a fixed 78×44 thumbnail. Not in the original, agreed with the user: the same
// button cycles standard → large → compact → standard, the same localStorage key also stores
// "large", and in large mode the screenshot spans the panel width (natural aspect ratio), so it
// grows and shrinks with the right panel. Idempotent, anchored on the original text
// (whitespace-insensitive), syntax-checked.
const fs = require('fs'), path = require('path'), ts = require('typescript'), crypto = require('crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const loose = text => new RegExp(text.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g');
const MARK = 'inkbridge-highlight-image-mode';
// Tooltip for the large mode (no original string): follow the interface language.
const LARGE_LABEL = '((l => /^zh(-(tw|hk|mo)|.*hant)/i.test(l) ? "大圖模式" : /^zh/i.test(l) ? "大图模式" : /^ja/i.test(l) ? "大きい画像" : "Large images")(String(globalThis.__originalRequire?.(1643)?.ag?.language || navigator.language || "")))';
// Image icon for the large mode (the original compact icon stays for the other two).
const LARGE_ICON = '(0, i.jsxs)("svg", { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [(0, i.jsx)("rect", { x: 3, y: 5, width: 18, height: 14, rx: 2 }), (0, i.jsx)("circle", { cx: 9, cy: 10, r: 1.5 }), (0, i.jsx)("path", { d: "m21 16-5-5-8 8" })] })';
function patch(root, changes, id, description, edits) {
  const file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8');
  let after = before;
  if (!after.includes(MARK)) for (const [from, to, count, label] of edits) {
    const re = loose(from), found = after.match(re)?.length || 0;
    if (found !== count) throw Error('Highlight image mode anchor count ' + found + '/' + count + ': ' + id + ' ' + label);
    after = after.replace(re, () => to);
  }
  if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Highlight image mode patch syntax: ' + id);
  if (after !== before) fs.writeFileSync(file, after);
  changes.push({ id, description, beforeSha256: hash(before), afterSha256: hash(after) });
}
module.exports = ({ root, changes }) => {
  // eG: !1 standard, "large", !0 compact.
  patch(root, changes, '61453', 'Video highlight panel: standard / large images / compact cycle', [
    ['let e = localStorage.getItem("videoHighlightCompact"); null !== e && eY("true" === e);',
      '/* ' + MARK + ' */ let e = localStorage.getItem("videoHighlightCompact"); null !== e && eY("large" === e ? "large" : "true" === e);', 1, 'restore'],
    ['content: eG ? ee("standardView") : ee("compactView"), color: "foreground", size: "sm", children: (0, i.jsx)("button", { type: "button", onClick: () => eY(!eG),',
      'content: !0 === eG ? ee("standardView") : "large" === eG ? ee("compactView") : ' + LARGE_LABEL + ', color: "foreground", size: "sm", children: (0, i.jsx)("button", { type: "button", "data-inkbridge-highlight-view": !0 === eG ? "compact" : "large" === eG ? "large" : "standard", onClick: () => eY(!1 === eG ? "large" : "large" === eG || !eG),', 1, 'button'],
    ['children: (0, i.jsx)(S.default, { width: 12, height: 12 }) }) }), (0, i.jsxs)(l.j, { placement: "bottom-end"',
      'children: "large" === eG ? ' + LARGE_ICON + ' : (0, i.jsx)(S.default, { width: 12, height: 12 }) }) }), (0, i.jsxs)(l.j, { placement: "bottom-end"', 1, 'icon'],
    ['isCompact: eG, filterColor: eo', 'isCompact: !0 === eG, inkbridgeLargeImages: "large" === eG, filterColor: eo', 1, 'list props'],
  ]);
  patch(root, changes, '79719', 'Video highlight list: screenshot spans the panel width in large mode', [
    ['isCompact: e.isCompact }, r.id)', '/* ' + MARK + ' */ isCompact: e.isCompact, inkbridgeLargeImages: e.inkbridgeLargeImages }, r.id)', 1, 'row props'],
    ['e.videoHighlight.screenshotFileId && !e.isCompact ? (0, i.jsxs)("div", { className: "relative mb-2 inline-block group/image", children: [(0, i.jsx)("img", { className: "h-[44px] w-[78px] cursor-pointer rounded-md border border-default-200/50 object-cover dark:border-default-100/10",',
      'e.videoHighlight.screenshotFileId && !e.isCompact ? (0, i.jsxs)("div", { className: e.inkbridgeLargeImages ? "relative mb-2 block w-full group/image" : "relative mb-2 inline-block group/image", children: [(0, i.jsx)("img", { className: e.inkbridgeLargeImages ? "block h-auto w-full cursor-pointer rounded-md border border-default-200/50 dark:border-default-100/10" : "h-[44px] w-[78px] cursor-pointer rounded-md border border-default-200/50 object-cover dark:border-default-100/10",', 1, 'image'],
  ]);
};
