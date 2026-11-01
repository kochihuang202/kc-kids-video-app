// Reused from Gemini b5fd5bc host helpers; isolated from lifecycle/IPC.
const zlib = require('node:zlib');
function createZip(files) {
    const localHeaders = [], centralHeaders = [];
    let offset = 0;
    for (const file of files) {
        const nameBuf = Buffer.from(file.name, 'utf8'), dataBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '', 'utf8');
        const crc = zlib.crc32(dataBuf), compressed = zlib.deflateRawSync(dataBuf);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(0x800, 6);
        lh.writeUInt16LE(8, 8);
        lh.writeUInt16LE(0, 10);
        lh.writeUInt16LE(0, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(compressed.length, 18);
        lh.writeUInt32LE(dataBuf.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        localHeaders.push(lh, nameBuf, compressed);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0x800, 8);
        ch.writeUInt16LE(8, 10);
        ch.writeUInt16LE(0, 12);
        ch.writeUInt16LE(0, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(compressed.length, 20);
        ch.writeUInt32LE(dataBuf.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt16LE(0, 30);
        ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34);
        ch.writeUInt16LE(0, 36);
        ch.writeUInt32LE(0, 38);
        ch.writeUInt32LE(offset, 42);
        centralHeaders.push(ch, nameBuf);
        offset += 30 + nameBuf.length + compressed.length;
    }
    const cdBuf = Buffer.concat(centralHeaders);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...localHeaders, cdBuf, eocd]);
}
function packDocx({ documentXml, media = [] }) {
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n  <Default Extension="xml" ContentType="application/xml"/>\n  <Default Extension="png" ContentType="image/png"/>\n  <Default Extension="jpeg" ContentType="image/jpeg"/>\n  <Default Extension="jpg" ContentType="image/jpeg"/>\n  <Default Extension="gif" ContentType="image/gif"/>\n  <Default Extension="webp" ContentType="image/webp"/>\n  <Default Extension="svg" ContentType="image/svg+xml"/>\n  <Default Extension="bmp" ContentType="image/bmp"/>\n  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>\n</Types>`;
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>\n</Relationships>`;
    const docRels = media.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('');
    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  ${docRels}\n</Relationships>`;
    const files = [
        { name: '[Content_Types].xml', data: contentTypesXml },
        { name: '_rels/.rels', data: relsXml },
        { name: 'word/_rels/document.xml.rels', data: docRelsXml },
        { name: 'word/document.xml', data: documentXml }
    ];
    for (const m of media) {
        if (m.base64)
            files.push({ name: `word/media/${m.name}`, data: Buffer.from(m.base64, 'base64') });
    }
    return createZip(files);
}
module.exports = { createZip, packDocx };
