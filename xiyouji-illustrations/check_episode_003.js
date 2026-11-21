async page => {
  await page.goto('https://xiyouji-kids.pages.dev/episodes/003');
  await page.setViewportSize({width: 390, height: 844});
  for (const word of ['一丈', '斤', '龍婆', '定海神珍鐵', '灌醉', '擺布']) {
    await page.locator('[data-word="' + word + '"]').first().click();
    const modal = page.locator('#vocabModal');
    if (!await modal.isVisible()) throw new Error('Missing card: ' + word);
    const definition = modal.locator('#modalWordDef');
    if (!await definition.textContent()) throw new Error('Missing definition: ' + word);
    if (await definition.locator('details, .ep003-word-example').count()) {
      throw new Error('Glossary should use the original plain format');
    }
    await modal.locator('.modal-close').click();
  }
  const headings = await page.locator('h2.section-heading').count();
  const pictures = await page.locator('h2.section-heading + figure img').count();
  if (headings !== 7 || pictures !== 7) throw new Error('Section or picture count changed');
  await page.locator('.interaction-discovery summary').first().click();
  if (await page.locator('.interaction-discovery').first().getAttribute('open') === null) {
    throw new Error('Story answer did not reveal');
  }
  return {headings, pictures, checkedCards: 6};
}
