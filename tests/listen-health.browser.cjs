// The health category remains reachable from saved long-text/word filters.
// Recovery practice uses the four existing phrases and real bilingual MP3s.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.PEACH_BASE_URL || 'http://127.0.0.1:8021/';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    if (process.env.PEACH_TEST_ASSETS) {
      await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: process.env.PEACH_TEST_ASSETS + '/chart.js', contentType: 'text/javascript' }));
    }
    await context.addInitScript(() => {
      if (!localStorage.getItem('test.health.seeded')) {
        localStorage.setItem('test.health.seeded', 'yes');
        localStorage.setItem('speak.listen.v3', JSON.stringify({ tab: 'text', sit: 'work', kind: 'word', ja: true, auto: false, gap: 0, repeat: 1, pattern: 'std', playbackRevision: 1, translationRevision: 1, timingRevision: 1 }));
        localStorage.setItem('speak.playbackRate.v1', '0.75');
        localStorage.setItem('speak.progress.v1', JSON.stringify({ xp: 120, favorites: { p1555: true } }));
      }
      window.nativeCalls = 0;
      Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], speak() { nativeCalls++; }, cancel() {}, resume() {} } });
      window.audit = { media: [], ends: [], starts: [] };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (!audit.media.includes(this)) {
          audit.media.push(this);
          this.addEventListener('ended', () => audit.ends.push(this.src), { capture: true });
        }
        audit.starts.push(this.src);
        return play.apply(this, args);
      };
    });
    const page = await context.newPage(), errors = [], bad = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) bad.push(r.url()); });
    await page.goto(base + '#listen'); await page.waitForSelector('#ls-health');
    assert.equal(await page.locator('#ls-situation').count(), 0);
    assert(await page.locator('#ls-health').isVisible());
    await page.locator('#ls-health').click();
    assert.equal(await page.locator('#ls-situation').inputValue(), 'health');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('speak.listen.v3')).kind), 'all');
    const keys = ['p1555', 'p1520', 'p1524', 'p1525'];
    const expected = await page.evaluate(keys => keys.flatMap(key => {
      const item = Store.resolveKey(key);
      if (!document.querySelector('#ls-list').textContent.includes(item.en)) throw new Error('Missing recovery phrase: ' + key);
      return [key + '_slow.mp3', Speech.japaneseClipFor(item.ja).split('/').pop() + '.mp3'];
    }), keys);
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.locator('#ls-health').isVisible());
      assert(await page.locator('#ls-recovery-play').isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (process.env.PEACH_TEST_ASSETS) await page.screenshot({ path: process.env.PEACH_TEST_ASSETS + '/listen-health-v56.png' });
    await page.locator('#ls-recovery-play').click();
    assert.deepEqual(await page.evaluate(() => App.drill.items.map(i => i.key)), keys);
    assert.equal(await page.locator('#dr-en').textContent(), "I'm on the mend.");
    await page.waitForSelector('.sp-done', { timeout: 90000 });
    assert.equal(await page.locator('.sp-done h2').textContent(), '4 文を聞きました');
    assert.deepEqual(await page.evaluate(() => audit.ends.map(src => src.split('/').pop())), expected);
    assert.equal(await page.evaluate(() => nativeCalls), 0);
    // Pause during Japanese and leave without starting another sentence.
    await page.locator('#dr-redo').click();
    await page.waitForFunction(() => audit.media.some(a => a.src.includes('/audio/ja/') && !a.paused && a.currentTime > .4));
    await page.locator('#dr-play').click();
    const pausedCount = await page.evaluate(() => audit.starts.length);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => audit.starts.length), pausedCount);
    await page.locator('#dr-close').click();
    assert.equal(await page.locator('#ls-situation').inputValue(), 'health');
    // A category link overrides a saved text/word selection, not playback prefs.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('speak.listen.v3'));
      Object.assign(s, { tab: 'text', sit: 'work', kind: 'word', ja: false, repeat: 2, gap: .25 });
      localStorage.setItem('speak.listen.v3', JSON.stringify(s));
    });
    await page.goto(base + '?v=56&listen=health#listen'); await page.waitForSelector('#ls-situation');
    assert.equal(await page.locator('#ls-situation').inputValue(), 'health');
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('speak.listen.v3')));
    assert.equal(settings.tab, 'phrase'); assert.equal(settings.kind, 'all');
    assert.equal(settings.ja, false); assert.equal(settings.repeat, 2); assert.equal(settings.gap, .25);
    assert.equal(await page.evaluate(() => Speech.getRate()), .75);
    assert.equal(await page.evaluate(() => Store.progress.favorites.p1555), true);
    assert(!new URL(page.url()).searchParams.has('listen'));
    // Subsequent category choices survive reload and ordinary navigation.
    await page.locator('#ls-situation').selectOption('shop'); await page.reload(); await page.waitForSelector('#ls-situation');
    assert.equal(await page.locator('#ls-situation').inputValue(), 'shop');
    await page.locator('[data-kind="word"]').click(); await page.locator('#ls-health').click();
    assert(await page.locator('#ls-list').textContent().then(s => s.includes("I'm on the mend.")));
    await page.locator('#hdr-home').click(); await page.locator('[data-top="listen"]').click();
    assert.equal(await page.locator('#ls-situation').inputValue(), 'health');
    assert.deepEqual(errors, []); assert.deepEqual(bad, []);
    console.log('PASS: health shortcut from long texts and words; direct category link; four real English/Japanese pairs; pause/return; category persistence, existing preferences/progress, and 320–1024px layout.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
