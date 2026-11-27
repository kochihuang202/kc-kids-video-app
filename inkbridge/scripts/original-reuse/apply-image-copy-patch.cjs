const fs = require('node:fs');
const path = require('node:path');

module.exports = function applyImageCopyPatch({root}) {
  const file = path.join(root, 'source-modules', 'module-25050.cjs');
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes('original factory SHA-256 2a1229134aa3f5dcd74bdfdf87cdccf9f99f30169b8e1f58a793a5c39fdd0351')) {
    throw Error('Unknown media action list factory');
  }
  let source = original;
  function patch(anchor, replacement) {
    if (source.includes(replacement)) return;
    if (source.split(anchor).length !== 2) throw Error('Image action anchor is not unique');
    source = source.replace(anchor, replacement);
  }

  patch('case "copyLink":\n                    j()', 'case "inkbridgeCopyImage":\n                    window.inkbridge.copyImageToClipboard({src: "flexnote://file/" + t.fileId}).then(() => (0, l.fz)({title: "已複製圖片", color: "success"}), () => (0, l.fz)({title: "無法複製圖片", color: "danger"}));\n                    break;\n                case "copyLink":\n                    j()');
  patch('}, "copy"), !n.includes("copyLink")', '}, "copy"), e.mediaType === L.Sw.image && /^[a-f0-9]{64}$/.test(t.fileId || "") && typeof window.inkbridge?.copyImageToClipboard === "function" && (0, i.jsx)(c.R, { startContent: (0, i.jsx)(W.default, { width: 14 }), children: "複製圖片" }, "inkbridgeCopyImage"), !n.includes("copyLink")');
  if (source !== original) {
    const backup = `${file}.before-inkbridge`;
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, {flag: 'wx'});
    fs.writeFileSync(file, source);
  }
};
