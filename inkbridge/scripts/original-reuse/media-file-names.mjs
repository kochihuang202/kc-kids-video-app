// Media file names per board and per kind (user decision 2026-11-14; REG-157).
// The original has one global switch (showMediaFileNameOnCanvas, localStorage + UI slice).
// InkBridge keeps that switch as the default and stores a board's own choice in the board's
// attributes as inkbridgeMediaFileNames {image, video}. The first change on a board saves both
// kinds, so later changes to the global default no longer affect that board.
// Drawing: apply-media-file-name-patches.cjs (176). Settings rows: prepare-sharing.cjs (46979).
export function installMediaFileNames({ React, r, getBoard, save }) {
  const h = React.createElement, events = new EventTarget();
  const globalDefault = () => !!r(63268).Z.getState().ui?.showMediaFileNameOnCanvas;
  const own = (kind, board = getBoard()) => { const value = board?.attributes?.inkbridgeMediaFileNames?.[kind]; return typeof value === 'boolean' ? value : null; };
  const value = kind => own(kind) ?? globalDefault();
  const redraw = () => { const canvas = r(66597).L; canvas.clearCache?.(); canvas.requestRender?.(); events.dispatchEvent(new Event('change')); };
  globalThis.__inkbridgeMediaFileName = (kind, ctx) => own(kind) ?? !!ctx?.showMediaFileNameOnCanvas;
  async function set(kind, next) {
    const board = getBoard(); if (!board) return;
    const choice = { image: value('image'), video: value('video'), [kind]: !!next };
    await save(board.id, choice); redraw();
  }
  const rows = [['image', '顯示圖片檔名', '在圖片卡片上方顯示檔名'], ['video', '顯示影片檔名', '在影片卡片上方顯示檔名']];
  globalThis.__inkbridgeMediaFileNameRows = function MediaFileNameRows({ Row, Switch, className }) {
    const [, tick] = React.useState(0);
    React.useEffect(() => { const update = () => tick(n => n + 1); events.addEventListener('change', update); return () => events.removeEventListener('change', update); }, []);
    return h(React.Fragment, null, rows.map(([kind, title, description]) => h(Row, { key: kind, title, description, className, hideLine: true, 'data-inkbridge-media-file-name': kind },
      h(Switch, { className: 'scale-75 origin-top-right', size: 'sm', isSelected: value(kind), 'aria-label': title, onValueChange: next => { set(kind, next).catch(error => console.error(error)); } }))));
  };
  globalThis.__inkbridgeMediaFileNameTitles = rows.map(row => row[1]);
  return { value, set, redraw };
}
