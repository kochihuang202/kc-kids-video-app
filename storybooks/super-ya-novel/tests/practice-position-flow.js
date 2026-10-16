async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:820,height:1180}}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',r=>r.abort());const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await page.goto('http://127.0.0.1:4178/?book=kiki&mode=practice&scene=1');await page.locator('.practice-paper').waitFor();
 await page.locator('#practice-para-1').evaluate(el=>scrollTo(0,scrollY+el.getBoundingClientRect().top-140));await page.waitForTimeout(300);
 // A short article may hit the page bottom before paragraph 4 reaches the top.
 // Verify the actual saved visible paragraph, rather than an unreachable scroll target.
 const block=await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-practice:kiki:v1')).anchors[1].block),selector='#practice-para-'+block;
 const before=await page.locator(selector).evaluate(el=>el.getBoundingClientRect().top);
 await page.locator('.preferences summary').click();await page.locator('[data-p=size][data-size="2"]').click();await page.waitForTimeout(250);await page.keyboard.press('Escape');
 check(Math.abs(await page.locator(selector).evaluate(el=>el.getBoundingClientRect().top)-before)<8,'practice font resize preserves visible paragraph');
 await page.locator('.preferences summary').click();await page.locator('[data-p=bopo]').click();await page.waitForTimeout(250);await page.keyboard.press('Escape');
 check(Math.abs(await page.locator(selector).evaluate(el=>el.getBoundingClientRect().top)-before)<8,'practice phonetic toggle preserves visible paragraph');
 await page.waitForTimeout(300);const anchor=await page.evaluate(()=>JSON.parse(localStorage.getItem('shimajiro-practice:kiki:v1')).anchors[1]);
 await page.reload();await page.locator('.practice-paper').waitFor();await page.waitForTimeout(300);
 check(Math.abs(await page.locator('#practice-para-'+anchor.block).evaluate(el=>el.getBoundingClientRect().top)-76-anchor.offset)<8,'practice reload restores paragraph anchor');
 await context.close();return {passed:checks.length,checks};
}

