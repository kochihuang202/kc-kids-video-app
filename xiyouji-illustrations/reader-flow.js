async page => {
  const base = new URL(page.url()).hostname === 'xiyouji-kids.pages.dev'
    ? 'https://xiyouji-kids.pages.dev'
    : 'http://127.0.0.1:8767';
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  for (const episode of ['001', '002']) {
    await page.goto(`${base}/episodes/${episode}.html`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Preserve the maintained reader regression flow: annotation toggle, text size, and vocabulary dialog.
    const display = () => page.locator('rt').first().evaluate(el => getComputedStyle(el).display);
    assert(await display() !== 'none', `${episode}: initial zhuyin hidden`);
    await page.locator('#btnZhuyinToggle').click();
    assert(await display() === 'none', `${episode}: zhuyin toggle off failed`);
    await page.locator('#btnZhuyinToggle').click();
    assert(await display() !== 'none', `${episode}: zhuyin toggle on failed`);
    await page.locator('#btnFontLg').click();
    assert(await page.locator('body').getAttribute('data-font-size') === 'lg', `${episode}: font control failed`);
    await page.locator('#btnFontMd').click();
    await page.locator('.word-help').first().click();
    assert(await page.locator('#vocabModal').isVisible(), `${episode}: glossary did not open`);
    await page.locator('#vocabModal .modal-close').click();
    assert(!await page.locator('#vocabModal').isVisible(), `${episode}: glossary did not close`);
    const sections = await page.evaluate(() => Array.from(document.querySelectorAll('h2.section-heading')).map(h => {
      let images = [];
      for (let el = h.nextElementSibling; el && !el.matches('h2.section-heading'); el = el.nextElementSibling) {
        images.push(...el.querySelectorAll('img'));
      }
      return {heading: Array.from(h.querySelectorAll('rb')).map(el => el.textContent).join(''), images: images.map(el => el.getAttribute('src'))};
    }));
    assert(sections.length === 7, `${episode}: expected 7 story sections`);
    assert(sections.every(s => s.images.length === 1), `${episode}: each section needs exactly one illustration: ${JSON.stringify(sections)}`);
    for (const img of await page.locator('.story-picture img').all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate(el => el.decode());
      assert(await img.evaluate(el => el.naturalWidth > 0), `${episode}: broken image`);
    }
    for (const width of [1280, 390]) {
      await page.setViewportSize({width, height: 900});
      const overflow = await page.locator('.story-picture img').evaluateAll(imgs => imgs.some(img => {
        const r = img.getBoundingClientRect();
        return r.width <= 0 || r.left < -1 || r.right > window.innerWidth + 1;
      }));
      assert(!overflow, `${episode}: illustrations overflow at width ${width}`);
    }
    await page.setViewportSize({width: 1280, height: 900});
    await page.locator('.story-picture').first().scrollIntoViewIfNeeded();
    await page.screenshot({path: `output/playwright/xiyouji-${episode}-illustrated.png`});
    results.push({episode, sections: sections.length, decodedImages: await page.locator('.story-picture img').count(), controls: 'passed', desktop: 'passed', mobile: 'passed'});
  }
  return results;
}
