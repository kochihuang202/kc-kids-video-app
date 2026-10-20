async(page)=>{
  const results=[];
  for(const [id,count]of [['tata',28],['karate',32]]){
    await page.goto('https://shimajiro-reading-trial.ji3cp31p4.workers.dev/?book='+id+'&mode=whisper&preview=1');
    await page.locator('.contents-page .toc-list').waitFor();
    const actual=await page.locator('.contents-page .toc-list li').count();
    if(actual!==count)throw Error(id+' chapter count '+actual);
    await page.locator('.toc-list button').first().click();
    await page.locator('.prose').waitFor();
    if(!await page.locator('.source-block').count())throw Error(id+' missing text');
    results.push({id,chapters:actual,firstPieceOpened:true});
  }
  return results;
}
