// Mindmap XMind-parity patches (user decisions 2026-11-13; docs/MINDMAP_XMIND.md).
// Each change is idempotent, anchored on the original text (whitespace-insensitive), and
// syntax-checked. Collapse buttons, their hit-testing and every other overlay stay original.
const fs = require('fs'), path = require('path'), ts = require('typescript'), crypto = require('crypto');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const loose = text => new RegExp(text.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'));
module.exports = ({ root, changes }) => {
  function patch(id, description, apply) {
    const file = path.join(root, 'source-modules/module-' + id + '.cjs'), before = fs.readFileSync(file, 'utf8'), after = apply(before);
    if (ts.createSourceFile(file, after, 99, true, ts.ScriptKind.JS).parseDiagnostics.length) throw Error('Mindmap XMind patch syntax: ' + id);
    if (after !== before) fs.writeFileSync(file, after);
    changes.push({ id, description, beforeSha256: hash(before), afterSha256: hash(after) });
  }
  // Replace an original fragment once; a fragment already replaced (marker present) is left as is.
  const once = (source, from, to, marker, label) => {
    if (source.includes(marker)) return source;
    const re = loose(from), match = source.match(re);
    if (!match || source.slice(match.index + match[0].length).match(re)) throw Error('Mindmap XMind anchor missing or ambiguous: ' + label);
    return source.replace(re, () => to);
  };
  // 53861: the "+" (add child) drawn beside a hovered/selected node, and its hit area. XMind
  // adds topics with Enter/Tab only. The collapse "−"/count badge is drawn and hit as before.
  patch('53861', 'Remove the add-child "+" beside mindmap nodes (drawing and hit area); collapse buttons unchanged', source => {
    source = once(source, 'l && (n || p(a || n ? w - (2 * m + b) : w), i || p(s || i ? k + (2 * m + b) : k));', '/* inkbridge-xmind: no root add buttons */ void 0;', 'inkbridge-xmind: no root add buttons', 'root add buttons');
    source = once(source, 'l && !o && (i(o || s ? n + (2 * m + b) * ("left" === u ? -1 : 1) : n), p && "right" === u && i(-(2 * m + b + y)));', '/* inkbridge-xmind: no add button */ void 0;', 'inkbridge-xmind: no add button', 'add button');
    source = once(source, 'if (E) { if (!C && R(L || C ? M - (2 * N + D) : M)) return { action: "add", side: "left" }; if (!S && R(O || S ? P + (2 * N + D) : P)) return { action: "add", side: "right" }; }', '/* inkbridge-xmind: no root add hit */', 'inkbridge-xmind: no root add hit', 'root add hit');
    source = once(source, ': E && !k && R(k || w ? F + (2 * N + D) * ("left" === b ? -1 : 1) : F) ? { action: "add", side: b } : null;', ': /* inkbridge-xmind: no add hit */ null;', 'inkbridge-xmind: no add hit', 'add hit');
    return source;
  });
  // 10764 mindmap drag: outside a node the original only offered "insert before/after" the
  // nearest node, so dropping a topic to the right of another (where XMind makes it a child)
  // reordered it as a sibling instead. A pointer on a node's child side, level with the node,
  // now targets that node as the new parent; the original hover and drop handling are reused.
  patch('10764', 'Mindmap drag: a drop on the child side of a topic makes it the parent (XMind)', source => once(source,
    'let a = Math.abs(np.y - e.position.y), o = Math.abs(np.y - (e.position.y + t.height)), s = a < o, l = Math.min(a, o); if (l > 44) continue;',
    '/* inkbridge-xmind: child side */ let inkbridgeLeft = (e.data && e.data.side) === "left"; if ((inkbridgeLeft ? np.x < n : np.x > r) && np.y >= e.position.y - 8 && np.y <= e.position.y + t.height + 8) { let c = .15 * (inkbridgeLeft ? n - np.x : np.x - r); (!v || c < v.score) && (v = { node: e, insertBefore: void 0, score: c }); continue; } let a = Math.abs(np.y - e.position.y), o = Math.abs(np.y - (e.position.y + t.height)), s = a < o, l = Math.min(a, o); if (l > 44) continue;',
    'inkbridge-xmind: child side', 'drag child side'));
};
