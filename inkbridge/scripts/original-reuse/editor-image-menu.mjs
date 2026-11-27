const localImage = /^flexnote:\/\/file\/[a-f0-9]{64}(?:\.(?:png|jpe?g|webp|gif|bmp))?$/i;

export function installEditorImageMenu() {
  const copy = window.inkbridge?.copyImageToClipboard;
  if (!copy) return;
  const style = document.createElement('style');
  style.textContent = `
    .inkbridge-editor-image-menu{position:fixed;top:0;left:0;z-index:2147483646;padding:4px;background:#fff;color:#25272a;border:1px solid #e4e4e7;border-radius:8px;box-shadow:0 4px 14px #0002;font:13px "Segoe UI",sans-serif}
    .inkbridge-editor-image-menu button{display:block;width:100%;padding:6px 12px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer;text-align:left}
    .inkbridge-editor-image-menu button:hover,.inkbridge-editor-image-menu button:focus-visible{background:#edf5ef}
    .inkbridge-image-copy-status{position:fixed;top:50px;right:14px;z-index:2147483646;background:#fff;color:#25272a;padding:8px 12px;border:1px solid #e4e4e7;border-radius:8px;box-shadow:0 4px 14px #0002;font:13px "Segoe UI",sans-serif;pointer-events:none}`;
  document.head.append(style);

  let menu;
  function close() {
    menu?.remove();
    menu = null;
  }
  function announce(container, message) {
    const status = document.createElement('div');
    status.className = 'inkbridge-image-copy-status';
    status.setAttribute('role', 'status');
    status.textContent = message;
    container.append(status);
    setTimeout(() => status.remove(), 2200);
  }

  document.addEventListener('contextmenu', event => {
    close();
    const image = event.target instanceof Element && event.target.closest('img');
    const src = image && (image.currentSrc || image.src);
    if (!src || !localImage.test(src)) return;
    const container = image.closest('[role="dialog"]') || document.body;
    event.preventDefault();
    event.stopImmediatePropagation();
    menu = document.createElement('div');
    menu.className = 'inkbridge-editor-image-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '圖片操作');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = '複製圖片';
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', async () => {
      close();
      try {
        await copy({src});
        announce(container, '已複製圖片');
      } catch (error) {
        announce(container, '無法複製圖片');
      }
    });
    menu.append(button);
    container.append(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(event.clientX, innerWidth - bounds.width - 4)) - bounds.left}px`;
    menu.style.top = `${Math.max(0, Math.min(event.clientY, innerHeight - bounds.height - 4)) - bounds.top}px`;
  }, true);
  document.addEventListener('pointerdown', event => { if (menu && !menu.contains(event.target)) close(); }, true);
  document.addEventListener('keydown', event => {
    if (!menu) return;
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      close();
    }
  }, true);
  window.addEventListener('blur', close);
}
