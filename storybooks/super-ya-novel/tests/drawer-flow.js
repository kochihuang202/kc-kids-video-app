async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',route=>route.abort());
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 await page.goto('http://127.0.0.1:4178/?book=kiki');await page.locator('.mode-card').first().waitFor();
 await page.locator('.preferences summary').click();
 check(await page.locator('.drawer-nav,.drawer-progress').count()===0,'settings excludes the retired tools/progress/navigation sections');
 const r=await page.locator('.reading-settings').boundingBox();check(r.x===0,'drawer opens from left edge');
 await page.getByRole('button',{name:'注音：開',exact:true}).click();await page.getByRole('button',{name:'特大',exact:true}).click();
 await page.keyboard.press('Escape');await page.locator('.mode-card a[href$="mode=practice"]').click();await page.locator('.scene-card').first().waitFor();
 check(await page.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'annotation stays off across reading modes');
 check(await page.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','font size is shared across modes');
 await page.reload();await page.locator('.scene-card').first().waitFor();check(await page.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'annotation stays off after reload');
 await page.goto('http://127.0.0.1:4178/?book=super-ya');await page.locator('.mode-card').first().waitFor();check(await page.locator('body').evaluate(el=>el.classList.contains('no-bopo')),'annotation stays off in another episode');
 await page.locator('.preferences summary').click();check(await page.locator('[data-parent-hold]').count()===1,'parents progress lives in drawer');
 await page.locator('.drawer-backdrop').click({position:{x:365,y:150}});check(await page.locator('.preferences').getAttribute('open')===null,'backdrop closes drawer');
 for(const [width,height]of [[390,844],[820,1180],[1180,820]]){await page.setViewportSize({width,height});await page.locator('.preferences summary').click();const box=await page.locator('.reading-settings').boundingBox();check(box.x===0&&box.y===0&&box.width<width&&box.height<=height,'drawer fits '+width+'x'+height);await page.screenshot({path:'output/playwright/drawer-'+width+'.png'});await page.keyboard.press('Escape');}
 await context.close();return {passed:checks.length,checks};
}
