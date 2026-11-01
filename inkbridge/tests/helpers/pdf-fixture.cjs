// A real, independently parseable PDF fixture with an exact page tree/xref.
module.exports = function pdfFixture(pages = 3) { const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']; const ids = []; for (let i = 1; i <= pages; i++) {
    const page = objects.length + 1, stream = `BT /F1 24 Tf 50 700 Td (INKBRIDGE PAGE ${i}) Tj ET`;
    ids.push(page);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
} objects[1] = `<< /Type /Pages /Kids [${ids.map(id => id + ' 0 R').join(' ')}] /Count ${pages} >>`; let pdf = '%PDF-1.4\n', offsets = [0]; for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
} const start = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`; return Buffer.from(pdf); };
