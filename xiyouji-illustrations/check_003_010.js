async page => {
  const origin = 'https://xiyouji-kids.pages.dev';
  const results = [];
  const first = Number(new URL(page.url()).searchParams.get('first') || 3);
  const last = Number(new URL(page.url()).searchParams.get('last') || 10);
  for (let episode = first; episode <= last; episode++) {
    const id = String(episode).padStart(3, '0');
    const response = await page.goto(origin + '/episodes/' + id);
    if (!response?.ok()) throw new Error('Could not open episode ' + id);
    const figures = await page.evaluate(async () => {
      const headings = [...document.querySelectorAll('h2.section-heading')];
      return await Promise.all(headings.map(async (heading, index) => {
        const figure = heading.nextElementSibling;
        if (figure?.dataset.sectionIllustration !== String(index + 1)) return false;
        const image = figure.querySelector('img');
        if (!image?.alt) return false;
        image.loading = 'eager';
        await image.decode();
        const bounds = image.getBoundingClientRect();
        return bounds.width > 0 && bounds.left >= -1 &&
          bounds.right <= document.documentElement.clientWidth + 1;
      }));
    });
    const expected = episode === 54 ? 3 : 7;
    if (figures.length !== expected || figures.some(valid => !valid)) {
      throw new Error('Section illustration check failed in episode ' + id);
    }
    results.push(id);
  }
  return results;
}
