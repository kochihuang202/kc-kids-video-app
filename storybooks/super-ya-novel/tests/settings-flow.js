async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage(),checks=[];
 const check=(v,m)=>{if(!v)throw new Error(m);checks.push(m);};
 await page.goto('http://127.0.0.1:4178/?book=kiki');await page.locator('[data-action="start"]').click();await page.waitForTimeout(250);
 check(await page.locator('.preferences').evaluate(el=>getComputedStyle(el).position==='fixed'),'one settings control is fixed to the viewport');
 check(await page.locator('.reader-header [data-action="bopo"],.reader-header [data-size]').count()===0,'settings are absent from the navigation bar');
 const before=await page.locator('.preferences summary').boundingBox();
 await page.locator('[data-block="12"]').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
 const after=await page.locator('.preferences summary').boundingBox();check(Math.abs(before.y-after.y)<2,'settings button stays in the same place after scrolling');
 await page.locator('.preferences summary').click();
 check(await page.locator('.preferences #bopo-toggle').isVisible(),'annotation setting is inside the panel');
 check(await page.locator('.preferences [data-size]').count()===3,'all font sizes are inside the panel');
 await page.getByRole('button',{name:'注音：開',exact:true}).click();check(await page.locator('.prose rt').first().isHidden(),'annotation switch still works');
 await page.getByRole('button',{name:'特大',exact:true}).click();check(await page.locator('[data-size="2"]').getAttribute('aria-pressed')==='true','font size works inside the panel');
 await page.keyboard.press('Escape');check(await page.locator('.preferences').getAttribute('open')===null,'Escape closes the panel');
 check(await page.locator('.preferences summary').evaluate(el=>document.activeElement===el),'Escape returns focus to the fixed settings button');
 for(const [width,height]of [[390,844],[820,1180],[1180,820]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(200);await page.locator('.preferences summary').click();
  const rect=await page.locator('.reading-settings').boundingBox();check(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=width&&rect.y+rect.height<=height,'panel remains within '+width+'x'+height);
  await page.screenshot({path:'output/playwright/settings-'+width+'.png'});
  await page.getByRole('button',{name:'完成設定',exact:true}).click();check(await page.locator('.preferences').getAttribute('open')===null,'done button closes settings at '+width+'x'+height);
 }
 await page.locator('.preferences summary').click();await page.locator('#chapter-title').click({force:true});check(await page.locator('.preferences').getAttribute('open')===null,'clicking outside closes settings');
 await context.close();return {passed:checks.length,checks};
}
