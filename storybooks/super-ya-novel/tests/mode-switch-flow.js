async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:1180,height:820}}),page=await context.newPage(),checks=[];const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await context.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=2');await page.locator('.prose').waitFor();
 check(await page.locator('a[href*="mode=practice"]').count()===0,'whisper has no direct mode switch');
 await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.mode-card a[href*="scene="]').click();await page.locator('.practice-paper').waitFor();
 check(new URL(page.url()).searchParams.get('scene')==='0','practice starts at independent first unit');
 await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();
 const paper=await page.locator('.practice-paper').boundingBox(),questions=await page.locator('.practice-panel').boundingBox();
 check(questions.y>=paper.y+paper.height,'questions follow continuous story instead of side-by-side columns');
 check(paper.width<=850,'comprehension uses the storybook reading width');
 check(await page.locator('.mode-switch,.level-tabs').count()===0,'reader has no mode cards or legacy tabs');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/mode-practice.png'});
 await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('[data-action=start]').click();await page.locator('.prose').waitFor();
 check(new URL(page.url()).searchParams.get('chapter')==='2','whisper independently resumes its own chapter');
 await page.locator('.preferences summary').click();await page.keyboard.press('Tab');check(await page.locator('.reading-settings').evaluate(el=>el.contains(document.activeElement)),'keyboard enters drawer controls');
 await page.keyboard.press('Escape');check(await page.locator('.preferences summary').evaluate(el=>document.activeElement===el),'closing drawer restores trigger focus');
 await context.close();return {passed:checks.length,checks};
}
