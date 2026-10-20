async(sessionPage)=>{
 const browser=sessionPage.context().browser(),context=await browser.newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],errors=[],writes=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};const origin=new URL(sessionPage.url()).origin;
 const old={chapter:4,started:true,finished:true,anchors:{4:{block:10,offset:3}},readThrough:{4:10},bopo:false,size:1};
 await context.addInitScript(old=>{if(!localStorage.getItem('shimajiro-novel:v2'))localStorage.setItem('shimajiro-novel:v2',JSON.stringify(old));},old);
 const docs={'super-ya:whisper':{state:old},'super-ya-revisit:whisper':{state:{chapter:6,started:true,finished:true}},'reading:settings':{state:{bopo:false,size:1,words:true,rate:.85}}};
 await context.route('**/api/progress',r=>r.fulfill({json:{documents:docs}}));
 await context.route('**/api/progress/**',async r=>{const key=new URL(r.request().url()).pathname.split('/').slice(-2).join(':');const patch=r.request().postDataJSON()?.patch;writes.push(key);docs[key]={state:{...docs[key]?.state,...patch}};await r.fulfill({json:{ok:true}});});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/');await page.locator('.bookshelf').waitFor();
 check(await page.locator('.book-card').count()===4,'root has four books with one SUPER YA');
 check(await page.locator('.book-card[href="?book=super-ya-revisit"]').count()===0,'duplicate is absent from shelf');
 await page.locator('.book-card[href="?book=super-ya"]').click();await page.locator('.whisper-mode .mode-primary').click();
 await page.locator('.toc-list li').last().waitFor();check(await page.locator('.toc-list li').count()===40,'original first book opens all forty pieces');
 check(await page.locator('.chapter-num').nth(9).textContent()==='10'&&await page.locator('.chapter-num').last().textContent()==='40','two-digit numbering is 10 and 40, never 010');
 await page.locator('[data-action=start]').click();await page.locator('.prose').waitFor();
 check(new URL(page.url()).searchParams.get('chapter')==='0','legacy finished fifth chapter does not mark or skip new text');
 check(await page.locator('body.no-bopo').count()===1,'existing annotation preference remains off');
 const story=await(await context.request.get(origin+'/books/super-ya-events/story.json')).json();
 for(let i=0;i<40;i++){
  if(i)await page.locator('[data-action=next]').click();
  const actual=await page.locator('.source-block').evaluateAll(ns=>ns.map(n=>{const c=n.cloneNode(true);c.querySelectorAll('rt').forEach(n=>n.remove());return c.textContent;}));
  check(JSON.stringify(actual)===JSON.stringify(story.chapters[i].blocks.map(b=>b.text)),`piece ${i+1} renders its complete manuscript`);
  check(await page.locator('.guide-passage').count()===story.chapters[i].presentation.guideRanges.length,`piece ${i+1} distinguishes present-day Shimajiro`);
 }
 await page.reload();await page.locator('.prose').waitFor();check(new URL(page.url()).searchParams.get('chapter')==='39','last piece survives reload');
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-novel:v2')).finished)===true,'old local completion is retained separately');
 await page.waitForTimeout(1000);check(writes.includes('super-ya-events:whisper')&&!writes.includes('super-ya:whisper')&&!writes.includes('super-ya-revisit:whisper'),'new reading writes only the edition document');
 await page.goto(origin+'/?book=super-ya-revisit&chapter=6');await page.locator('.toc-list').waitFor();check(new URL(page.url()).searchParams.get('book')==='super-ya'&&!new URL(page.url()).searchParams.has('chapter'),'old seven-part deep link returns to new contents without a false chapter mapping');
 await page.goto(origin+'/?book=super-ya&mode=practice');await page.locator('.scene-card').first().waitFor();
 const practice=await(await context.request.get(origin+'/practice.json')).json();check(await page.locator('.scene-card').count()===practice['super-ya'].scenes.length,'first book retains its existing independent comprehension units');
 await page.goto(origin+'/?view=parent');await page.locator('.parent-gate').waitFor();check(await page.locator('.parent-book').count()===0,'parent records remain gated');
 await page.locator('[data-parent-hold]').focus();await page.keyboard.down('Space');await page.waitForTimeout(3100);await page.keyboard.up('Space');await page.locator('.legacy-whisper-records').waitFor();
 check(await page.locator('.parent-book').first().locator('.legacy-whisper-records').count()===1,'parent can distinguish archived original progress');
 await page.screenshot({path:'output/playwright/events-parent-archives.png'});
 for(const [width,height]of [[820,1180],[1180,820],[390,844]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/?book=super-ya&mode=whisper');await page.locator('.toc-list').waitFor();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'forty-piece contents fit '+width);
  await page.locator('.toc-list button').nth(37).click();await page.locator('.prose').waitFor();
  await page.locator('.preferences summary').click();await page.locator('[data-size="2"]').click();if(await page.locator('body.no-bopo').count())await page.locator('[data-action=bopo]').click();await page.keyboard.press('Escape');await page.evaluate(()=>document.fonts.ready);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'large annotated piece fits '+width);
  check(await page.locator('.prose ruby h-zhuyin').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=13)),'phonetic columns remain readable '+width);
  await page.screenshot({path:`output/playwright/events-reading-${width}.png`});
 }
 check(!errors.length,'no unhandled edition errors');await context.close();return {passed:checks.length,checks};
}
