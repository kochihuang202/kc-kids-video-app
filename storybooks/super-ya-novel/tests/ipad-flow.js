async sessionPage=>{
 const c=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180},isMobile:true,hasTouch:true,deviceScaleFactor:2}),page=await c.newPage(),checks=[];
 await c.route('**/api/**',r=>r.abort());const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await page.goto('http://127.0.0.1:4178/?book=kiki');await page.locator('.mode-card').first().waitFor();
 for(const [width,height,name]of [[820,1180,'portrait'],[1180,820,'landscape']]){await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'touch cover has no overflow '+name);await page.screenshot({path:'output/playwright/ipad-webkit-cover-'+name+'.png',fullPage:true});}
 await page.locator('.mode-card a[href$="mode=whisper"]').tap();await page.locator('.resume-panel').waitFor();
 await page.screenshot({path:'output/playwright/ipad-webkit-zhuyin.png'});
 await page.locator('main .toc-list button').first().tap();await page.locator('.prose').waitFor();
 check(await page.locator('.prose h-zhuyin').count()>100,'touch opens annotated complete manuscript');
 await page.locator('.preferences summary').tap();await page.locator('[data-size="2"]').tap();await page.locator('[data-action="close-settings"]').last().tap();check(await page.locator('.prose').evaluate(el=>getComputedStyle(el).fontSize)==='34px','touch changes font size');
 await page.locator('.mode-toc-link').tap();await page.locator('main .toc-list').waitFor();check(true,'touch returns to own chapter contents');
 await page.locator('.child-nav a[aria-label="回到封面"]').tap();await page.locator('.mode-card a[href*="scene="]').tap();await page.locator('.practice-paper').waitFor();await page.locator('[data-p="begin"]').tap();await page.waitForTimeout(650);
 check(await page.locator('.question-title').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.child-header').getBoundingClientRect().bottom+4),'begin practice keeps the whole question below the fixed header');
 await page.locator('[data-p="reveal"]').tap();check(await page.locator('.answer-choice.correct .answer-state').count()===1,'touch practice explanation leaves answer readable');
 await page.screenshot({path:'output/playwright/ipad-webkit-answer.png'});await c.close();return {passed:checks.length,checks};
}
