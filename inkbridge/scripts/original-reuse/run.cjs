const {_electron}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'../..'),data=await fs.mkdtemp(path.join(os.tmpdir(),'inkbridge-original-modules-'));
  const env={...process.env,INKBRIDGE_ORIGINAL_PROBE_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  const executable=process.env.INKBRIDGE_ORIGINAL_PREVIEW_EXE;
  const launch=()=>_electron.launch({args:executable?[]:[path.join(__dirname,'host.cjs')],executablePath:executable||require('electron'),env,timeout:30000});let app=await launch();
  try{
    const page=await app.firstWindow();await page.waitForFunction(()=>window.__originalProbe?.phase==='mount-requested',{},{timeout:60000});
    await page.waitForFunction(()=>window.__originalProbe.editorReady||window.__originalProbe.errors.length,{},{timeout:15000}).catch(()=>{});
    await page.locator('#editor-host [contenteditable="true"]').waitFor({state:'visible',timeout:10000}).catch(()=>{});
    const editable=page.locator('#editor-host [contenteditable="true"]');
    const operations={};
    if(await editable.count()){
      await editable.click();await editable.press('Control+End');await page.keyboard.insertText('原模組實際輸入龍');
      await page.waitForFunction(()=>JSON.stringify(window.__originalProbe.document).includes('原模組實際輸入龍'),{},{timeout:10000});operations.realTyping=true;
      await app.evaluate(async({clipboard})=>{const saved=[];for(const item of await clipboard.read()){const payload={};for(const type of item.types){const value=await item.getType(type);payload[type]=typeof value?.arrayBuffer==='function'?new Blob([await value.arrayBuffer()],{type:value.type}):value;}saved.push(payload);}globalThis.__probeClipboard=saved;});
      try{
        const html='<h2>原版富文本驗證</h2><p>中文 <strong>粗體龍</strong> 與 English</p><ul><li>清單甲</li><li>清單乙</li></ul><pre><code class="language-javascript">const answer = 42;\nconsole.log(answer);</code></pre><p><a href="https://example.invalid">來源連結</a></p><table><tr><th>甲</th><th>乙</th></tr><tr><td>丙</td><td>丁</td></tr></table><aside data-callout-type="note"><p>原版提示框</p></aside><details open><summary>原版折疊標題</summary><div data-lexical-collapsible-content="true"><p>原版折疊內容</p></div></details>'+Array.from({length:12},(_,i)=>`<p>第${i+1}段長文龍</p>`).join('');
        await app.evaluate(async({clipboard,ClipboardItem},html)=>clipboard.write([new ClipboardItem({'text/html':html,'text/plain':'原版富文本驗證'})]),html);
        await editable.press('Control+Home');await editable.press('Control+a');await editable.press('Control+v');
        await page.waitForFunction(()=>JSON.stringify(window.__originalProbe.document).includes('第12段長文龍'),{},{timeout:10000});
        operations.realHTMLPaste=true;operations.nodeTypes=await page.evaluate(()=>{const types=new Set();function visit(node){types.add(node.type);for(const child of node.children||[])visit(child);}visit(window.__originalProbe.document.root);return [...types];});
        for(const type of ['list','code','table','link','callout','collapsible-container'])assert(operations.nodeTypes.includes(type),'Missing original rich node: '+type);
      }finally{await app.evaluate(async({clipboard,ClipboardItem})=>{const saved=globalThis.__probeClipboard;if(saved?.length)await clipboard.write(saved.map(payload=>new ClipboardItem(payload)));else clipboard.clear();delete globalThis.__probeClipboard;});}
      await editable.press('Control+End');await page.keyboard.insertText('立即保存最新字鳳');await editable.press('Control+s');
      const ack=await page.evaluate(()=>window.__originalBridge.flush());assert(ack.revision>0);
      const graph=await page.evaluate(()=>window.inkbridge.load()),saved=graph.contents.find(content=>content.id==='probe-note');assert(saved.body.includes('立即保存最新字鳳'));operations.latestContentCommitACK=ack.revision;
      const cdp=await page.context().newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'組字龍',selectionStart:3,selectionEnd:3});await page.waitForFunction(()=>window.__originalLexical.isComposing());
      await page.evaluate(()=>{window.__imeAck=false;window.__imePromise=window.__originalBridge.flush().then(()=>{window.__imeAck=true;});});
      assert.equal(await page.evaluate(()=>window.__imeAck),false);await cdp.send('Input.insertText',{text:'選字完成龍'});await page.evaluate(()=>window.__imePromise);
      const imeSaved=await page.evaluate(()=>window.inkbridge.load());assert(imeSaved.contents.find(content=>content.id==='probe-note').body.includes('選字完成龍'));operations.chromiumIMEGate=true;
    }
    const result=await page.evaluate(()=>({...window.__originalProbe,changes:window.__originalProbe.changes.length,loaded:[...new Set(window.__originalProbe.loaded)],html:document.querySelector('#editor-host').innerHTML.slice(0,1200)}));
    result.operations=operations;
    result.editableCount=await page.locator('#editor-host [contenteditable="true"]').count();result.componentError=await page.locator('#editor-host').innerText().then(text=>text.includes('元件渲染出錯'));
    result.isolation=await app.evaluate(()=>globalThis.__inkbridgeOriginalProbe);
    await fs.writeFile(path.join(root,'private-original-editor/runtime-result.json'),JSON.stringify(result,null,2));
    await page.screenshot({path:path.join(root,'private-original-editor/runtime.png'),fullPage:true});
    await editable.screenshot({path:path.join(root,'private-original-editor/original-editor.png')});
    await page.locator('#original-canvas').screenshot({path:path.join(root,'private-original-editor/original-render.png')});
    const committed=await page.evaluate(()=>window.inkbridge.load());
    const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await closed;app=null;
    app=await launch();const reopenedPage=await app.firstWindow();await reopenedPage.waitForFunction(()=>window.__originalProbe?.editorReady);await reopenedPage.locator('#editor-host [contenteditable="true"]').waitFor();
    const reopened=await reopenedPage.evaluate(()=>window.inkbridge.load());assert.deepEqual(reopened.contents,committed.contents);assert.deepEqual(reopened.instances,committed.instances);operations.normalCloseRestart=true;
    await fs.writeFile(path.join(root,'private-original-editor/runtime-result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({renderReady:result.renderReady,editorReady:result.editorReady,editableCount:result.editableCount,componentError:result.componentError,operations,errors:result.errors.map(error=>({stage:error.stage,message:error.message})),failedModules:result.failedModules.slice(0,8),loadedModules:result.loaded.length,isolation:result.isolation}));
  }finally{await app?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
