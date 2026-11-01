// Copy the original installation's public PDF.js4.4.168 assets only.
// No application factory/main process is executed or changed.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), asar = require('@electron/asar');
const source = process.argv[2] || 'C:/Users/ji3cp/AppData/Local/Programs/flexnote/resources/app.asar', out = path.resolve(__dirname, '../../private-original-editor/vendor/app/pdfjs'), prefix = path.join('node_modules', 'pdfjs-dist');
const manifest = JSON.parse(asar.extractFile(source, path.join(prefix, 'package.json')));
if (manifest.version !== '4.4.168')
    throw Error('PDF.js version mismatch');
const names = asar.listPackage(source).map(name => name.replace(/^[\\/]/, '')), receipt = [];
for (const name of names) {
    const relative = path.relative(prefix, name);
    if (relative === 'LICENSE' || relative.startsWith('cmaps' + path.sep) || relative.startsWith('standard_fonts' + path.sep) || relative === path.join('build', 'pdf.worker.min.mjs')) {
        let bytes;
        try {
            bytes = asar.extractFile(source, name);
        }
        catch (error) {
            if (!path.extname(name))
                continue;
            throw error;
        }
        const target = path.resolve(out, relative);
        if (!target.startsWith(out + path.sep))
            throw Error('Unsafe asset path');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, bytes);
        receipt.push({ name: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
}
if (!receipt.some(row => row.name === path.join('build', 'pdf.worker.min.mjs'))) {
    const bytes = asar.extractFile(source, path.join('app', 'pdf.worker.min.mjs'));
    if (!bytes.includes(Buffer.from('4.4.168')))
        throw Error('Packaged PDF worker version mismatch');
    const relative = path.join('build', 'pdf.worker.min.mjs');
    fs.mkdirSync(path.join(out, 'build'), { recursive: true });
    fs.writeFileSync(path.join(out, relative), bytes);
    receipt.push({ name: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
fs.writeFileSync(path.join(out, 'asset-receipt.json'), JSON.stringify({ source: { path: path.resolve(source), sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') }, version: manifest.version, files: receipt }, null, 2));
console.log(JSON.stringify({ version: manifest.version, files: receipt.length }));
