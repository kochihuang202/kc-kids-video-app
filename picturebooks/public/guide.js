const $ = id => document.getElementById(id);
const key = 'mother-daughter-guide:v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
for (const field of ['favorites', 'scroll']) {
  if (!saved[field] || typeof saved[field] !== 'object' || Array.isArray(saved[field])) saved[field] = {};
}
let book, index = 0, data, request = 0, onlyFavorites = false, active, lastPhrase, speechRequest = 0;
const cache = new Map();
function persist() { try { localStorage.setItem(key, JSON.stringify(saved)); } catch {} }
const pageKey = () => `${book.id}:${index + 1}:${onlyFavorites ? 'favorites' : 'all'}`;
function saveScroll() { if (book) { saved.scroll[pageKey()] = $('guide-scroll').scrollTop; persist(); } }
export function stopSpeech() {
  ++speechRequest; active?.classList.remove('is-speaking'); active?.removeAttribute('aria-current'); active = null;
  window.speechSynthesis?.cancel();
}
function speak(node, phrase) {
  stopSpeech(); lastPhrase = { node, phrase }; $('speech-error').hidden = true;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { $('speech-error').hidden = false; return; }
  const token = speechRequest;
  try {
    const utterance = new SpeechSynthesisUtterance(phrase.en);
    utterance.lang = 'en-US'; utterance.rate = saved.rate === 0.8 ? 0.8 : 1;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => /^en[-_]US$/i.test(v.lang)) || voices.find(v => /^en\b/i.test(v.lang)) || null;
    const clear = () => { if (token !== speechRequest) return; node.classList.remove('is-speaking'); node.removeAttribute('aria-current'); active = null; };
    utterance.onstart = () => { if (token !== speechRequest) return; active = node; node.classList.add('is-speaking'); node.setAttribute('aria-current', 'true'); };
    utterance.onend = clear;
    utterance.onerror = event => { clear(); if (token === speechRequest && !['canceled', 'interrupted'].includes(event.error)) $('speech-error').hidden = false; };
    speechSynthesis.resume(); speechSynthesis.speak(utterance);
  } catch { $('speech-error').hidden = false; }
}
function phraseNode(phrase) {
  const row = document.createElement('div'); row.className = 'guide-phrase';
  const copy = document.createElement('div'); copy.className = 'phrase-copy';
  if (phrase.label) { const label = document.createElement('small'); label.className = 'phrase-label'; label.textContent = phrase.label; copy.append(label); }
  const button = document.createElement('button'); button.type = 'button'; button.className = 'english-phrase'; button.lang = 'en-US'; button.textContent = phrase.en; button.onclick = () => speak(button, phrase);
  const translation = document.createElement('p'); translation.className = 'phrase-translation'; translation.textContent = phrase.zh;
  const favorite = document.createElement('button'); favorite.type = 'button'; favorite.className = 'favorite-sentence';
  const update = () => { const selected = !!saved.favorites[phrase.id]; favorite.textContent = selected ? '♥' : '♡'; favorite.setAttribute('aria-label', `${selected ? '取消收藏' : '收藏句子'}：${phrase.en}`); favorite.setAttribute('aria-pressed', String(selected)); };
  favorite.onclick = () => { if (saved.favorites[phrase.id]) delete saved.favorites[phrase.id]; else saved.favorites[phrase.id] = true; persist(); update(); if (onlyFavorites) { saveScroll(); stopSpeech(); render(); } };
  update(); copy.append(button, translation); row.append(copy, favorite); return row;
}
function render() {
  $('guide-page-count').textContent = `${index + 1} / ${book.pages.length}`;
  $('guide-preview').src = book.pages[index]; $('guide-preview').alt = `${book.title} 第 ${index + 1} 頁`;
  $('guide-previous').disabled = index === 0; $('guide-next').disabled = index === book.pages.length - 1;
  $('guide-filter').setAttribute('aria-pressed', String(onlyFavorites));
  const container = $('guide-content'); container.replaceChildren();
  if (!data) return;
  const page = data.pages[index];
  let count = 0;
  for (const section of page.sections) {
    const phrases = section.phrases.filter(p => !onlyFavorites || saved.favorites[p.id]);
    if (onlyFavorites && !phrases.length) continue;
    const node = document.createElement('section'); node.className = 'guide-section';
    const title = document.createElement('h2'); title.textContent = section.title; node.append(title);
    if (section.note && !onlyFavorites) { const note = document.createElement('p'); note.className = 'guide-note'; note.textContent = section.note; node.append(note); }
    for (const phrase of phrases) { node.append(phraseNode(phrase)); count++; }
    container.append(node);
  }
  if (onlyFavorites && !count) { const note = document.createElement('p'); note.className = 'guide-empty'; note.textContent = '這一頁還沒有收藏句子。切回全部內容，點愛心留下妳想說的句子。'; container.append(note); }
  $('guide-scroll').scrollTop = Number(saved.scroll[pageKey()]) || 0;
}
async function load() {
  const token = ++request, target = book;
  data = cache.get(target.id); $('guide-retry').hidden = true;
  $('guide-status').hidden = !!data; $('guide-status').textContent = '正在準備這一頁的陪讀素材…'; render();
  if (data) return;
  try {
    const response = await fetch(`/guides/${encodeURIComponent(target.id)}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (result.bookId !== target.id || result.version !== 1 || result.pages?.length !== target.pages.length || result.pages.some((p, i) => p.page !== i + 1 || p.image !== target.pages[i] || !Array.isArray(p.sections) || p.sections.some(s => typeof s.title !== 'string' || !Array.isArray(s.phrases) || s.phrases.some(p => typeof p.id !== 'string' || typeof p.en !== 'string' || typeof p.zh !== 'string')))) throw new Error();
    if (token !== request || book !== target) return;
    data = result; cache.set(target.id, result); $('guide-status').hidden = true; render();
  } catch {
    if (token !== request || book !== target) return;
    $('guide-status').textContent = '這本指南暫時打不開。可以先回到繪本，也可以再試一次。'; $('guide-retry').hidden = false;
  }
}
export function guideOpen() { return !!book; }
export function openGuide(target, page) {
  book = target; index = page; onlyFavorites = false; data = null;
  $('guide').hidden = false; $('reader').hidden = true; $('guide-title').textContent = target.title;
  $('speech-error').hidden = true; setRate(saved.rate === 0.8 ? 0.8 : 1); load(); $('guide-return').focus();
}
export function closeGuide() {
  if (!book) return;
  saveScroll(); stopSpeech(); ++request; book = null; lastPhrase = null;
  $('guide').hidden = true; $('reader').hidden = false; $('open-guide').focus();
}
export function guidePage(delta) {
  if (!book || index + delta < 0 || index + delta >= book.pages.length) return;
  saveScroll(); stopSpeech(); lastPhrase = null; $('speech-error').hidden = true; index += delta; render();
}
function setRate(rate) { saved.rate = rate; persist(); $('speech-normal').setAttribute('aria-pressed', String(rate === 1)); $('speech-slow').setAttribute('aria-pressed', String(rate === 0.8)); }
$('guide-return').onclick = closeGuide;
$('guide-previous').onclick = () => guidePage(-1); $('guide-next').onclick = () => guidePage(1);
$('guide-retry').onclick = load;
$('guide-filter').onclick = () => { saveScroll(); stopSpeech(); onlyFavorites = !onlyFavorites; render(); };
$('speech-normal').onclick = () => { stopSpeech(); setRate(1); };
$('speech-slow').onclick = () => { stopSpeech(); setRate(0.8); };
$('speech-retry').onclick = () => { if (lastPhrase?.node.isConnected) speak(lastPhrase.node, lastPhrase.phrase); };
$('guide-scroll').addEventListener('scroll', saveScroll, { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveScroll(); stopSpeech(); } });
window.addEventListener('pagehide', () => { saveScroll(); stopSpeech(); });
