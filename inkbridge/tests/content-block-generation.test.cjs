// Generator unit checks only: no editor, application, DOM, or persistence is run.
// Read the operator's prepared private source; do not embed native bodies here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const extractTabs = require('../scripts/original-reuse/extract-tabs-port.cjs');
const extractCallout = require('../scripts/original-reuse/extract-callout-port.cjs');
const sourcePath = path.join(__dirname, '../private-original-editor/content-block-source/module-28988.cjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const contracts = [
  { name: 'Tabs', extract: extractTabs, functions: ['tK', 'tH', 'tG', 'tW', 'tV', 't$', 'tQ', 'tY', 'tJ', 't0'], option: 'Tabs' },
  { name: 'Callout', extract: extractCallout, functions: ['ng', 'np', 'nx'], option: 'Callout' },
];
function parse(text) {
  const ast = ts.createSourceFile('generator-unit.js', text, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, 'source must parse');
  return ast;
}
function find(ast, predicate) {
  const result = [];
  function visit(node) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return result;
}
function one(ast, predicate) {
  const result = find(ast, predicate);
  assert.equal(result.length, 1, 'expected one unambiguous source anchor');
  return result[0];
}
function namedFunction(ast, name) {
  return one(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name);
}
const native = parse(source);
const generated = contracts.map(contract => {
  const result = contract.extract({ editorSource: source, ts });
  return { ...contract, result, ast: parse(`(${result.factory});`) };
});

test('generator unit: Tabs and Callout preserve every complete required native function', () => {
  for (const contract of generated) {
    assert.deepEqual(contract.result.referenceFunctionNames, contract.functions);
    for (const name of contract.functions) {
      assert.equal(namedFunction(contract.ast, name).getText(contract.ast),
        namedFunction(native, name).getText(native), `${contract.name}.${name} must remain complete`);
    }
  }
});

test('generator unit: Tabs retains complete declaration groups once and shares its command with insertion', () => {
  const { result, ast } = generated[0];
  const names = ['ts', 'tc', 'td', 'tu', 'tf', 'tm', 'th', 'tg', 'tN', 'tk', 'tT',
    'tS', 'tL', 'tI', 't_', 'tP', 'tR', 'tz', 'tA', 'tD', 'tF', 'tO', 'tB', 'tM',
    'tZ', 'tU', 'tq', 'tX'];
  const statements = new Set();
  for (const name of names) {
    const original = one(native, node => ts.isVariableDeclaration(node) && node.name.getText(native) === name);
    const recovered = one(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
    statements.add(original.parent.parent);
    assert.equal(recovered.parent.parent.getText(ast), original.parent.parent.getText(native), name);
  }
  assert.equal(result.extractedStatementCount, statements.size + contracts[0].functions.length);
  assert.equal(new Set(result.sourceRanges.map(range => range.start)).size, result.sourceRanges.length);
  const command = one(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'tq');
  assert.equal(command.initializer.arguments[0].text, 'INSERT_TABS_COMMAND');
  const references = find(ast, node => ts.isIdentifier(node) && node.text === 'tq');
  assert.equal(references.length, 3, 'one declaration, one plugin registration, one insertion dispatch');
  const calls = references.filter(node => ts.isCallExpression(node.parent));
  assert.deepEqual(calls.map(node => node.parent.expression.getText(ast)).sort(),
    ['e.dispatchCommand', 'n.registerCommand']);
  assert(calls.every(node => node.parent.arguments[0] === node));
});

test('generator unit: Tabs delegates block linking to its host without another NodeState configuration', () => {
  const { ast } = generated[0];
  assert.equal(find(ast, node => ts.isCallExpression(node)
    && /(?:eK8|createState)$/.test(node.expression.getText(ast))).length, 0);
  for (const name of ['tp', 'tx', 'tb', 'ty', 'tv', 'tw', 'tC', 'tj']) {
    assert.equal(find(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name
      || ts.isVariableDeclaration(node) && node.name.getText(ast) === name).length, 0, name);
  }
  const delegate = namedFunction(ast, 'tE');
  const call = one(delegate, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'inkbridgeLinkBlock');
  assert.equal(call.arguments[0].getText(ast), 'node');
  const bind = namedFunction(ast, 'bindBlockLink');
  assert(bind.getText(ast).includes('typeof helper !== "function"'));
  assert(bind.getText(ast).includes('inkbridgeLinkBlock = helper'));
});

test('generator unit: generated exports expose the complete native insertion options', () => {
  for (const { ast, result, option, name } of generated) {
    const exportCall = one(ast, node => ts.isCallExpression(node) && node.expression.getText(ast) === 'l.d');
    const exports = exportCall.arguments[1].properties.map(property => property.name.getText(ast)).sort();
    assert.deepEqual(exports, (name === 'Tabs' ? ['Plugin', 'createOption', 'bindBlockLink'] : ['Plugin', 'createOption']).sort());
    assert.equal(result.pluginExport, 'Plugin');
    assert.equal(result.optionExport, 'createOption');
    const original = one(namedFunction(native, 'n5'), node => ts.isNewExpression(node)
      && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === option);
    const create = namedFunction(ast, 'createOption');
    assert.deepEqual(create.parameters.map(parameter => parameter.name.getText(ast)), ['e', 'l', 'n8']);
    const expression = one(create, ts.isNewExpression);
    assert.equal(expression.getText(ast), original.getText(native), `${name} option remains complete`);
  }
});

test('generator unit: both generators reject changed dependency identities', () => {
  for (const [extract, alias] of [[extractTabs, 'tU'], [extractCallout, 'nu']]) {
    const declaration = one(native, node => ts.isVariableDeclaration(node) && node.name.getText(native) === alias);
    const id = declaration.initializer.arguments[0];
    const changed = source.slice(0, id.getStart(native)) + '99999999' + source.slice(id.end);
    assert.throws(() => extract({ editorSource: changed, ts }), /dependency changed/);
  }
});

test('generator unit: both generators fail closed on missing, duplicate, or malformed source anchors', () => {
  for (const [extract, name] of [[extractTabs, 'tY'], [extractCallout, 'ng']]) {
    const declaration = namedFunction(native, name);
    const missing = source.slice(0, declaration.name.getStart(native)) + 'changedAnchor' + source.slice(declaration.name.end);
    assert.throws(() => extract({ editorSource: missing, ts }), /anchor is not unique/);
    assert.throws(() => extract({ editorSource: source + `\nfunction ${name}() {}`, ts }), /anchor is not unique/);
    assert.throws(() => extract({ editorSource: source + '\nfunction {', ts }), /Invalid private editor source/);
  }
});
