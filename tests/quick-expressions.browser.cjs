// Requires Playwright/Chromium and the app served locally on port 8004.
// PEACH_BASE_URL and PEACH_TEST_ASSETS override the server and optional CDN fixtures.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  if (process.env.PEACH_TEST_ASSETS) {
    await context.route('https://cdn.tailwindcss.com/**', r => r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/tailwind.js',contentType:'text/javascript'}));
    await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
  }
  await context.addInitScript(() => {
    window.audit = {media:[],ends:[],plays:0};
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (!audit.media.includes(this)) {
        audit.media.push(this);
        this.addEventListener('ended', () => audit.ends.push(this.src));
      }
      audit.plays++; return play.apply(this,args);
    };
  });
  const p = await context.newPage(), errors = [], bad = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('response', r => { if (r.url().includes('/audio/') && r.status() >= 400) bad.push(r.url()); });
  await p.goto((process.env.PEACH_BASE_URL || 'http://127.0.0.1:8004/')+'#practice');
  await p.waitForSelector('[data-quick="sentence"]');
  // Bound the duration using ten actual recorded sentences. The real selection,
  // media engine, ended events, 0.4-second gap, and controls remain unmodified.
  await p.evaluate(() => {
    const ids = [492, 523, 530, 534, 535, 537, 542, 543, 633, 639];
    const sentences = Store.content.phrases.filter(p => ids.includes(p.id));
    if (sentences.length !== 10 || sentences.some(p => p.kind !== 'sentence')) throw new Error('Invalid real-audio fixture');
    Store.content.phrases = sentences.concat(Store.content.phrases.filter(p => p.kind === 'word').slice(0,10));
  });
  await p.locator('[data-quick="sentence"]').click();
  assert.equal(await p.evaluate(() => App.drill.mode), 'listen');
  assert.equal(await p.evaluate(() => App.drill.items.length), 10);
  assert.equal(await p.locator('#dr-go').count(), 0);
  assert.equal(await p.locator('#dr-rate').inputValue(), '0.75');
  await p.waitForFunction(() => audit.media.some(a => a.src.endsWith('_slow.mp3') && !a.paused && a.currentTime > 0));
  const first = await p.locator('#dr-en').textContent();
  await p.locator('#dr-again').click(); await p.waitForTimeout(700);
  assert.equal(await p.locator('#dr-en').textContent(), first, 'Replay must cancel the old loop before its gap advances the item');
  await p.locator('#dr-play').click(); await p.waitForTimeout(1100);
  assert.equal(await p.locator('#dr-en').textContent(), first);
  assert(await p.evaluate(() => audit.media.every(a => a.paused)));
  assert.equal(await p.locator('#dr-status').textContent(), '一時停止');
  await p.locator('#dr-play').click(); await p.waitForFunction(() => audit.media.some(a => !a.paused));
  await p.locator('#dr-mute').click(); await p.waitForTimeout(1100);
  assert.equal(await p.locator('#dr-en').textContent(), first);
  assert(await p.evaluate(() => audit.media.every(a => a.paused)));
  assert.equal(await p.locator('#dr-status').textContent(), '音声オフ');
  await p.locator('#dr-close').click(); await p.locator('[data-quick="sentence"]').click();
  const mutedText = await p.locator('#dr-en').textContent(); await p.waitForTimeout(900);
  assert.equal(await p.locator('#dr-en').textContent(), mutedText, 'Persisted mute must not silently skip the lesson');
  await p.locator('#dr-play').click(); await p.locator('#dr-rate').selectOption('1.5');
  await p.waitForFunction(() => audit.media.some(a => a.src.endsWith('_faster.mp3') && !a.paused));
  await p.waitForFunction(t => document.querySelector('#dr-en').textContent !== t, mutedText);
  assert.equal(await p.locator('#dr-status').textContent(), '自動再生');
  await p.locator('#hdr-home').click(); const plays = await p.evaluate(() => audit.plays); await p.waitForTimeout(700);
  assert.equal(await p.evaluate(() => audit.plays), plays); assert(await p.evaluate(() => audit.media.every(a => a.paused)));
  // Finish the entire session without pressing Next or replay controls.
  await p.locator('[data-top="practice"]').click(); await p.evaluate(() => { audit.ends = []; });
  await p.locator('[data-quick="sentence"]').click();
  await p.waitForSelector('.sp-done', {timeout:60000});
  assert.equal(await p.locator('.sp-done h2').textContent(), '10 文を聞きました');
  assert.equal(await p.evaluate(() => audit.ends.length), 10);
  assert.equal(await p.evaluate(() => new Set(audit.ends).size), 10);
  assert(await p.evaluate(() => audit.media.every(a => a.paused)));
  await p.locator('#dr-back').click(); await p.locator('[data-quick="word"]').click();
  assert.equal(await p.evaluate(() => App.drill.mode), 'speak'); assert(await p.locator('#dr-go').isVisible());
  for (const width of [320,390,768,1024]) {
    await p.setViewportSize({width,height:1000}); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await p.locator('#hdr-home').click(); assert.deepEqual(errors, []); assert.deepEqual(bad, []);
  console.log('PASS: Expressions autoplay at the selected speed and advance through 10 real MP3s; replay cancellation, pause/resume, mute/restart, speed changes, exit, completion and mobile layout.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
