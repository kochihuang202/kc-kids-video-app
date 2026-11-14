// InkBridge windows draw the native minimise/maximise/close buttons over the page
// (titleBarOverlay, 36px). Original tooltips open above their button by default, so the
// ones in the right panel header (collapse all, search, multi-select…) land under those
// native buttons and are cut off. A tooltip that overlaps the native buttons is moved to
// just below its trigger. Nothing else about the original tooltip changes.
const CONTROLS_FALLBACK = { top: 0, height: 36, width: 150 };
function controlsRect() {
  const overlay = navigator.windowControlsOverlay;
  if (overlay?.visible) { const bar = overlay.getTitlebarAreaRect(); return { left: bar.x + bar.width, right: window.innerWidth, top: 0, bottom: bar.y + bar.height }; }
  return { left: window.innerWidth - CONTROLS_FALLBACK.width, right: window.innerWidth, top: CONTROLS_FALLBACK.top, bottom: CONTROLS_FALLBACK.height };
}
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
function place(tip) {
  if (!tip.isConnected || tip.dataset.inkbridgeTitlebar === 'moved') return;
  const rect = tip.getBoundingClientRect(); if (!rect.width) return;
  if (!overlaps(rect, controlsRect())) return;
  const trigger = tip.id && document.querySelector(`[aria-describedby~="${CSS.escape(tip.id)}"]`);
  const below = trigger ? trigger.getBoundingClientRect().bottom + 6 : controlsRect().bottom + 4;
  tip.style.translate = `0 ${Math.round(below - rect.top)}px`; tip.dataset.inkbridgeTitlebar = 'moved';
}
export function installTooltipTitlebarFix() {
  if (window.__inkbridgeTooltipTitlebar) return;
  window.__inkbridgeTooltipTitlebar = true;
  // Tooltips animate in, so measure after layout settles.
  const check = tip => { requestAnimationFrame(() => place(tip)); setTimeout(() => place(tip), 120); };
  new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) { if (node.nodeType !== 1) continue; if (node.matches('[role=tooltip]')) check(node); node.querySelectorAll?.('[role=tooltip]').forEach(check); } }).observe(document.body, { childList: true, subtree: true });
}
