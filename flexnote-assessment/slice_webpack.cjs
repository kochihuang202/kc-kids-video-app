// Inert AST extraction; the bundled application and factories are never evaluated.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require(path.resolve(__dirname, '../node_modules/typescript'));
const [input, output, ...args] = process.argv.slice(2);
const sourceBytes = fs.readFileSync(input), source = sourceBytes.toString('utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ast = ts.createSourceFile(input, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
if (ast.parseDiagnostics.length) throw Error('Input has parse diagnostics');
const modules = [];
function visit(node) {
  if (ts.isPropertyAssignment(node) && /^\d+$/.test(node.name.text || '') && (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer))) {
    modules.push({id: node.name.text, start: node.initializer.getStart(ast), end: node.initializer.end});
  }
  ts.forEachChild(node, visit);
}
visit(ast);
fs.mkdirSync(output, {recursive: true});
const wanted = new Set(args.filter(a => !a.startsWith('needle=')));
const selected = [];
for (const m of modules.filter(m => wanted.has(m.id))) {
  const factory = source.slice(m.start, m.end), wrapper = 'module.exports = ';
  const name = `webpack-module-${m.id}.js`, file = path.join(output, name);
  const bytes = Buffer.from(wrapper + factory + ';\n');
  if (fs.existsSync(file) && !fs.readFileSync(file).equals(bytes)) throw Error('Refusing different existing bytes');
  fs.writeFileSync(file, bytes);
  selected.push({...m, start_byte: Buffer.byteLength(source.slice(0,m.start)), end_byte: Buffer.byteLength(source.slice(0,m.end)), factory_sha256: hash(factory), slice_sha256: hash(bytes), wrapper_prefix_length: wrapper.length, file: name});
}
const receipt = {input, source_sha256: hash(sourceBytes), offset_unit:'zero-based UTF-16 code units, end-exclusive', parseDiagnostics:0, modules, selected};
fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt,null,2));
const locations = [];
for (const arg of args.filter(a => a.startsWith('needle='))) {
  const needle = arg.slice(7);
  let start = 0, count = 0;
  while ((start=source.indexOf(needle,start)) >= 0) {
    const owner = modules.filter(m => m.start<=start && m.end>start).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
    if (count++<8) locations.push({needle,offset:start,owner});
    start+=needle.length || 1;
  }
}
console.log(JSON.stringify({source_sha256: receipt.source_sha256, module_count:modules.length, selected, locations}));
