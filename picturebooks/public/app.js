import { openGuide, closeGuide, guideOpen, guidePage } from './guide.js';
const $ = (id) => document.getElementById(id);
const storageKey = 'mother-daughter-books:v1';
let books = [], currentBook = null, currentPage = 0, focused = false, touch = null, imageRequest = 0;
let shelfScroll = 0, searchTerm = '';
function loadProgress() {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
let progress = loadProgress();
function savedPage(book) {
  const index = progress[book.id]?.page;
  return Number.isInteger(index) ? Math.max(0, Math.min(book.pages.length - 1, index)) : 0;
}
function remember() {
  progress[currentBook.id] = { page: currentPage, updatedAt: Date.now() };
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { /* Reading still works when storage is unavailable. */ }
}
function recentBook() {
  return books.filter(book => Number.isFinite(progress[book.id]?.updatedAt)).sort((a, b) => progress[b.id].updatedAt - progress[a.id].updatedAt)[0];
}
function routeFor(book, index) { return `#book/${encodeURIComponent(book.id)}?page=${index + 1}`; }
function openBook(book, index = savedPage(book)) {
  if (!currentBook) shelfScroll = window.scrollY;
  location.hash = routeFor(book, index);
}
function renderShelf() {
  const grid = $('book-grid');
  grid.replaceChildren();
  const matches = books.filter(book => `${book.title} ${book.number}`.toLowerCase().includes(searchTerm));
  for (const book of matches) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'book-card';
    button.setAttribute('aria-label', `閱讀 ${book.title}`);
    const cover = document.createElement('div'); cover.className = 'book-cover';
    const image = document.createElement('img'); image.src = book.cover; image.alt = `${book.title} 封面`; image.loading = 'lazy'; image.decoding = 'async';
    const label = document.createElement('span'); label.className = 'book-label'; label.textContent = book.number;
    cover.append(image, label);
    const details = document.createElement('div'); details.className = 'book-details';
    const copy = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = book.title;
    const detail = document.createElement('p');
    detail.textContent = `${book.pages.length} 頁${progress[book.id] ? ` · 上次讀到第 ${savedPage(book) + 1} 頁` : ' · 等妳們一起翻開'}`;
    copy.append(title, detail);
    const arrow = document.createElement('span'); arrow.className = 'open-book'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
    details.append(copy, arrow); button.append(cover, details);
    button.addEventListener('click', () => openBook(book)); grid.append(button);
  }
  $('book-count').textContent = `${books.length} 本故事`;
  $('empty-result').hidden = matches.length > 0;
  const recent = recentBook();
  $('continue-section').hidden = !recent;
  if (recent) {
    $('continue-image').src = recent.pages[savedPage(recent)];
    $('continue-title').textContent = recent.title;
    $('continue-detail').textContent = `第 ${savedPage(recent) + 1} 頁 / 共 ${recent.pages.length} 頁 · 點一下，接著我們的故事`;
    $('continue-button').onclick = () => openBook(recent);
  }
}
function setFocus(value) {
  focused = value;
  $('reader').classList.toggle('focus-mode', value);
  $('focus-toggle').setAttribute('aria-pressed', String(value));
  $('restore-controls').hidden = !value;
}
function closeReader() {
  if ($('finished-dialog').open) $('finished-dialog').close();
  const previousBook = currentBook;
  currentBook = null;
  $('reader').hidden = true; $('bookshelf').hidden = false;
  document.body.classList.remove('reading'); setFocus(false);
  renderShelf();
  requestAnimationFrame(() => {
    window.scrollTo(0, shelfScroll);
    if (previousBook) {
      const button = [...document.querySelectorAll('.book-card')].find(node => node.getAttribute('aria-label') === `閱讀 ${previousBook.title}`);
      button?.focus({ preventScroll: true });
    }
    if (location.hash === '#library') $('library').scrollIntoView();
  });
}
function updatePage() {
  if (!currentBook) return;
  const book = currentBook, index = currentPage;
  const pageImage = $('page-image');
  const requestId = ++imageRequest;
  $('image-status').hidden = false; $('image-status-text').textContent = '正在打開這一頁…'; $('retry-image').hidden = true;
  pageImage.style.visibility = 'hidden';
  pageImage.alt = `${book.title}，第 ${index + 1} 頁，共 ${book.pages.length} 頁`;
  pageImage.onload = () => {
    if (requestId !== imageRequest || currentBook !== book || currentPage !== index) return;
    $('image-status').hidden = true; pageImage.style.visibility = 'visible';
  };
  pageImage.onerror = () => {
    if (requestId !== imageRequest) return;
    $('image-status-text').textContent = '這一頁暫時打不開，請確認網路後再試一次。'; $('retry-image').hidden = false;
  };
  pageImage.src = book.pages[index];
  if (pageImage.complete && pageImage.naturalWidth > 0) pageImage.onload();
  $('page-count').textContent = `${index + 1} / ${book.pages.length}`;
  $('page-progress').max = book.pages.length; $('page-progress').value = index + 1;
  $('previous-page').disabled = index === 0;
  $('next-page').setAttribute('aria-label', index === book.pages.length - 1 ? '讀完了' : '下一頁');
  remember();
  if (book.pages[index + 1]) { const preload = new Image(); preload.src = book.pages[index + 1]; }
}
function route() {
  closeGuide();
  if (!books.length) return;
  const match = location.hash.match(/^#book\/([^?]+)(?:\?page=(\d+))?$/);
  const book = match && books.find(item => encodeURIComponent(item.id) === match[1]);
  if (!book) { if (currentBook) closeReader(); return; }
  if (currentBook !== book) {
    if (!currentBook) shelfScroll = window.scrollY;
    setFocus(false);
    $('reader-title').textContent = book.title;
    $('reader-number').textContent = `STORY ${book.number}`;
  }
  currentBook = book;
  currentPage = match[2] ? Math.max(0, Math.min(book.pages.length - 1, Number(match[2]) - 1)) : savedPage(book);
  $('bookshelf').hidden = true; $('reader').hidden = false; document.body.classList.add('reading');
  history.replaceState(null, '', routeFor(book, currentPage));
  updatePage();
}
function goPage(index) {
  if (!currentBook) return;
  if (index >= currentBook.pages.length) { if (!$('finished-dialog').open) $('finished-dialog').showModal(); return; }
  if (index < 0) return;
  currentPage = index;
  history.replaceState(null, '', routeFor(currentBook, currentPage));
  updatePage();
}
async function loadCatalog() {
  $('catalog-status').hidden = false; $('catalog-status').textContent = '正在把故事放上書櫃…'; $('catalog-retry').hidden = true;
  try {
    const response = await fetch('/catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('catalog unavailable');
    const catalog = await response.json();
    if (!Array.isArray(catalog.books) || !catalog.books.length || catalog.books.some(book => typeof book.id !== 'string' || typeof book.title !== 'string' || !Array.isArray(book.pages) || !book.pages.length || book.pages.some(url => typeof url !== 'string' || !url.startsWith('/media/books/')))) throw new Error('invalid catalog');
    books = catalog.books;
    $('welcome-image').src = books[0].pages[Math.min(3, books[0].pages.length - 1)];
    $('catalog-status').hidden = true;
    renderShelf(); route();
  } catch {
    $('catalog-status').textContent = '書櫃暫時打不開，請確認網路後再試一次。'; $('catalog-retry').hidden = false;
  }
}
$('catalog-retry').onclick = loadCatalog;
$('open-guide').onclick = () => { if (currentBook) openGuide(currentBook, currentPage); };
$('search').addEventListener('input', event => { searchTerm = event.target.value.trim().toLowerCase(); renderShelf(); });
$('back-to-shelf').onclick = () => { location.hash = ''; };
$('focus-toggle').onclick = () => setFocus(!focused);
$('restore-controls').onclick = () => setFocus(false);
$('previous-page').onclick = () => goPage(currentPage - 1);
$('next-page').onclick = () => goPage(currentPage + 1);
$('start-over').onclick = () => goPage(0);
$('retry-image').onclick = () => { $('page-image').removeAttribute('src'); updatePage(); };
$('reread-book').onclick = () => { $('finished-dialog').close(); goPage(0); };
$('finish-to-shelf').onclick = () => { $('finished-dialog').close(); location.hash = ''; };
$('close-finished').onclick = () => $('finished-dialog').close();
$('page-image').onclick = () => { if (Date.now() < suppressClickUntil) return; setFocus(!focused); };
let suppressClickUntil = 0;
$('reading-stage').addEventListener('touchstart', event => {
  if (event.touches.length !== 1 || (window.visualViewport?.scale || 1) > 1.05) { touch = null; return; }
  touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
}, { passive: true });
$('reading-stage').addEventListener('touchend', event => {
  if (!touch || event.touches.length || !event.changedTouches[0]) { touch = null; return; }
  const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y;
  touch = null;
  if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { suppressClickUntil = Date.now() + 500; goPage(currentPage + (dx < 0 ? 1 : -1)); }
}, { passive: true });
$('reading-stage').addEventListener('touchcancel', () => { touch = null; }, { passive: true });
window.addEventListener('hashchange', route);
document.addEventListener('keydown', event => {
  if (guideOpen()) {
    if (event.key === 'Escape') closeGuide();
    if (event.key === 'ArrowRight') { event.preventDefault(); guidePage(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); guidePage(-1); }
    return;
  }
  if (!currentBook || $('finished-dialog').open || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); goPage(currentPage + 1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); goPage(currentPage - 1); }
  if (event.key === 'Escape') { if (focused) setFocus(false); else location.hash = ''; }
});
loadCatalog();
