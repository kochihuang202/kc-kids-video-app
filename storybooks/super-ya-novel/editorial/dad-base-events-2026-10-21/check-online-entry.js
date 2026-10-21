async(page)=>{
 const origin='https://shimajiro-reading-trial.ji3cp31p4.workers.dev',results=[];
 await page.goto(origin+'/?preview=1');await page.locator('.book-card').first().waitFor();
 if(await page.locator('.book-card').count()!==6)throw Error('Incomplete trial shelf');
 for(const [id,parts,units]of [['dad-shampoo',26,6],['secret-base',30,7]]){
  await page.goto(origin+'/?book='+id+'&preview=1');await page.locator('.mode-card').first().waitFor();
  await page.locator('.whisper-mode .mode-primary').click();await page.locator('.contents-page .toc-list').waitFor();
  if(await page.locator('.contents-page .toc-list li').count()!==parts)throw Error(id+' missing parts');
  await page.locator('.toc-list button').first().click();await page.locator('.prose').waitFor();
  await page.locator('.child-nav a[aria-label="回到封面"]').click();await page.locator('.practice-mode .mode-primary').click();await page.locator('.scene-card').first().waitFor();
  if(await page.locator('.scene-card').count()!==units)throw Error(id+' missing practice units');
  results.push({id,parts,units,bothModesOpen:true});
 }
 return results;
}
