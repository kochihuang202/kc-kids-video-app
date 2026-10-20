async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[],requests=[];
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
 await page.goto('http://127.0.0.1:4179/?book=test-different-counts');await page.locator('.mode-card').first().waitFor();
 await page.locator('.mode-card a[href$="mode=practice"]').click();await page.locator('.scene-card').first().waitFor();check(await page.locator('.scene-card').count()===3,'practice has its own three units');
 await page.locator('.scene-card').nth(2).click();await page.locator('[data-p=begin]').click();await page.locator('.answer-choice').first().click();
 await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.whisper-mode .mode-primary').click();await page.locator('[data-action=start]').click();await page.locator('.prose').waitFor();
 check(new URL(page.url()).searchParams.get('chapter')==='0','longer practice cannot set whisper position');
 await page.locator('[data-action=next]').click();check(new URL(page.url()).searchParams.get('chapter')==='1','second whisper chapter available');
 await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.practice-mode .mode-primary').click();await page.locator('[data-p="resume"]').click();await page.locator('.practice-paper').waitFor();check(new URL(page.url()).searchParams.get('scene')==='2','practice independently resumes third unit');
 await page.locator('.preferences summary').click();await page.locator('[data-p=bopo]').click();await page.keyboard.press('Escape');await page.reload();await page.locator('.practice-paper').waitFor();check(await page.locator('body.no-bopo').count()===1,'draft settings survive refresh separately');
 check(requests.length===0,'preview never reads or writes official progress API');
 check(await page.evaluate(()=>localStorage.getItem('shimajiro-reading-preferences:v1')===null&&localStorage.getItem('draft:shimajiro-reading-preferences:v1')!==null),'draft preferences do not overwrite child preferences');
 await context.close();return {passed:checks.length,checks};
}
