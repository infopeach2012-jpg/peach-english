// Test an existing user's stored repeat/study settings, using actual MP3 playback.
// Serve the app on port 8005; PEACH_BASE_URL and PEACH_TEST_ASSETS are optional.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const installJapaneseTts = require('./helpers/japanese-tts.cjs');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    await context.addInitScript(installJapaneseTts);
    if (process.env.PEACH_TEST_ASSETS) {
      await context.route('https://cdn.tailwindcss.com/**', r => r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/tailwind.js',contentType:'text/javascript'}));
      await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
    }
    await context.addInitScript(() => {
      if (!localStorage.getItem('test.restore.seeded')) {
        localStorage.setItem('speak.listen.v3', JSON.stringify({tab:'phrase',sit:'shop',kind:'sentence',matKey:'r2',repeat:3,pattern:'study',ja:true,auto:false,gap:1}));
        localStorage.setItem('speak.playbackRate.v1','0.75');
        localStorage.setItem('speak.progress.v1', JSON.stringify({xp:120,favorites:{p492:true},srs:{p492:{reps:3}}}));
        localStorage.setItem('test.restore.seeded','yes');
      }
      window.audit = {media:[],ends:[],starts:[],calls:[]};
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(...args) {
        if (!audit.media.includes(this)) {
          audit.media.push(this);
          this.addEventListener('ended', () => audit.ends.push(this.src));
        }
        audit.starts.push(this.src);
        return play.apply(this,args);
      };
    });
    const page = await context.newPage(), errors=[], failedAudio=[];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if(r.url().includes('/audio/') && r.status()>=400) failedAudio.push(r.url()); });
    await page.goto((process.env.PEACH_BASE_URL || 'http://127.0.0.1:8005/')+'#home');
    await page.waitForSelector('.launch-hero');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('speak.listen.v3')));
    assert.equal(saved.repeat,1,'Old stored repeat must be restored to one playback');
    assert.equal(saved.pattern,'std','Old study mode must no longer repeat the same sentence');
    assert.equal(saved.ja,true); assert.equal(saved.translationRevision,1); assert.equal(saved.auto,true); assert.equal(saved.gap,0.1);
    assert.equal(saved.sit,'shop'); assert.equal(saved.kind,'sentence'); assert.equal(saved.matKey,'r2');
    assert.equal(await page.evaluate(() => Speech.getRate()),0.75);
    const progress = await page.evaluate(() => Store.progress);
    assert.equal(progress.xp,120); assert.equal(progress.favorites.p492,true); assert.equal(progress.srs.p492.reps,3);
    await page.evaluate(() => {
      Store.content.phrases=[492,523,530,534].map(id=>({...Store.content.phrases.find(p=>p.id===id),sit:'shop'}));
      Store.content.dialogues=[];
      const speak=Speech.speak;
      Speech.speak=(text,opts)=>{audit.calls.push({text,opts});return speak(text,opts);};
    });
    await page.locator('[data-top="listen"]').click();
    await page.waitForFunction(() => audit.ends.length>=3,{},{timeout:45000});
    await page.waitForFunction(() => audit.starts.length>=4);
    await page.locator('#ls-play').click();
    const audit = await page.evaluate(() => ({ends:audit.ends,starts:audit.starts,calls:audit.calls}));
    assert.deepEqual(audit.ends.map(s=>s.split('/').pop()),['p492_slow.mp3','p523_slow.mp3','p530_slow.mp3']);
    assert.deepEqual(audit.starts.map(s=>s.split('/').pop()),['p492_slow.mp3','p523_slow.mp3','p530_slow.mp3','p534_slow.mp3']);
    assert.equal(audit.calls.length,7);
    assert.deepEqual(audit.calls.map(c=>c.opts.lang||'en'),['en','ja','en','ja','en','ja','en']);
    assert(audit.calls.every(c=>!c.opts.slow));
    const japanese = await page.evaluate(() => japaneseTts.events.filter(e=>e.event==='start'));
    assert.deepEqual(japanese.map(e=>e.text),audit.calls.filter(c=>c.opts.lang==='ja').map(c=>c.text));
    assert(japanese.every(e=>e.lang==='ja-JP'&&e.voice==='Kyoko'));
    assert.equal(await page.locator('#ls-pos').textContent(),'4 / 4');
    assert.equal(await page.locator('[data-listen-language]').count(),0,'Keep the original player layout');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => audit.starts.length),4);
    // The restoration is one-time. Subsequent explicit preferences still save.
    await page.locator('.listen-options summary').click();
    await page.locator('[data-set="repeat"][data-val="2"]').click();
    await page.reload(); await page.waitForSelector('#ls-play');
    const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('speak.listen.v3')));
    assert.equal(afterReload.repeat,2); assert.equal(afterReload.pattern,'std');
    await page.locator('.listen-options summary').click();
    await page.locator('[data-set="repeat"][data-val="1"]').click();
    await page.locator('#hdr-home').click();
    assert.deepEqual(errors,[]); assert.deepEqual(failedAudio,[]);
    console.log('PASS: legacy settings restored once with Japanese enabled; three real MP3s alternate with Japanese TTS; pause, speed, category, progress and later preferences preserved.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
