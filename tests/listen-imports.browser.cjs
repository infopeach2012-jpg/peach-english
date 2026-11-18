// Every November 9–16 submission must be reachable through the existing
// situation dropdown, with stable keys and real prerecorded bilingual audio.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const base = process.env.PEACH_BASE_URL || 'http://127.0.0.1:8023/';
const ids = ['2026-11-09-01', '2026-11-10-01', '2026-11-12-01', '2026-11-16-01'];
const batches = read('data/note_batches.json').filter(b => ids.includes(b.id));
const submitted = batches.flatMap(b => b.items.map(i => i.key));
const keys = [...new Set(submitted)];
const situations = read('data/situations.json');
const originals = Object.fromEntries(['phrases', 'notes'].flatMap((file, i) => read(`data/${file}.json`).map(r => [(i ? 'n' : 'p') + r.id, r])));
const expectedCounts = { greet: 81, work: 188, food: 165, shop: 160, health: 86, travel: 109, home: 160, hobby: 177, study: 90, plan: 98, feel: 152, people: 132, tech: 69, grammar: 105 };
const classifiedNotes = Object.keys(situations).filter(k => k.startsWith('n'));
for (const key of classifiedNotes) expectedCounts[situations[key]]++;
const expectedTotal = 1772 + classifiedNotes.length;
assert.equal(submitted.length, 67); assert.equal(keys.length, 65);
const noteKeys = keys.filter(k => k.startsWith('n'));
assert.equal(noteKeys.length, 55);
const english = read('audio/audio_index.json');
const japanese = read('audio/ja_index.json').clips;
for (const key of keys) {
  assert(situations[key], 'Unclassified submission: ' + key);
  for (const suffix of ['', '@gentle', '@slow', '@fast', '@faster']) {
    const file = english[key + suffix];
    assert(file, 'Missing English: ' + key + suffix);
    assert(fs.statSync(path.join(root, 'audio', file + '.mp3')).size > 1000);
  }
  const file = japanese[originals[key].ja.toLowerCase().trim().replace(/\s+/g, ' ')];
  assert(file, 'Missing Japanese: ' + key);
  assert(fs.statSync(path.join(root, 'audio', file + '.mp3')).size > 1000);
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    if (process.env.PEACH_TEST_ASSETS) await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ path: process.env.PEACH_TEST_ASSETS + '/chart.js', contentType: 'text/javascript' }));
    await context.addInitScript(() => {
      if (!localStorage.getItem('test.imports.seeded')) {
        localStorage.setItem('test.imports.seeded', '1');
        localStorage.setItem('speak.listen.v3', JSON.stringify({ tab: 'phrase', sit: 'greet', kind: 'all', auto: false, ja: true, repeat: 1, gap: 0, pattern: 'std', playbackRevision: 1, translationRevision: 1, timingRevision: 1 }));
        localStorage.setItem('speak.playbackRate.v1', '0.75');
        localStorage.setItem('speak.progress.v1', JSON.stringify({ xp: 120, favorites: { n1353: true, p1555: true }, srs: { n1353: { reps: 3, due: '2026-11-25', ease: 2.5 } } }));
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
    await page.goto(base + '#listen'); await page.waitForSelector('#ls-situation');
    const progress = await page.evaluate(() => ({ favorites: Store.progress.favorites, srs: Store.progress.srs }));
    for (const [sit, count] of Object.entries(expectedCounts)) {
      await page.locator('#ls-situation').selectOption(sit);
      const rows = await page.locator('#ls-list .ls-row').evaluateAll(es => es.map(e => ({ key: e.dataset.key, text: e.textContent })));
      assert.equal(rows.length, count, sit);
      assert.equal(new Set(rows.map(r => r.key)).size, count);
      assert.equal(await page.locator(`#ls-situation option[value="${sit}"]`).textContent().then(t => Number(t.match(/(\d+)件/)[1])), count);
      for (const key of keys.filter(k => situations[k] === sit)) {
        const row = rows.find(r => r.key === key);
        assert(row, `Missing ${key} in ${sit}`);
        assert(row.text.includes(originals[key].en)); assert(row.text.includes(originals[key].ja));
      }
    }
    await page.locator('#ls-situation').selectOption('all');
    const all = await page.locator('#ls-list .ls-row').evaluateAll(es => es.map(e => e.dataset.key));
    assert.equal(all.length, expectedTotal);
    assert.deepEqual(all.filter(k => k.startsWith('n')).sort(), classifiedNotes.sort());
    for (const key of keys) assert.equal(all.filter(k => k === key).length, 1);
    // Existing phrases/dialogues retain their relative order and key identities.
    const existing = [...read('data/phrases.json').map(p => 'p' + p.id), ...read('data/dialogues.json').flatMap(d => ['d' + d.id + 'a', 'd' + d.id + 'b'])];
    assert.deepEqual(all.slice(0, 1772), existing);
    await page.locator('[data-kind="word"]').click();
    const words = await page.locator('#ls-list .ls-row').evaluateAll(es => es.map(e => e.dataset.key));
    assert(words.includes('n1339')); assert(words.includes('n1169')); assert(!words.includes('n1353'));
    await page.locator('[data-kind="sentence"]').click();
    const sentences = await page.locator('#ls-list .ls-row').evaluateAll(es => es.map(e => e.dataset.key));
    assert(sentences.includes('n1353')); assert(!sentences.includes('n1339'));
    assert.equal(words.length + sentences.length, all.length);
    await page.locator('[data-kind="all"]').click();
    console.log(`PASS: all 67 submissions / 65 stable IDs across 14 categories, ${expectedTotal} rows including later classified notes, existing queue order and word/sentence filters.`);
    // Listen via the actual row control, not a direct Speech call.
    for (const key of ['n1353', 'n1339', 'n1360']) {
      await page.locator('#ls-situation').selectOption(situations[key]);
      const expected = [english[key + '@slow'] + '.mp3', japanese[originals[key].ja.toLowerCase().trim().replace(/\s+/g, ' ')] + '.mp3'];
      await page.evaluate(() => { audit.ends = []; });
      await page.locator(`.ls-row[data-key="${key}"]`).click();
      await page.waitForFunction(() => audit.ends.length >= 2, { }, { timeout: 45000 });
      assert.deepEqual(await page.evaluate(() => audit.ends.slice(0, 2).map(s => s.split('/audio/')[1])), expected);
      if (await page.locator('#ls-play').getAttribute('aria-label') === '一時停止') await page.locator('#ls-play').click();
    }
    assert.equal(await page.evaluate(() => nativeCalls), 0);
    assert.equal(await page.evaluate(() => audit.media.length), 1);
    assert.deepEqual(await page.evaluate(() => ({ favorites: Store.progress.favorites, srs: Store.progress.srs })), progress);
    await page.locator('#ls-situation').selectOption('home'); await page.reload(); await page.waitForSelector('#ls-situation');
    assert.equal(await page.locator('#ls-situation').inputValue(), 'home');
    assert.equal(await page.evaluate(() => Speech.getRate()), .75);
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overflow at ' + width);
      assert(await page.locator('#ls-situation').isVisible());
    }
    if (process.env.PEACH_TEST_ASSETS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#ls-situation').selectOption('greet');
      await page.screenshot({ path: process.env.PEACH_TEST_ASSETS + '/listen-imports-v59.png' });
    }
    assert.deepEqual(errors, []); assert.deepEqual(bad, []);
    console.log('PASS: three real English/Japanese pairs, shared media, saved speed/category/favorites/SRS and 320–1024px layout; all 65 items have five English rates and Japanese clips.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
