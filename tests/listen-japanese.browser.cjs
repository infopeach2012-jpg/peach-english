// PEACH_BASE_URL: locally served app. Japanese TTS is simulated; English uses real MP3s.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const installJapaneseTts = require('./helpers/japanese-tts.cjs');
const base = process.env.PEACH_BASE_URL || 'http://127.0.0.1:8015/';
const normalized = text => text.replace(/\s+/g, '');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(installJapaneseTts);
    await context.addInitScript(() => {
      if (!localStorage.getItem('test.ja.seeded')) {
        localStorage.setItem('test.ja.seeded', 'yes');
        localStorage.setItem('speak.listen.v3', JSON.stringify({ playbackRevision: 1, ja: false, tab: 'phrase', sit: 'shop', kind: 'sentence', repeat: 1, pattern: 'std', auto: false, gap: 0.25 }));
        localStorage.setItem('speak.drill.v1', JSON.stringify({ ja: false, gap: 0.25, muted: true }));
        localStorage.setItem('speak.progress.v1', JSON.stringify({ xp: 120, favorites: { p492: true } }));
      }
      window.audit = { calls: [], events: [], media: [] };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        if (!audit.media.includes(this)) {
          audit.media.push(this);
          this.addEventListener('ended', () => audit.events.push('ended:' + this.src.split('/').pop()));
        }
        audit.events.push('play:' + this.src.split('/').pop());
        return play.apply(this, args);
      };
    });
    if (process.env.PEACH_TEST_ASSETS) {
      await context.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ path: process.env.PEACH_TEST_ASSETS + '/tailwind.js', contentType: 'text/javascript' }));
      await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: process.env.PEACH_TEST_ASSETS + '/chart.js', contentType: 'text/javascript' }));
    }
    const page = await context.newPage(), errors = [], bad = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) bad.push(r.url()); });
    await page.goto(base + '#home');
    await page.waitForSelector('.launch-hero');
    const settings = await page.evaluate(() => ({ listen: JSON.parse(localStorage.getItem('speak.listen.v3')), drill: JSON.parse(localStorage.getItem('speak.drill.v1')), progress: Store.progress }));
    assert.equal(settings.listen.ja, true); assert.equal(settings.drill.ja, true);
    assert.equal(settings.listen.auto, false); assert.equal(settings.listen.gap, 0.25);
    assert.equal(settings.drill.muted, true); assert.equal(settings.drill.gap, 0.25);
    assert.equal(settings.progress.xp, 120); assert.equal(settings.progress.favorites.p492, true);
    await page.evaluate(() => {
      japaneseTts.automatic = false;
      const speak = Speech.speak;
      Speech.speak = (text, opts = {}) => {
        audit.calls.push({ text, opts }); audit.events.push((opts.lang || 'en') + ':' + text);
        return speak(text, opts);
      };
      Store.content.phrases = [492, 523].map(id => ({ ...Store.content.phrases.find(p => p.id === id), sit: 'shop' }));
      Store.content.dialogues = [];
    });
    // Wait for the actual English MP3 to end before Japanese; don't advance early.
    await page.locator('[data-top="listen"]').click(); await page.locator('#ls-play').click();
    await page.waitForFunction(() => japaneseTts.pending?.lang === 'ja-JP');
    assert.deepEqual(await page.evaluate(() => audit.calls.map(c => c.opts.lang || 'en')), ['en', 'ja']);
    const events = await page.evaluate(() => audit.events);
    assert(events.indexOf('ended:p492_slow.mp3') < events.findIndex(e => e.startsWith('ja:')));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#ls-pos').textContent(), '1 / 2');
    assert(await page.evaluate(() => audit.media.every(a => a.paused)));
    await page.locator('#ls-play').click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => japaneseTts.pending), null);
    assert.equal(await page.evaluate(() => audit.calls.length), 2);
    // Resume, skip during Japanese, then leave during Japanese: no stale continuation.
    await page.locator('#ls-play').click(); await page.waitForFunction(() => japaneseTts.pending);
    await page.locator('#ls-next').click(); await page.waitForFunction(() => japaneseTts.pending);
    assert.equal(await page.locator('#ls-pos').textContent(), '2 / 2');
    await page.locator('#hdr-home').click();
    const count = await page.evaluate(() => audit.calls.length);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => audit.calls.length), count);
    assert.equal(await page.evaluate(() => japaneseTts.pending), null);
    // An explicit English-only choice after migration survives a reload.
    await page.locator('[data-top="listen"]').click();
    await page.locator('.listen-options summary').click();
    await page.locator('[data-set="ja"][data-val="false"]').click();
    await page.reload(); await page.waitForSelector('#ls-play');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('speak.listen.v3')).ja), false);
    // Notes listen uses the same English → Japanese order and waits before completion.
    await page.locator('[data-top="notes"]').click();
    await page.locator('#notes-date').selectOption('unknown');
    await page.locator('#notes-q').fill('11月8日追加');
    assert.equal(await page.locator('.note-entry').count(), 1);
    await page.locator('#notes-listen').click();
    assert.equal(await page.locator('#dr-status').textContent(), '音声オフ');
    await page.evaluate(() => { japaneseTts.automatic = false; });
    await page.locator('#dr-play').click();
    await page.waitForFunction(() => japaneseTts.pending);
    const utterance = await page.evaluate(() => ({ text: japaneseTts.pending.text, lang: japaneseTts.pending.lang, voice: japaneseTts.pending.voice.name }));
    assert.deepEqual(utterance, { text: '私はAIシステムを使います。', lang: 'ja-JP', voice: 'Kyoko' });
    assert.equal(await page.locator('.sp-done').count(), 0);
    await page.evaluate(() => japaneseTts.finish()); await page.waitForSelector('.sp-done');
    assert.equal(await page.locator('.sp-done h2').textContent(), '1 文を聞きました');
    // Switching off during Japanese cancels it, and persists after reloading.
    await page.locator('#dr-redo').click(); await page.waitForFunction(() => japaneseTts.pending);
    await page.locator('#dr-ja-toggle').click();
    assert.equal(await page.evaluate(() => japaneseTts.pending), null);
    const starts = await page.evaluate(() => japaneseTts.events.filter(e => e.event === 'start').length);
    await page.waitForSelector('.sp-done');
    assert.equal(await page.evaluate(() => japaneseTts.events.filter(e => e.event === 'start').length), starts);
    await page.locator('#dr-close').click(); await page.reload(); await page.waitForSelector('#notes-date');
    assert.equal(await page.evaluate(() => DrillView.settings.ja), false);
    // Speaking practice stays English-only even when listening translations are on.
    await page.locator('#notes-q').fill('11月8日追加');
    await page.evaluate(() => { DrillView.settings.ja = true; japaneseTts.events = []; });
    await page.locator('#notes-practice').click();
    await page.waitForFunction(() => audit.events.includes('ended:n1316_slow.mp3'));
    assert.equal(await page.evaluate(() => japaneseTts.events.filter(e => e.event === 'start').length), 0);
    await page.locator('#dr-close').click();
    // Check every long-text chapter quickly with controlled speech completion.
    // All English still maps to its original recording; all source Japanese is read.
    await page.locator('[data-top="listen"]').click();
    await page.locator('.listen-options summary').click();
    await page.locator('[data-set="ja"][data-val="true"]').click();
    await page.locator('[data-tab="text"]').click();
    await page.locator('#ls-gap').selectOption('0');
    const mats = await page.evaluate(() => {
      const mats = Store.content.reading.map(r => ({ key: 'r' + r.id, en: r.en, ja: r.ja }));
      const groups = {};
      Store.content.speeches.forEach(s => {
        if (!groups[s.section]) { groups[s.section] = { key: 's' + s.id, en: '', ja: '' }; mats.push(groups[s.section]); }
        groups[s.section].en += ' ' + s.en; groups[s.section].ja += s.ja;
      });
      return mats;
    });
    for (const mat of mats) {
      await page.locator(`[data-mat="${mat.key}"]`).click();
      await page.evaluate(ja => {
        window.chapterCalls = []; window.releaseChapter = null;
        Speech.speak = (text, opts = {}) => {
          chapterCalls.push({ text, opts });
          const spoken = chapterCalls.filter(c => c.opts.lang === 'ja').map(c => c.text).join('').replace(/\s+/g, '');
          if (opts.lang === 'ja' && spoken === ja.replace(/\s+/g, '')) return new Promise(r => { releaseChapter = r; });
          return Promise.resolve();
        };
      }, mat.ja);
      await page.locator('#ls-play').click(); await page.waitForFunction(() => releaseChapter !== null);
      const calls = await page.evaluate(() => chapterCalls);
      const english = calls.filter(c => c.opts.lang !== 'ja');
      const japanese = calls.filter(c => c.opts.lang === 'ja');
      assert.equal(normalized(english.map(c => c.text).join(' ')), normalized(mat.en));
      assert.equal(normalized(japanese.map(c => c.text).join('')), normalized(mat.ja));
      assert.deepEqual(english.map(c => c.opts.key), english.map((_, i) => mat.key + '_' + i));
      assert(await page.evaluate(keys => keys.every(k => Speech.hasClip(k)), english.map(c => c.opts.key)));
      if (mat.key.startsWith('r') || mat.key === 's7') {
        assert.deepEqual(calls.map(c => c.opts.lang || 'en'), english.flatMap(() => ['en', 'ja']));
      }
      if (mat.key === 's1') {
        const paragraphTranslation = calls.findIndex(c => c.opts.lang === 'ja' && c.text.startsWith('第三に'));
        assert.equal(calls[paragraphTranslation - 1].opts.key, 's1_16');
        assert(await page.locator('#ls-translation-note').isVisible());
      }
      await page.locator('#ls-play').click(); await page.evaluate(() => releaseChapter());
    }
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow: ' + width);
    }
    await page.locator('#hdr-home').click();
    assert.deepEqual(errors, []); assert.deepEqual(bad, []);
    // Fresh browsers also receive the bilingual default.
    await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('.launch-hero');
    // The seeded context simulates a legacy user; remove the seed script via a fresh context.
    const fresh = await browser.newContext({ serviceWorkers: 'block' });
    const freshPage = await fresh.newPage();
    await freshPage.goto(base + '#home'); await freshPage.waitForSelector('.launch-hero');
    assert(await freshPage.evaluate(() => JSON.parse(localStorage.getItem('speak.listen.v3')).ja && DrillView.settings.ja));
    await fresh.close();
    console.log('PASS: existing/fresh bilingual defaults; real English MP3 before Japanese; pause/skip/leave/toggle cancellation; note completion and speaking mode; all 14 long-text chapters with correct translation boundaries; preference persistence and 320–1024px layout. Japanese voice is simulated.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
