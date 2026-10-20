async(sessionPage)=>{
 const context=await sessionPage.context().browser().newContext({viewport:{width:390,height:844}}),page=await context.newPage(),checks=[];
 await context.route('**/api/**',route=>route.abort());
 const check=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 for(const book of ['kiki','super-ya']){
  await page.goto('http://127.0.0.1:4178/');await page.evaluate(()=>localStorage.clear());
  await page.goto('http://127.0.0.1:4178/?book='+book);await page.locator('.mode-card').first().waitFor();
  check(await page.locator('.preferences summary').isVisible(),book+' entry shows fixed settings before reading');
  await page.locator('.preferences summary').click();await page.getByRole('button',{name:'注音：開',exact:true}).click();
  check(await page.locator('#book-title rt').first().isHidden(),book+' entry annotation setting works');
  await page.getByRole('button',{name:'特大',exact:true}).click();await page.getByRole('button',{name:'詞語提示',exact:true}).click();
  check(await page.locator('[data-action="words"]').getAttribute('aria-pressed')==='false',book+' entry word setting works');
  await page.getByRole('button',{name:'完成設定',exact:true}).click();await page.locator('.whisper-mode .mode-primary').click();await page.locator('[data-action="start"]').click();
  check(await page.locator('[data-size="2"]').getAttribute('aria-pressed')==='true',book+' reader inherits entry font choice');
  check(await page.locator('.prose [data-word]').count()===0,book+' reader inherits word choice');
  await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('#book-title').waitFor();check(await page.locator('.preferences summary').isVisible(),book+' settings survives return to cover');
 }
 await context.close();return {passed:checks.length,checks};
}

