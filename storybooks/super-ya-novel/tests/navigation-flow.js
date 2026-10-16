async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],errors=[];
 await context.route('**/api/**',route=>route.abort());page.on('pageerror',e=>errors.push(e.message));
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};const query=()=>new URL(page.url()).searchParams;
 const count=async selector=>page.locator(selector).evaluateAll(nodes=>nodes.reduce((n,el)=>{const c=el.cloneNode(true);c.querySelectorAll('rt').forEach(r=>r.remove());return n+(c.textContent.match(/[\p{L}\p{N}]/gu)||[]).length;},0));
 for(const book of ['kiki','super-ya']){
  await page.goto('http://127.0.0.1:4178/?book='+book);await page.locator('[data-action="start"]').click();await page.locator('.prose').waitFor();
  check(query().get('chapter')==='0',book+' start route identifies actual chapter');
  if(book==='kiki')check(await page.locator('.guide-explainer').count()===0,'requested guide hint is removed');
  check(Number(await page.locator('[data-page-word-count]').getAttribute('data-page-word-count'))===await count('.source-block'),book+' page count contains only source text');
  await page.locator('[data-action="next"]').click();check(query().get('chapter')==='1',book+' next chapter updates route');
  await page.reload();await page.locator('.prose').waitFor();check(query().get('chapter')==='1',book+' reload stays in chapter');
  await page.locator('[data-action="home"]').click();await page.locator('#book-title').waitFor();check(!query().has('chapter'),book+' cover route removes chapter');
  await page.goBack();await page.locator('.prose').waitFor();check(query().get('chapter')==='1',book+' browser back restores reading view');
  await page.goForward();await page.locator('#book-title').waitFor();
  await page.locator('.mode-switch a[href*="mode=practice"]').click();await page.locator('.scene-card').first().waitFor();
  check(await page.locator('.reader-header a').first().getAttribute('href')!==await page.locator('.whisper-shortcut').getAttribute('href'),book+' cover and switch links have different destinations');
  check(await page.locator('.mode-switch a:not([href*="mode=practice"])').getAttribute('href')===await page.locator('.whisper-shortcut').getAttribute('href'),book+' mode card and top switch agree');
  await page.locator('.scene-card').nth(2).click();check(query().get('scene')==='2',book+' scene selection updates route');
  check(Number(await page.locator('[data-page-word-count]').getAttribute('data-page-word-count'))===await count('.practice-text'),book+' practice word count excludes controls and questions');
  await page.locator('.preferences summary').click();check(await page.locator('.drawer-nav a[href*="chapter="]').getAttribute('href')===await page.locator('.whisper-shortcut').getAttribute('href'),book+' top and drawer mode links agree');await page.keyboard.press('Escape');
  await page.locator('[data-p="extra"]').click();check(query().get('level')==='extra',book+' extra passage updates route');await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();await page.reload();await page.locator('.practice-paper').waitFor();check(await page.locator('[data-p="extra"]').getAttribute('aria-pressed')==='true',book+' reload preserves passage level');check(await page.locator('.practice-panel').isVisible(),book+' reload preserves the exercise phase');
  await page.locator('.practice-top [data-p="home"]').click();await page.locator('.scene-card').first().waitFor();check(!query().has('scene')&&!query().has('level'),book+' all scenes clears deep link');
  await page.reload();await page.locator('.scene-card').first().waitFor();check(await page.locator('.scene-card').count()>2,book+' all scenes stays a list after reload');
  await page.goBack();await page.locator('.practice-paper').waitFor();check(query().get('scene')==='2'&&query().get('level')==='extra',book+' back returns to matching scene and level');
  await page.locator('.whisper-shortcut').click();await page.locator('.prose').waitFor();check(query().get('chapter')==='2',book+' mode switch opens corresponding full chapter');
 }
 check(errors.length===0,'navigation and counts have no uncaught errors');await context.close();return {passed:checks.length,checks};
}
