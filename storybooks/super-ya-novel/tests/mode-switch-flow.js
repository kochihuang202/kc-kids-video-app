async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:1180,height:820}}),page=await context.newPage(),checks=[];const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await page.goto('http://127.0.0.1:4178/?book=kiki&chapter=2');await page.locator('.prose').waitFor();
 check(await page.locator('.mode-switch .mode-card[aria-current="page"]').getAttribute('href')==='?book=kiki&chapter=2','whisper identifies current mode');
 await page.locator('.reader-header .practice-shortcut').click();await page.locator('.practice-paper').waitFor();
 check(new URL(page.url()).searchParams.get('scene')==='2','mode switch preserves the story scene');
 check(await page.locator('.scene-card').count()===0,'switch opens matching story directly');
 await page.getByRole('button',{name:'我讀好了，開始練習',exact:true}).click();
 const paper=await page.locator('.practice-paper').boundingBox(),questions=await page.locator('.practice-panel').boundingBox();
 check(questions.y>=paper.y+paper.height,'questions follow continuous story instead of side-by-side columns');
 check(paper.width<=850,'comprehension uses the storybook reading width');
 check(await page.locator('.mode-switch').isHidden(),'large mode cards stay out of the reading flow');check((await page.locator('.preferences summary').boundingBox()).width<=60,'reading tools use a compact button');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'output/playwright/mode-practice.png'});
 await page.locator('.reader-header .whisper-shortcut').click();await page.locator('.prose').waitFor();
 check(new URL(page.url()).searchParams.get('chapter')==='2','switch back preserves the same whisper chapter');
 await page.locator('.preferences summary').click();await page.keyboard.press('Tab');check(await page.locator('.reading-settings').evaluate(el=>el.contains(document.activeElement)),'keyboard enters drawer controls');
 await page.keyboard.press('Escape');check(await page.locator('.preferences summary').evaluate(el=>document.activeElement===el),'closing drawer restores trigger focus');
 await context.close();return {passed:checks.length,checks};
}
