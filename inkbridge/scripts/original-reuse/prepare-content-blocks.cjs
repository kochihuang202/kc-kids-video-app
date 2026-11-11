// Read-only artifact preparation. Recovered components/styles stay private.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ts=require('typescript'),asar=require('@electron/asar'),postcss=require('postcss');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const root=path.resolve(__dirname,'../../private-original-editor'),out=path.join(root,'content-block-source');
const members={
  'app/_next/static/chunks/pages/_app-91d58d637545e654.js':'ee183c6a28418cec51da6323e1c7615bc8343d21534bf96a50f7a5f8656249b9',
  'app/_next/static/chunks/82301.5197fb6212cc9ad2.js':'b947aefd99c03dd8e9adf9267b49b334a8a1735c76008f759d1a5e280c00edb1',
};
const selected=new Set(['28988','94595','7957','80944','75098','27283','55927','71560','95128','18043','97287','48718']);
function prepareContentBlocks(archive){
  const read=member=>asar.extractFile(archive,member.split('/').join(path.sep));
  if(JSON.parse(read('package.json')).version!=='1.1.69')throw Error('Content block source must be FlexNote 1.1.69');
  fs.mkdirSync(out,{recursive:true});const receipt={version:'1.1.69',modules:{},files:[],execution:'not executed; selected artifact bytes only'},printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
  for(const [member,expected]of Object.entries(members)){
    const bytes=read(member);if(sha(bytes)!==expected)throw Error('Content source identity mismatch: '+member);
    const source=bytes.toString('utf8'),ast=ts.createSourceFile(member,source,99,true);if(ast.parseDiagnostics.length)throw Error('Invalid artifact syntax');
    function visit(n){if(ts.isPropertyAssignment(n)&&selected.has(n.name.getText(ast))&&(ts.isFunctionExpression(n.initializer)||ts.isArrowFunction(n.initializer))){
      const id=n.name.getText(ast),raw=n.initializer.getText(ast),factorySha256=sha(raw);if(receipt.modules[id])throw Error('Ambiguous selected factory '+id);
      const filename=`module-${id}.cjs`,formatted=`// Original 1.1.69 factory SHA-256 ${factorySha256}\nmodule.exports = ${printer.printNode(ts.EmitHint.Expression,n.initializer,ast)};\n`;
      fs.writeFileSync(path.join(out,filename),formatted);receipt.modules[id]={filename,factorySha256,formattedSha256:sha(formatted),member};return;
    }ts.forEachChild(n,visit);}visit(ast);receipt.files.push({member,sha256:expected});
  }
  if(Object.keys(receipt.modules).length!==selected.size)throw Error('Missing content block factory');
  const cssMember='app/_next/static/css/c1d9f9151d625677.css',css=read(cssMember);
  if(sha(css)!=='e73f4709475267a2763178ad102516ee0054408970a6447fe21977c187110a38')throw Error('Content CSS identity mismatch');
  const rules=[];postcss.parse(css.toString()).walkRules(rule=>{if(/FlexnoteTabs|callout|EmojiPicker__/i.test(rule.selector)){let node=rule.clone();for(let p=rule.parent;p&&p.type!=='root';p=p.parent){const wrapper=p.clone({nodes:[]});wrapper.append(node);node=wrapper;}rules.push(node.toString());}});
  if(rules.length!==125)throw Error('Content CSS selection changed');
  const cssOutput=rules.join('\n');fs.writeFileSync(path.join(out,'content-blocks.css'),cssOutput);receipt.css={member:cssMember,sourceSha256:sha(css),selectedRules:rules.length,sha256:sha(cssOutput)};
  const locales={};for(const locale of ['zh-TW','zh','en']){
    const member=`app/${locale}/board/index.html`,html=read(member).toString(),json=html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];if(!json)throw Error('Native translation data missing');
    const data=JSON.parse(json),common=data.props.pageProps._nextI18Next.initialI18nStore[locale].common;
    locales[locale]={lexical:Object.fromEntries(Object.entries(common.lexical).filter(([key])=>/^tabs$/i.test(key)||/callout/i.test(key)))};
    if(!locales[locale].lexical.tabs)throw Error('Native tabs translations missing');
    receipt.files.push({member,sha256:sha(html)});
  }
  fs.writeFileSync(path.join(out,'locales.json'),JSON.stringify(locales));fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
  return {out,modules:Object.keys(receipt.modules),cssRules:rules.length};
}
if(require.main===module){try{console.log(JSON.stringify(prepareContentBlocks(process.argv[2]||path.join(process.env.LOCALAPPDATA,'Programs/FlexNote/resources/app.asar'))));}catch(error){console.error(error);process.exitCode=1;}}
module.exports={prepareContentBlocks};
