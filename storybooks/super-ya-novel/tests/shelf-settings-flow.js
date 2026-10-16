async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180},hasTouch:true,isMobile:true}),page=await context.newPage(),checks=[],errors=[],writes=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};page.on('pageerror',e=>errors.push(e.message));
 const documents={'reading:settings':{state:{bopo:true,size:0,words:true,rate:0.85}},'kiki:whisper':{state:{chapter:3,started:true,anchors:{3:{block:10,offset:100}}}},'super-ya:whisper':{state:{chapter:2,started:true}}};
 await context.route('**/api/progress**',async route=>{if(route.request().method()==='POST'){const key=route.request().url().split('/').slice(-2).join(':');writes.push(key);documents[key]??={state:{}};Object.assign(documents[key].state,route.request().postDataJSON().patch);await route.fulfill({json:{ok:true}});}else await route.fulfill({json:{documents}});});
 await page.goto('http://127.0.0.1:4178/');await page.locator('.bookshelf').waitFor();
 check(await page.locator('.preferences summary').isVisible(),'root entry offers the same fixed reading tools');
 for(const [width,height,label]of [[820,1180,'ipad-portrait'],[1180,820,'ipad-landscape'],[390,844,'phone']]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));const before=await page.locator('.preferences summary').boundingBox();await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const after=await page.locator('.preferences summary').boundingBox();
  check(Math.abs(before.y-after.y)<2&&before.y<24,label+' entry button remains fixed at the top');await page.locator('.preferences summary').click();
  const r=await page.locator('.reading-settings').boundingBox();check(r.x===0&&r.y===0&&r.width<width&&r.height<=height,label+' drawer is bounded at left edge');
  check(await page.locator('[data-parent-hold]').count()===1,label+' parent progress is in drawer');
  check(await page.locator('.child-nav a[href="/"]').count()===1,label+' story navigation is in drawer');
  await page.screenshot({path:'output/playwright/root-drawer-'+label+'.png'});
  await page.getByRole('button',{name:'完成設定',exact:true}).scrollIntoViewIfNeeded();check(await page.getByRole('button',{name:'完成設定',exact:true}).isVisible(),label+' drawer scroll reaches final control');await page.getByRole('button',{name:'完成設定',exact:true}).click();
  check(await page.locator('.preferences').getAttribute('open')===null,label+' done closes drawer');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' root has no horizontal overflow');
 }
 await page.locator('.preferences summary').click();await page.getByRole('button',{name:'注音：開',exact:true}).click();await page.getByRole('button',{name:'特大',exact:true}).click();await page.getByRole('button',{name:'詞語提示',exact:true}).click();await page.getByRole('button',{name:'慢慢讀',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(1000);
 check(writes.length>0&&writes.every(key=>key==='reading:settings'),'root saves shared preferences without writing book progress');check(documents['kiki:whisper'].state.chapter===3&&documents['super-ya:whisper'].state.chapter===2,'root preference changes preserve both reading locations');
 await page.locator('.book-card[href="?book=kiki"]').click();await page.locator('#book-title').waitFor();
 check(await page.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'story keeps phonetics turned off at root');check(await page.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','story inherits root font setting');check(await page.locator('[data-action="words"]').getAttribute('aria-pressed')==='false','story inherits root vocabulary setting');check(await page.locator('[data-rate="0.6"]').getAttribute('aria-pressed')==='true','story inherits root speech rate');
 await page.locator('.child-nav a[href="/"]').first().click();await page.locator('.bookshelf').waitFor();check(await page.locator('.preferences summary').isVisible(),'returning to root preserves tool entry');check(errors.length===0,'root settings flow has no uncaught errors');await context.close();return {passed:checks.length,checks};
}
