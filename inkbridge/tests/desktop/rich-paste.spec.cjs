const {test,expect,_electron}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
const project=path.resolve(__dirname,'../..');
let app,page,data;

async function start(){
  const env={...process.env,INKBRIDGE_TEST:'1',INKBRIDGE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  app=await _electron.launch({args:process.env.INKBRIDGE_PACKAGED_EXE?[]:[project],executablePath:process.env.INKBRIDGE_PACKAGED_EXE||require('electron'),env});
  page=await app.firstWindow();await page.waitForFunction(()=>window.__inkbridgeTest?.ready||window.__inkbridgeFailure);
  expect(await page.evaluate(()=>window.__inkbridgeFailure)).toBeUndefined();
}

async function preserveClipboard(){
  // ClipboardItem payloads can be lazy OS reads. Materialize every MIME value
  // in main before replacing the clipboard; never return private data to tests.
  await app.evaluate(async({clipboard})=>{
    const saved=[];
    for(const item of await clipboard.read()){
      const payload=Object.create(null);
      for(const type of item.types){
        const value=await item.getType(type);
        payload[type]=typeof value?.arrayBuffer==='function'?new Blob([await value.arrayBuffer()],{type:value.type}):value;
      }
      saved.push(payload);
    }
    globalThis.__inkbridgeRichPasteClipboardSnapshot=saved;
  });
}

async function restoreClipboard(){
  if(!app)return;
  await app.evaluate(async({clipboard,ClipboardItem})=>{
    const saved=globalThis.__inkbridgeRichPasteClipboardSnapshot;
    if(saved===undefined)return;
    if(saved.length)await clipboard.write(saved.map(payload=>new ClipboardItem(payload)));
    else clipboard.clear();
    delete globalThis.__inkbridgeRichPasteClipboardSnapshot;
  });
}

test.beforeEach(async()=>{
  data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-rich-paste-'));await start();await preserveClipboard();
});
test.afterEach(async()=>{
  try{await restoreClipboard();}finally{await app?.close();app=null;}
});

const editor=()=>page.getByRole('textbox',{name:'卡片富文本內容',exact:true});
async function openFirst(){
  // User-visible fit also brings the same card back after a persisted long-note
  // camera move; no fixture directly mutates the editor or its document.
  await page.getByRole('button',{name:'顯示全部',exact:true}).click();
  const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),item=state.instances.find(item=>item.id==='instance-0'),box=await page.locator('#board').boundingBox();
  await page.mouse.click(box.x+state.view.x+(item.x+70)*state.view.zoom,box.y+state.view.y+(item.y+70)*state.view.zoom);
  await expect(editor()).toBeVisible();return item;
}
async function pasteHTML(html,plain){
  await app.evaluate(async({clipboard,ClipboardItem},payload)=>{
    await clipboard.write([new ClipboardItem({'text/html':payload.html,'text/plain':payload.plain})]);
  },{html,plain});
  await editor().press('Control+a');await editor().press('Control+v');
  await page.evaluate(()=>window.__inkbridgeTest.flush());
}
async function savedContent(contentId){
  return (await page.evaluate(()=>window.__inkbridgeTest.load())).contents.find(content=>content.id===contentId);
}
function nodes(document){
  const all=[];const visit=node=>{if(!node||typeof node!=='object')return;all.push(node);for(const child of node.children||[])visit(child);};visit(document.root);return all;
}
function readable(node){
  if(node.type==='linebreak')return '\n';if(node.type==='tab')return '\t';
  return typeof node.text==='string'?node.text:(node.children||[]).map(readable).join('');
}
function expectStandardRichAST(document){
  const all=nodes(document),heading=all.find(node=>node.type==='heading'&&node.tag==='h2');
  expect(heading,'HTML h2 must remain a heading, not become a paragraph').toBeDefined();expect(readable(heading)).toBe('貼上標題龍');
  expect(all.some(node=>node.type==='text'&&node.text==='粗體保留'&&(node.format&1)===1)).toBe(true);
  const list=all.find(node=>node.type==='list'&&node.listType==='bullet');expect(list,'ul/li structure must survive paste').toBeDefined();
  expect(list.children.filter(node=>node.type==='listitem').map(readable)).toEqual(['清單甲','清單乙']);
  const code=all.find(node=>node.type==='code');expect(code,'pre/code must remain a code block').toBeDefined();
  expect(readable(code)).toContain('const answer = 42;');expect(readable(code)).toContain('\n');
  const link=all.find(node=>node.type==='link'&&node.url==='https://example.invalid/inkbridge-note');
  expect(link,'HTML anchor must retain its URL, not only its label').toBeDefined();expect(readable(link)).toBe('來源連結');
  const table=all.find(node=>node.type==='table');expect(table,'table structure must survive paste').toBeDefined();
  expect(table.children.filter(node=>node.type==='tablerow')).toHaveLength(2);
  const cells=nodes({root:table}).filter(node=>node.type==='tablecell');expect(cells).toHaveLength(4);
  expect(cells.map(readable)).toEqual(['甲','乙','丙','丁']);
}

const standardHTML='<h2>貼上標題龍</h2><p>一般文字與<strong>粗體保留</strong></p>'+
  '<ul><li>清單甲</li><li>清單乙</li></ul>'+
  '<pre><code class="language-javascript">const answer = 42;\nconsole.log(answer);</code></pre>'+
  '<p><a href="https://example.invalid/inkbridge-note">來源連結</a></p>'+
  '<table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td>丙</td><td>丁</td></tr></tbody></table>';

test('real rich HTML paste retains heading, list, code, link and table across SQLite restart and Canvas editing',async()=>{
  const item=await openFirst();await pasteHTML(standardHTML,'PLAIN_FALLBACK_MUST_NOT_REPLACE_RICH_HTML');
  const before=await savedContent(item.contentId);expectStandardRichAST(before.document);
  expect(before.body).not.toContain('PLAIN_FALLBACK_MUST_NOT_REPLACE_RICH_HTML');
  await expect(editor().locator('h2')).toContainText('貼上標題龍');await expect(editor().locator('ul li')).toHaveCount(2);
  await expect(editor().locator('a[href="https://example.invalid/inkbridge-note"]')).toHaveText('來源連結');
  await expect(editor().locator('table tr')).toHaveCount(2);
  await fs.mkdir(path.join(project,'artifacts'),{recursive:true});await page.getByRole('button',{name:'顯示全部',exact:true}).click();
  await page.screenshot({path:path.join(project,'artifacts/inkbridge-rich-editor.png')});
  await editor().press('Escape');await expect(page.locator('#card-editor')).toBeHidden();
  await page.screenshot({path:path.join(project,'artifacts/inkbridge-rich-display.png')});
  const layout=await page.evaluate(id=>window.__inkbridgeTest.captureText(id),item.id);
  expect(layout.unknownTypes,'all pasted standard nodes must have an implemented static renderer').toEqual([]);
  for(const text of ['貼上標題龍','清單甲','清單乙','const answer = 42;','來源連結','甲','丁'])expect(layout.text).toContain(text);
  // Restore while this main process still owns the eagerly read snapshot.
  await restoreClipboard();const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;app=null;
  await start();const reopened=await savedContent(item.contentId);expect(reopened.document).toEqual(before.document);expectStandardRichAST(reopened.document);
  await openFirst();await expect(editor().locator('table tr')).toHaveCount(2);await expect(editor().locator('ul li')).toHaveCount(2);
  await editor().press('Control+Home');await page.keyboard.insertText('再編輯');await page.evaluate(()=>window.__inkbridgeTest.flush());
  const changed=await savedContent(item.contentId),all=nodes(changed.document);
  expect(changed.body).toContain('再編輯貼上標題龍');for(const type of ['heading','list','code','link','table'])expect(all.some(node=>node.type===type)).toBe(true);
});

test('100 pasted mixed blocks retain blank paragraphs without a hidden internal scroller',async()=>{
  const item=await openFirst();
  const html='<h2>百段長文驗收龍</h2>'+Array.from({length:100},(_,n)=>{
    const tag=n%10===0?'h3':'p';
    return `<${tag}>第${n+1}段 <strong>粗體${n+1}</strong> mixed <em>斜體${n+1}</em> 龍</${tag}>`+(n%10===9?'<p><br></p>':'');
  }).join('');
  await pasteHTML(html,'LONG_PLAIN_FALLBACK_MUST_NOT_WIN');const content=await savedContent(item.contentId),all=nodes(content.document);
  expect(content.body).toContain('第100段');expect(content.body).not.toContain('LONG_PLAIN_FALLBACK_MUST_NOT_WIN');
  expect(all.filter(node=>node.type==='heading')).toHaveLength(11);
  expect(content.document.root.children.filter(node=>node.type==='paragraph'&&readable(node)==='').length).toBeGreaterThanOrEqual(10);
  expect(all.some(node=>node.type==='text'&&node.text==='粗體100'&&(node.format&1)===1)).toBe(true);
  expect(all.some(node=>node.type==='text'&&node.text==='斜體100'&&(node.format&2)===2)).toBe(true);
  const metrics=await editor().evaluate(element=>({top:element.scrollTop,scroll:element.scrollHeight,height:element.clientHeight,wrap:element.closest('.canvas-wrap').scrollTop}));
  expect(metrics.top).toBe(0);expect(metrics.wrap).toBe(0);expect(metrics.scroll).toBeLessThanOrEqual(metrics.height+1);
  await editor().press('Escape');const layout=await page.evaluate(id=>window.__inkbridgeTest.captureText(id),item.id);
  expect(layout.unknownTypes).toEqual([]);expect(layout.text).toContain('第100段');expect(layout.blocks.length).toBeGreaterThanOrEqual(111);
});

test('semantic HTML takes precedence over conflicting plain Markdown in the same real clipboard paste',async()=>{
  await openFirst();await pasteHTML('<h3>HTML語義優先龍</h3><p><strong>HTML粗體鳳</strong></p>','# MARKDOWN_CHANNEL_MUST_NOT_WIN\n\n- plain list');
  const state=await page.evaluate(()=>window.__inkbridgeTest.inspect()),content=await savedContent(state.instances.find(item=>item.id==='instance-0').contentId),all=nodes(content.document);
  expect(all.some(node=>node.type==='heading'&&node.tag==='h3'&&readable(node)==='HTML語義優先龍')).toBe(true);
  expect(all.some(node=>node.type==='text'&&node.text==='HTML粗體鳳'&&(node.format&1)===1)).toBe(true);
  expect(content.body).not.toContain('MARKDOWN_CHANNEL_MUST_NOT_WIN');
});

test('code indentation, newline and undo stay inside the code block and persist',async()=>{
  const item=await openFirst();await pasteHTML('<pre><code class="language-javascript">const value = 1;</code></pre>','const value = 1;');
  await editor().press('Control+End');await editor().press('Enter');await editor().press('Tab');await page.keyboard.insertText('console.log(value);');
  await page.evaluate(()=>window.__inkbridgeTest.flush());
  const saved=await savedContent(item.contentId),code=nodes(saved.document).find(node=>node.type==='code');
  expect(readable(code)).toContain('\n\tconsole.log(value);');expect(await editor().evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.getByRole('button',{name:'復原',exact:true}).click();await expect.poll(()=>editor().textContent()).not.toContain('console.log(value);');
  await page.getByRole('button',{name:'重做',exact:true}).click();await expect(editor()).toContainText('console.log(value);');
  await page.evaluate(()=>window.__inkbridgeTest.flush());await editor().press('Escape');await openFirst();
  expect(nodes((await savedContent(item.contentId)).document).some(node=>node.type==='code')).toBe(true);
});

test('block controls create headings and checklists; checkbox changes survive leaving the editor',async()=>{
  const item=await openFirst();await editor().fill('待辦事項龍');
  await page.getByLabel('區塊格式',{exact:true}).selectOption('h4');await expect(editor().locator('h4')).toHaveText('待辦事項龍');
  await page.getByLabel('區塊格式',{exact:true}).selectOption('check');await expect(editor().locator('li')).toHaveCount(1);
  const li=editor().locator('li');await li.click({position:{x:5,y:8}});await page.evaluate(()=>window.__inkbridgeTest.flush());
  expect(nodes((await savedContent(item.contentId)).document).find(node=>node.type==='listitem').checked).toBe(true);
  await editor().press('Escape');await openFirst();await expect(editor().locator('li')).toHaveClass(/editor-checked/);
});

test('table Tab and Shift+Tab navigate cells and edited cells retain their structure',async()=>{
  const item=await openFirst();await pasteHTML('<table><tr><td>左</td><td>右</td></tr><tr><td>下左</td><td>下右</td></tr></table>','左\t右\n下左\t下右');
  const cells=editor().locator('td');await cells.nth(0).click();await page.keyboard.press('End');await page.keyboard.press('Tab');await page.keyboard.insertText('次格龍');
  await expect(cells.nth(1)).toContainText('次格龍');await page.keyboard.press('Shift+Tab');await page.keyboard.insertText('首格鳳');await expect(cells.nth(0)).toContainText('首格鳳');
  await page.evaluate(()=>window.__inkbridgeTest.flush());await editor().press('Escape');
  const content=await savedContent(item.contentId),table=nodes(content.document).find(node=>node.type==='table');expect(table.children).toHaveLength(2);
  const layout=await page.evaluate(id=>window.__inkbridgeTest.captureText(id),item.id);expect(layout.blocks.find(block=>block.type==='table').cells).toHaveLength(4);
  await fs.mkdir(path.join(project,'artifacts'),{recursive:true});await page.getByRole('button',{name:'顯示全部',exact:true}).click();
  await page.screenshot({path:path.join(project,'artifacts/inkbridge-rich-table-display.png')});await openFirst();await expect(editor().locator('td').nth(1)).toContainText('次格龍');
});

test('unsupported rich HTML is rejected before flattening and leaves the committed note editable',async()=>{
  const item=await openFirst();await editor().fill('不得覆蓋的原內容龍');await page.evaluate(()=>window.__inkbridgeTest.flush());const before=await savedContent(item.contentId);
  await pasteHTML('<details><summary>折疊標題</summary><p>不能攤平</p></details>','不能用純文字偷偷取代');
  await expect(page.locator('#editor-notice')).toContainText('尚未貼入');
  expect((await savedContent(item.contentId)).document).toEqual(before.document);
  await editor().press('Control+End');await page.keyboard.insertText('仍可編輯鳳');await page.evaluate(()=>window.__inkbridgeTest.flush());
  expect((await savedContent(item.contentId)).body).toBe('不得覆蓋的原內容龍仍可編輯鳳');
});
