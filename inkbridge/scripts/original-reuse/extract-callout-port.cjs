// Extract complete native Callout pieces from the operator's private editor
// source at generation time. No original component bodies are stored here.
module.exports = function extractCalloutPort({ editorSource, ts }) {
  if (typeof editorSource !== 'string' || !ts?.createSourceFile) {
    throw new TypeError('Callout extraction requires editorSource and TypeScript');
  }
  const ast = ts.createSourceFile('private-editor.js', editorSource, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) throw new Error('Invalid private editor source');
  const names = ['ng', 'np', 'nx', 'n5'];
  const matches = Object.fromEntries(names.map(name => [name, []]));
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && matches[node.name?.text]) {
      matches[node.name.text].push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) {
    if (matches[name].length !== 1) throw new Error(`Native Callout anchor is not unique: ${name}`);
  }
  const declarations = names.map(name => matches[name][0]);
  const body = declarations[0].parent;
  if (!ts.isBlock(body) || declarations.some(node => node.parent !== body)) {
    throw new Error('Native Callout declarations do not share the editor factory');
  }
  const dependencies = {
    a: 24246, o: 27378, s: 41570, c: 31542, w: 31446,
    eb: 1643, nu: 75098, nh: 80944, N: 89383, nT: 60321,
  };
  // Check the actual import bindings, rather than treating minified names as
  // identities across versions. The outer require is also used by nx's lazy
  // emoji import and must retain its original name.
  for (const [alias, id] of Object.entries(dependencies)) {
    const bindings = body.statements.filter(ts.isVariableStatement)
      .flatMap(statement => [...statement.declarationList.declarations])
      .filter(node => ts.isIdentifier(node.name) && node.name.text === alias);
    const initializer = bindings[0]?.initializer;
    if (bindings.length !== 1 || !initializer || !ts.isCallExpression(initializer)
      || initializer.expression.getText(ast) !== 'l' || initializer.arguments.length !== 1
      || !ts.isNumericLiteral(initializer.arguments[0])
      || Number(initializer.arguments[0].text) !== id) {
      throw new Error(`Native Callout dependency changed: ${alias} / ${id}`);
    }
  }
  const pluginSource = matches.nx[0].getText(ast);
  const synchronizationSource = matches.np[0].getText(ast);
  const titleSource = matches.ng[0].getText(ast);
  for (const [source, anchor] of [
    [titleSource, 'lexical.calloutType.'],
    [synchronizationSource, '[data-callout-header]'],
    [pluginSource, 'callout-icon-open'],
    [pluginSource, 'registerNodeTransform'],
    [pluginSource, '63569'],
  ]) {
    if (!source.includes(anchor)) throw new Error(`Native Callout contract changed: ${anchor}`);
  }
  const options = [];
  function findOption(node) {
    if (ts.isNewExpression(node) && node.arguments?.length === 2
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'Callout') {
      options.push(node);
    }
    ts.forEachChild(node, findOption);
  }
  findOption(matches.n5[0]);
  if (options.length !== 1 || options[0].expression.getText(ast) !== 'n8') {
    throw new Error('Native Callout insertion option is not unique');
  }
  const optionSource = options[0].getText(ast);
  if (!optionSource.includes('[data-callout-title-input]') || !optionSource.includes('N.Hz')) {
    throw new Error('Native Callout insertion/focus contract changed');
  }
  const factory = `function(module, exports, l) {
    "use strict";
    l.d(exports, { Plugin: function() { return nx; }, createOption: function() { return createOption; } });
    var ${Object.entries(dependencies).map(([alias, id]) => `${alias} = l(${id})`).join(', ')};
    ${titleSource}
    ${synchronizationSource}
    ${pluginSource}
    function createOption(e, l, n8) { return ${optionSource}; }
  }`;
  const generated = ts.createSourceFile('generated-callout.js', `(${factory});`, ts.ScriptTarget.Latest, true);
  if (generated.parseDiagnostics.length) throw new Error('Invalid generated Callout factory');
  return {
    factory,
    referenceFunctionNames: ['ng', 'np', 'nx'],
    expectedCount: 3,
    optionCount: 1,
    dependencies: { ...dependencies, lazyEmoji: 63569 },
    pluginExport: 'Plugin',
    optionExport: 'createOption',
    mount: { exportName: 'Plugin', besideExistingQuoteStyling: true },
  };
};
