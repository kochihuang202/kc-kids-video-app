// Native15457/27560 contracts, with Gemini's ZIP/OpenXML packaging helpers.
// Exports are isolated, immutable artifacts; renderer paths are not accepted.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { createZip, packDocx } = require('./export-packages.cjs');
function createOriginalExports({ directory, load, attachments }) {
    const names = new Set(['exportNoteCardToMarkdown', 'saveDocxFromXml', 'resolveExportImages']);
    const safeName = value => { let name = String(value || 'note').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'note'; if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))
        name = '_' + name; return name; };
    const publish = (name, bytes) => { const folder = path.join(directory, crypto.randomUUID()); fs.mkdirSync(folder, { recursive: true }); const target = path.join(folder, name); const fd = fs.openSync(target, 'wx'); try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
    }
    finally {
        fs.closeSync(fd);
    } return target; };
    const readImage = src => { const file = attachments.readUrl(src); if (file.ext === '.pdf')
        throw Error('PDF is not an inline image'); return file; };
    async function call(name, payload) {
        if (name === 'resolveExportImages') {
            if (!Array.isArray(payload?.srcs) || payload.srcs.length > 100)
                throw Error('Invalid export images');
            return payload.srcs.map(src => { const { bytes, ext } = readImage(src); return { src, base64: bytes.toString('base64'), contentType: 'image/' + ({ '.jpg': 'jpeg' }[ext] || ext.slice(1)) }; });
        }
        if (name === 'exportNoteCardToMarkdown') {
            if (!Array.isArray(payload?.cardIds) || payload.cardIds.length !== 1 || typeof payload.markdownString !== 'string' || Buffer.byteLength(payload.markdownString) > 8 * 1024 * 1024)
                throw Error('This export requires one native card document');
            const graph = await load(), card = graph.contents.find(row => row.id === payload.cardIds[0] && row.kind === 'text');
            if (!card || graph.cardMetadata?.some(row => row.id === card.id && row.isTrashed))
                throw Error('Export card is missing or trashed');
            const media = new Map();
            const markdown = payload.markdownString.replace(/flexnote:\/\/file\/[a-f0-9]{64}(?:\.(?:png|jpg|gif|webp|bmp))?/g, src => { const { bytes, ext } = readImage(src), id = new URL(src).pathname.slice(1).split('.')[0], name = id + ext; media.set(name, bytes); return './media/' + name; });
            if (markdown.includes('flexnote://'))
                throw Error('Unresolved attachment in Markdown export');
            const filename = safeName(card.title) + '.md';
            const bytes = createZip([{ name: filename, data: markdown }, ...[...media].map(([name, data]) => ({ name: 'media/' + name, data }))]);
            const zipPath = publish('InkBridge-' + safeName(card.title) + '.zip', bytes);
            // Keep the readable Markdown next to its archive, with the same media layout.
            const folder = path.dirname(zipPath);
            fs.writeFileSync(path.join(folder, filename), markdown, { flag: 'wx' });
            if (media.size)
                fs.mkdirSync(path.join(folder, 'media'));
            for (const [name, data] of media)
                fs.writeFileSync(path.join(folder, 'media', name), data, { flag: 'wx' });
            return { zipPath, zipName: path.basename(zipPath), filePath: path.join(folder, filename), fileName: filename };
        }
        if (name === 'saveDocxFromXml') {
            const { documentXml, media = [], defaultName = 'note.docx' } = payload || {};
            if (typeof documentXml !== 'string' || Buffer.byteLength(documentXml) > 8 * 1024 * 1024 || !documentXml.includes('<w:document') || /<!DOCTYPE|<!ENTITY/i.test(documentXml) || !Array.isArray(media) || media.length > 100)
                throw Error('Invalid Word export');
            const ids = new Set(), files = new Set();
            let total = 0;
            for (const file of media) {
                if (!/^rId[A-Za-z0-9]+$/.test(file.id) || !/^image[0-9]+\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(file.name) || ids.has(file.id) || files.has(file.name) || typeof file.base64 !== 'string')
                    throw Error('Invalid Word media');
                ids.add(file.id);
                files.add(file.name);
                total += Buffer.from(file.base64, 'base64').length;
            }
            if (total > 64 * 1024 * 1024)
                throw Error('Word media exceeds export limit');
            const filename = safeName(defaultName).replace(/\.docx$/i, '') + '.docx', filePath = publish(filename, packDocx({ documentXml, media }));
            return { success: true, filePath };
        }
        throw Error('Unsupported export service: ' + name);
    }
    return { has: name => names.has(name), call };
}
module.exports = { createOriginalExports };
