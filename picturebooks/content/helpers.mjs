// All rows are authored against the published images. Pipes separate English/Chinese;
// semicolons separate phrases, never pages. Output IDs include English text so edits
// cannot silently turn a previously saved sentence into a different sentence.
export const pairs = text => text ? text.split(';').map(part => { const [en, zh] = part.split('|'); if (!en || !zh) throw new Error(`Missing translation: ${part}`); return { en: en.trim(), zh: zh.trim() }; }) : [];
export const row = (original, explanation, scene, look, extension, question, answer, follow, life, game, prompt) => ({ original, explanation, scene, look, extension, question, answer, follow, life, game, prompt });
