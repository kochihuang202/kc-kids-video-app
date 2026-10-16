async(sessionPage)=>{
 const browser=sessionPage.context().browser(),context=await browser.newContext(),page=await context.newPage(),checks=[];const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await context.request.post('http://127.0.0.1:4178/api/progress/reading/settings',{data:{patch:{bopo:true,size:0,words:true,rate:0.85}}});
 await page.goto('http://127.0.0.1:4178/?book=kiki');await page.locator('.mode-card').first().waitFor();await page.locator('.preferences summary').click();
 await page.getByRole('button',{name:'注音：開',exact:true}).click();await page.getByRole('button',{name:'特大',exact:true}).click();await page.getByRole('button',{name:'慢慢讀',exact:true}).click();await page.keyboard.press('Escape');
 await page.locator('.mode-switch a[href*="mode=practice"]').click();await page.locator('.scene-card').first().waitFor();
 check(await page.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'immediate navigation keeps unsent annotation preference');
 await page.waitForFunction(async()=>{const s=(await(await fetch('/api/progress')).json()).documents['reading:settings']?.state;return s?.bopo===false&&s.size===2&&s.rate===0.6;});check(true,'shared settings reaches cloud');
 const fresh=await browser.newContext(),other=await fresh.newPage();await other.goto('http://127.0.0.1:4178/?book=super-ya&mode=practice');await other.locator('.scene-card').first().waitFor();
 check(await other.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'fresh device uses shared cloud preference rather than mode defaults');check(await other.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','fresh device restores shared font');check(await other.locator('[data-rate="0.6"]').getAttribute('aria-pressed')==='true','fresh device restores shared voice rate');
 await other.goto('http://127.0.0.1:4178/');await other.locator('.bookshelf').waitFor();check(await other.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'shelf respects shared phonetic setting');
 await other.goto('http://127.0.0.1:4178/?view=parent');await other.locator('.parent-book').first().waitFor();check(await other.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'parent page respects shared phonetic setting');
 const invalid=await context.request.post('http://127.0.0.1:4178/api/progress/reading/settings',{data:{patch:{chapter:1}}});check(invalid.status()===400,'settings API cannot change book progress');
 await fresh.close();
 const migration=await browser.newContext(),legacy=await migration.newPage();let passiveWrites=0;
 await migration.route('**/api/progress**',async route=>{if(route.request().method()==='POST'){passiveWrites++;await route.fulfill({json:{ok:true}});}else await route.fulfill({json:{documents:{'kiki:whisper':{state:{bopo:false,size:1},revision:1}}}});});
 await legacy.goto('http://127.0.0.1:4178/');await legacy.locator('.bookshelf').waitFor();await legacy.locator('.book-card[href="?book=kiki"]').click();await legacy.locator('.mode-switch').waitFor();
 check(await legacy.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'opening shelf first does not replace legacy cloud phonetics with defaults');
 await legacy.locator('.mode-switch a[href*="mode=practice"]').click();await legacy.locator('.scene-card').first().waitFor();await legacy.waitForTimeout(900);
 check(passiveWrites===0,'browsing mode entries does not write unchanged preferences or progress');
 await migration.close();await context.close();return {passed:checks.length,checks};
}
