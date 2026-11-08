// Real English AND Japanese MP3s with an unavailable/hung speechSynthesis API.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.PEACH_BASE_URL || 'http://127.0.0.1:8017/';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    if (process.env.PEACH_TEST_ASSETS) {
      await context.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ path: process.env.PEACH_TEST_ASSETS + '/tailwind.js', contentType: 'text/javascript' }));
      await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: process.env.PEACH_TEST_ASSETS + '/chart.js', contentType: 'text/javascript' }));
    }
    await context.addInitScript(() => {
      // Reproduce the failure: no Japanese voices and speak never calls any event.
      window.nativeCalls = 0;
      Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], speak() { nativeCalls++; }, cancel() {}, resume() {} } });
      window.audit = { media: [], starts: [], ends: [] };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (!audit.media.includes(this)) {
          audit.media.push(this);
          this.addEventListener('ended', () => audit.ends.push(this.src));
        }
        audit.starts.push(this.src);
        return play.apply(this, args);
      };
      if (!localStorage.getItem('test.recorded.seeded')) {
        localStorage.setItem('test.recorded.seeded', 'yes');
        localStorage.setItem('speak.listen.v3', JSON.stringify({ playbackRevision: 1, translationRevision: 1, ja: true, repeat: 1, pattern: 'std', gap: .1, auto: false, sit: 'shop' }));
      }
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '#home'); await page.waitForSelector('.launch-hero');
    await page.evaluate(() => {
      Store.content.phrases = [492, 523, 530].map(id => ({ ...Store.content.phrases.find(p => p.id === id), sit: 'shop' }));
      Store.content.dialogues = [];
    });
    const expected = await page.evaluate(() => Store.content.phrases.flatMap(p => ['audio/clips/p' + p.id + '_slow.mp3', 'audio/' + Speech.japaneseClipFor(p.ja) + '.mp3']));
    assert(expected.every(p => !p.includes('null')));
    await page.locator('[data-top="listen"]').click(); await page.locator('#ls-play').click();
    await page.waitForFunction(() => audit.ends.length >= 6, {}, { timeout: 60000 });
    await page.locator('#ls-play').click();
    assert.deepEqual(await page.evaluate(() => audit.ends.slice(0, 6).map(s => s.split('/audio/')[1])), expected.map(s => s.slice(6)));
    assert.equal(await page.evaluate(() => nativeCalls), 0);
    assert.equal(await page.evaluate(() => audit.media.length), 1);
    // Pause while Japanese is actually audible; no next English starts afterwards.
    await page.locator('#ls-play').click();
    await page.waitForFunction(() => audit.media.some(a => a.src.includes('/audio/ja/') && !a.paused && a.currentTime > .05));
    await page.locator('#ls-play').click();
    const pausedCount = await page.evaluate(() => audit.starts.length);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => audit.starts.length), pausedCount);
    assert(await page.evaluate(() => audit.media.every(a => a.paused)));
    await page.locator('#hdr-home').click();
    // Notes finish only after the Japanese recording has ended.
    await page.locator('[data-top="notes"]').click();
    await page.locator('#notes-date').selectOption('unknown'); await page.locator('#notes-q').fill('11月8日追加');
    await page.evaluate(() => { audit.ends = []; audit.starts = []; });
    await page.locator('#notes-listen').click();
    await page.waitForFunction(() => audit.media.some(a => a.src.includes('/audio/ja/') && !a.paused && a.currentTime > .05));
    assert.equal(await page.locator('.sp-done').count(), 0);
    await page.waitForSelector('.sp-done', { timeout: 15000 });
    assert.equal(await page.evaluate(() => audit.ends.length), 2);
    assert.equal(await page.evaluate(() => nativeCalls), 0);
    // Leaving while Japanese plays cancels its continuation.
    await page.locator('#dr-redo').click();
    await page.waitForFunction(() => audit.media.some(a => a.src.includes('/audio/ja/') && !a.paused && a.currentTime > .05));
    await page.locator('#dr-close').click();
    const leftCount = await page.evaluate(() => audit.starts.length);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => audit.starts.length), leftCount);
    assert(await page.evaluate(() => audit.media.every(a => a.paused)));
    // A failed Japanese download pauses visibly, preserves the item, and can retry.
    await context.route('**/audio/ja/*.mp3', r => r.fulfill({ status: 503, body: 'test unavailable' }));
    await page.reload(); await page.waitForSelector('#notes-date'); await page.locator('#notes-q').fill('11月8日追加');
    await page.locator('#notes-listen').click();
    await page.waitForFunction(() => document.querySelector('#dr-status')?.textContent === '一時停止');
    assert.match(await page.locator('#toast').textContent(), /音声を再生できません/);
    assert.equal(await page.locator('#dr-en').textContent(), 'I use an AI system.');
    assert.equal(await page.evaluate(() => nativeCalls), 0);
    assert.equal(await page.locator('.sp-done').count(), 0);
    await context.unroute('**/audio/ja/*.mp3');
    await page.locator('#dr-play').click(); await page.waitForSelector('.sp-done', { timeout: 15000 });
    // Native fallback is bounded even if a new/missing translation has no file.
    await page.locator('#dr-close').click();
    const failed = await page.evaluate(() => Speech.speak('未収録のテスト用和訳', { lang: 'ja' }));
    assert.equal(failed, false);
    assert.equal(await page.evaluate(() => nativeCalls), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: real English/Japanese MP3 sequence with permanently silent native TTS; notes completion; pause/leave; failed media and retry; bounded missing-translation fallback.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
