// Count only source characters and digits; formatting, whitespace and annotations do not count.
export const readingCharacterCount=texts=>(texts.join('').match(/[\p{L}\p{N}]/gu)||[]).length;
export function pageWordCount(texts,ui,ruby){const n=readingCharacterCount(texts);return `<p class="page-word-count" data-page-word-count="${n}" title="${ui.wordCountHint}">${ruby(ui.pageWordCount)}：${n.toLocaleString('zh-TW')} ${ruby(ui.characterUnit)}</p>`;}
