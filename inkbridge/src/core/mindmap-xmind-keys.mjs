// XMind key semantics for the original mindmap (user decision 2026-11-13), built only by
// re-dispatching the original 10764/Lexical keys, so creation, layout, editing and saving
// stay native:
//   editing  Enter        -> original Escape: commit and leave editing, node stays selected
//   selected Enter        -> original "edit, then Enter": a sibling after it, being edited
//   selected Enter (root) -> original Tab: a new main topic under the root
//   selected Space / F2   -> original Enter: start editing
//   Ctrl/Cmd+C, X and paste on selected topics -> copy, cut, paste whole subtrees (paste appends
//   them as children of the selected topic; system-clipboard text pasted instead becomes one
//   topic per line). A selected central topic is copied/pasted by the original as a whole map.
// Shift+Enter in the editor, Tab, IME composition and every other key are left alone.
const MARK = '__inkbridgeXmindKey';
function send(target, key, extra = {}) {
  const event = new KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, ...extra });
  event[MARK] = true;
  target.dispatchEvent(event);
}
const editable = element => !!element && (element.isContentEditable || element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || !!element.closest?.('[contenteditable="true"],.canvas-lexical-editor-container'));
function waitForEditor(store, id, timeout = 1200) {
  return new Promise(resolve => {
    const start = performance.now();
    const tick = () => {
      const active = document.activeElement;
      if (store.getState().editingNodeId === id && active?.isContentEditable) return resolve(active);
      if (performance.now() - start > timeout) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}
const plain = (r, content) => { try { return String(r(94700).LG(content) || '').trim(); } catch { return ''; } };
const textDocument = text => ({ root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] }] } });
const copyRow = row => { const next = JSON.parse(JSON.stringify(row)); for (const key of ['createdTime', 'lastEditedTime', 'isRoot', 'width', 'height']) delete next[key]; return next; };
export function installMindmapXmindKeys({ store, mindmaps, r, pushUndo = () => {} }) {
  let clipboard = null;
  // A selected flow node is the mindmap node itself, except the central topic, whose flow ID is its placement.
  const mapNodeId = node => mindmaps?.nodes.has(node.id) ? node.id : node.data?.isRoot ? [...(mindmaps?.nodes.values() || [])].find(row => row.isRoot && row.mindMapId === node.data.mindMapId)?.id : null;
  const selectedTopics = () => {
    const state = store.getState(), rows = [...state.selectedNodeIds].map(id => state.nodes.find(row => row.id === id));
    if (!rows.length || rows.some(row => row?.type !== 'MindmapNode' || !row.data?.mindMapId) || new Set(rows.map(row => row.data.mindMapId)).size !== 1) return null;
    return rows.map(row => ({ flow: row, id: mapNodeId(row) })).filter(row => row.id);
  };
  const parentOf = id => [...mindmaps.nodes.values()].find(row => (row.childNodeIds || []).includes(id));
  const subtree = (id, out = []) => { const row = mindmaps.nodes.get(id); if (!row) return out; out.push(row); for (const child of row.childNodeIds || []) subtree(child, out); return out; };
  const outline = (id, depth = 0) => { const row = mindmaps.nodes.get(id); return row ? ['\t'.repeat(depth) + plain(r, row.content), ...(row.childNodeIds || []).flatMap(child => outline(child, depth + 1))] : []; };
  function copy(topics) {
    // Only top-most selected topics: a selected descendant is already inside its ancestor's subtree.
    const ids = topics.map(t => t.id), inside = id => { for (let p = parentOf(id); p; p = parentOf(p.id)) if (ids.includes(p.id)) return true; return false; };
    const roots = ids.filter(id => !inside(id)), rows = roots.flatMap(id => subtree(id)).map(copyRow), text = roots.flatMap(id => outline(id)).join('\n');
    // The system clipboard carries the outline (for other apps) and a token; a paste whose HTML
    // still holds the token restores the full subtrees, otherwise the pasted text is used.
    const token = crypto.randomUUID();
    clipboard = { roots, rows, text, token };
    const html = '<meta data-inkbridge-mindmap="' + token + '">' + text.split('\n').map(line => '<p>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>').join('');
    window.inkbridge?.writeClipboardTextAndHtml?.({ text, html }).catch(error => console.error(error));
    return roots;
  }
  async function paste(target, system, ours) {
    const parent = mindmaps.nodes.get(target.id); if (!parent) return;
    let roots, rows;
    if (ours) {
      const ids = new Map(clipboard.rows.map(row => [row.id, crypto.randomUUID()]));
      rows = clipboard.rows.map(row => ({ ...row, id: ids.get(row.id), childNodeIds: (row.childNodeIds || []).filter(id => ids.has(id)).map(id => ids.get(id)) }));
      roots = clipboard.roots.map(id => ids.get(id));
    } else {
      const lines = String(system || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 200);
      if (!lines.length) return;
      rows = lines.map(line => ({ ...r(19281).YH.newMindmapNodeItem({ type: 'Text', mindMapId: parent.mindMapId, content: textDocument(line) }), childNodeIds: [] }));
      roots = rows.map(row => row.id);
    }
    // Pasted topics join the target's branch: its side and colours (the root's children keep theirs).
    const side = parent.isRoot ? 'right' : parent.side || 'right';
    rows = rows.map(row => ({ ...row, side: roots.includes(row.id) || !parent.isRoot ? side : row.side, ...parent.isRoot ? {} : { color: parent.color || row.color, edgeColor: parent.edgeColor || parent.color || row.edgeColor } }));
    pushUndo();
    await mindmaps.call('inkbridgePasteMindmapNodes', { parentId: parent.id, nodes: rows, roots });
    const flowIds = roots.filter(id => store.getState().nodes.some(row => row.id === id));
    if (flowIds.length) store.getState().setSelectedNodeIds(new Set(flowIds));
  }
  const onClipboardKey = event => {
    const key = event.key.toLowerCase();
    if (!['c', 'x', 'v'].includes(key) || event.shiftKey || event.altKey || !mindmaps) return false;
    const state = store.getState(); if (state.editingNodeId || editable(event.target)) return false;
    const topics = selectedTopics(); if (!topics?.length) return false;
    const isRoot = topics.some(t => t.flow.data.isRoot);
    if (key === 'v') return false; // handled by the paste event below (no clipboard permission needed)
    if (isRoot) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    const roots = copy(topics);
    if (key === 'x') { pushUndo(); mindmaps.deleteNodes(roots).catch(error => console.error(error)); }
    return true;
  };
  const selectedMindmapNode = () => {
    const state = store.getState();
    if (state.selectedNodeIds.size !== 1) return null;
    const id = [...state.selectedNodeIds][0], node = state.nodes.find(row => row.id === id);
    return node?.type === 'MindmapNode' && node.data?.mindMapId ? node : null;
  };
  const onKeyDown = event => {
    if (event[MARK] || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if ((event.ctrlKey || event.metaKey) && onClipboardKey(event)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const state = store.getState(), editingId = state.editingNodeId;
    if (editingId) {
      if (event.key !== 'Enter' || event.shiftKey || !editable(event.target)) return;
      const node = state.nodes.find(row => row.id === editingId);
      if (node?.type !== 'MindmapNode') return;
      event.preventDefault(); event.stopImmediatePropagation();
      send(event.target, 'Escape');
      return;
    }
    if (editable(event.target) || event.shiftKey) return;
    const node = selectedMindmapNode();
    if (!node) return;
    if (event.key === ' ' || event.key === 'F2') {
      event.preventDefault(); event.stopImmediatePropagation();
      send(document.body, 'Enter');
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (node.data.isRoot) { send(document.body, 'Tab'); return; }
    send(document.body, 'Enter');
    waitForEditor(store, node.id).then(editor => { if (editor) send(editor, 'Enter'); });
  };
  const onPaste = event => {
    if (!mindmaps || store.getState().editingNodeId || editable(event.target)) return;
    const topics = selectedTopics(); if (topics?.length !== 1) return;
    const html = event.clipboardData?.getData('text/html') || '', text = event.clipboardData?.getData('text/plain') || '';
    const ours = !!clipboard && html.includes('data-inkbridge-mindmap="' + clipboard.token + '"');
    // Images, files and the original canvas copy (a whole map, cards...) stay with the original paste.
    if (!ours && (!text.trim() || event.clipboardData?.files?.length || /flexnote-canvas-copy:/.test(text + html))) return;
    event.preventDefault(); event.stopImmediatePropagation();
    paste(topics[0], text, ours).catch(error => console.error(error));
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('paste', onPaste, true);
  return { dispose: () => { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('paste', onPaste, true); } };
}
