async page => {
  await page.goto('https://xiyouji-kids.pages.dev/episodes/004');
  await page.setViewportSize({width: 390, height: 844});
  const glossary = await page.evaluate(() => Object.keys(window.GLOSSARY_DATA));
  for (const [word, expected] of [
    ['合力', '大家一起出力'],
    ['分毫未動', '連一點點也沒有動'],
    ['巍峨', '又高又大'],
    ['全包在我身上', '這件事由我來負責'],
    ['壽終正寢', '最後自然過世'],
    ['治罪', '按照規矩處罰'],
  ]) {
    await page.locator('[data-word="' + word + '"]').first().click();
    const modal = page.locator('#vocabModal');
    const definition = await modal.locator('#modalWordDef').evaluate(el =>
      [...el.querySelectorAll('rb')].map(base => base.textContent).join(''));
    if (!await modal.isVisible() || !definition.includes(expected)) throw new Error('Missing definition: ' + word);
    await modal.locator('.modal-close').click();
  }
  const images = await page.locator('h2.section-heading + figure img').all();
  if (images.length !== 7 || glossary.length < 160) throw new Error('Missing sections or glossary entries');
  for (const image of images) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(el => el.decode());
  }
  return {pictures: images.length, glossaryCount: glossary.length, checkedCards: 6};
}
