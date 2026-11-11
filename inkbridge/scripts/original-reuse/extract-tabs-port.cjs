// Recover complete Tabs/emoji statements from the private, versioned editor.
// Only extraction rules and compatibility bindings belong in the tracked file.
module.exports = function extractTabsPort({ editorSource, ts }) {
  if (typeof editorSource !== 'string' || !ts?.createSourceFile) {
    throw new TypeError('Tabs extraction requires editorSource and TypeScript');
  }
  const ast = ts.createSourceFile('private-editor.js', editorSource, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) throw new Error('Invalid private editor source');
  const functionNames = ['tK', 'tH', 'tG', 'tW', 'tV', 't$', 'tQ', 'tY', 'tJ', 't0'];
  const anchors = [...functionNames, 'n5'];
  const matches = Object.fromEntries(anchors.map(name => [name, []]));
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && matches[node.name?.text]) {
      matches[node.name.text].push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of anchors) {
    if (matches[name].length !== 1) throw new Error(`Native Tabs anchor is not unique: ${name}`);
  }
  const body = matches.t0[0].parent;
  if (!ts.isBlock(body) || anchors.some(name => matches[name][0].parent !== body)) {
    throw new Error('Native Tabs declarations do not share the editor factory');
  }
  const declarations = body.statements.filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations]);
  const binding = name => {
    const found = declarations.filter(node => ts.isIdentifier(node.name) && node.name.text === name);
    if (found.length !== 1) throw new Error(`Native Tabs binding is not unique: ${name}`);
    return found[0];
  };
  const dependencies = {
    a: 24246, o: 27378, c: 31542, s: 41570, w: 31446, eb: 1643, X: 78556,
  };
  const statementImports = {
    ts: 55153, tc: 62468, td: 3559, tu: 3515, tf: 54129, tm: 36012, tg: 84539,
    tN: 1656, tk: 87676, tT: 57343, tS: 30582, tL: 71336, tI: 93830,
    t_: 33575, tP: 35854, tR: 81630, tz: 84291, tA: 82558,
    tZ: 7957, tU: 94595,
  };
  for (const [alias, id] of Object.entries({ ...dependencies, ...statementImports, nA: 83427 })) {
    const initializer = binding(alias).initializer;
    if (!initializer || !ts.isCallExpression(initializer)
      || initializer.expression.getText(ast) !== 'l' || initializer.arguments.length !== 1
      || !ts.isNumericLiteral(initializer.arguments[0])
      || Number(initializer.arguments[0].text) !== id) {
      throw new Error(`Native Tabs dependency changed: ${alias} / ${id}`);
    }
  }
  if (binding('th').initializer?.getText(ast) !== 'l.n(tm)') {
    throw new Error('Native Tabs clipboard import changed');
  }
  const variableNames = [
    ...Object.keys(statementImports), 'th', 'tD', 'tF', 'tO', 'tB', 'tM', 'tq', 'tX',
  ];
  // A single variable statement may declare many requested bindings. Keep it
  // once, in source order, instead of emitting duplicate const/let declarations.
  const selected = new Set(functionNames.map(name => matches[name][0]));
  for (const name of variableNames) selected.add(binding(name).parent.parent);
  const statements = body.statements.filter(statement => selected.has(statement));
  const prohibited = new Set(['tp', 'tx', 'tb', 'ty', 'tv', 'tw', 'tC', 'tE', 'tj']);
  for (const statement of statements) {
    const names = ts.isVariableStatement(statement)
      ? [...statement.declarationList.declarations].map(node => node.name.getText(ast))
      : [statement.name?.text];
    if (names.some(name => prohibited.has(name))) {
      throw new Error('Tabs extraction would duplicate the host block NodeState');
    }
  }
  const pluginSource = matches.t0[0].getText(ast);
  const renameSource = matches.tY[0].getText(ast);
  const emojiSource = matches.tW[0].getText(ast);
  for (const [source, anchor] of [
    [pluginSource, 'TabsPlugin: TabsNode or TabPanelNode not registered on editor'],
    [pluginSource, 'registerNodeTransform'], [pluginSource, 'registerMutationListener'],
    [pluginSource, 'pointercancel'], [pluginSource, 'tE(t.panel)'],
    [renameSource, 'FlexnoteTabs__rename'], [emojiSource, '63569'],
    [binding('tq').getText(ast), 'INSERT_TABS_COMMAND'],
  ]) {
    if (!source.includes(anchor)) throw new Error(`Native Tabs contract changed: ${anchor}`);
  }
  const options = [];
  function findOption(node) {
    if (ts.isNewExpression(node) && node.arguments?.length === 2
      && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'Tabs') {
      options.push(node);
    }
    ts.forEachChild(node, findOption);
  }
  findOption(matches.n5[0]);
  if (options.length !== 1 || options[0].expression.getText(ast) !== 'n8') {
    throw new Error('Native Tabs insertion option is not unique');
  }
  const optionSource = options[0].getText(ast);
  if (!optionSource.includes('dispatchCommand(tq,') || !optionSource.includes('nA.default')) {
    throw new Error('Native Tabs insertion command/icon changed');
  }
  const factory = `function(e, t, n) {
    "use strict";
    var l = n;
    l.d(t, { Plugin: function() { return t0; }, createOption: function() { return createOption; }, bindBlockLink: function() { return bindBlockLink; } });
    var ${Object.entries(dependencies).map(([alias, id]) => `${alias} = l(${id})`).join(', ')}, nA = l(83427);
    var inkbridgeLinkBlock = null;
    function bindBlockLink(helper) {
      if (typeof helper !== "function") throw new TypeError("Tabs block-link binding must be a function");
      inkbridgeLinkBlock = helper;
    }
    function tE(node) {
      if (!inkbridgeLinkBlock) throw new Error("Tabs block-link helper has not been bound");
      return inkbridgeLinkBlock(node);
    }
    ${statements.map(statement => statement.getText(ast)).join('\n')}
    function createOption(e, l, n8) { return ${optionSource}; }
  }`;
  const generated = ts.createSourceFile('generated-tabs.js', `(${factory});`, ts.ScriptTarget.Latest, true);
  if (generated.parseDiagnostics.length) throw new Error('Invalid generated Tabs factory');
  return {
    factory,
    referenceFunctionNames: functionNames,
    expectedCount: functionNames.length,
    variableNames,
    extractedStatementCount: statements.length,
    sourceRanges: statements.map(statement => ({ start: statement.getStart(ast), end: statement.end })),
    optionCount: 1,
    dependencies: { ...dependencies, ...statementImports, insertionIcon: 83427, lazyEmoji: 63569 },
    pluginExport: 'Plugin', optionExport: 'createOption', blockLinkBindingExport: 'bindBlockLink',
    nodeModules: [94595], revealModule: 7957,
    mount: { exportName: 'Plugin', besideExistingCollapsible: true, props: ['cardId', 'cardType'] },
  };
};
