// All source families remain searchable, including original batch wording and OCR.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.PEACH_BASE_URL || 'http://127.0.0.1:8022/';
const catalog = JSON.parse(fs.readFileSync('data/catalog.json'));
(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
    if (process.env.PEACH_TEST_ASSETS) await ctx.route('https://cdn.jsdelivr.net/**', r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
    await ctx.addInitScript(() => {
      window.nativeCalls=0; window.ends=[]; window.media=[];
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],speak(){nativeCalls++;},cancel(){},resume(){}}});
      const play=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(...args){if(!media.includes(this)){media.push(this);this.addEventListener('ended',()=>ends.push(this.src),{capture:true});}return play.apply(this,args);};
    });
    const page=await ctx.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    // A failed catalog request is recoverable instead of appearing as an empty list.
    let first=true;
    await page.route('**/data/catalog.json',route=>{if(first){first=false;return route.fulfill({status:503,body:'retry'});}return route.continue();});
    await page.goto(base+'#dict');await page.locator('#dict-retry').click();await page.waitForSelector('#dict-kind');
    assert.equal(await page.locator('#dict-count').textContent(), '3,970件 / 全3,970記録');
    // Enumerate every page of every source family: no records dropped or repeated.
    for(const kind of Object.keys(catalog.labels)){
      await page.locator('#dict-kind').selectOption(kind);
      let pages=0;
      while(await page.locator('#dict-more').isVisible()) { assert(++pages<=Math.ceil(catalog.items.length/60),'pagination must end'); await page.locator('#dict-more').click(); }
      const actual=await page.locator('[data-catalog-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.catalogId));
      assert.deepEqual(actual,catalog.items.filter(x=>x.kind===kind).map(x=>x.id),kind);
      if(['ocr','legacy','documents'].includes(kind))assert.equal(await page.locator('[data-say]').count(),0);
    }
    await page.locator('#dict-kind').selectOption('all');
    for(const term of ['declining','reducing','decreasing','caffeine','精神','11月12日追加','Haven’t you','How long will it take to recover?']){
      await page.locator('#dict-q').fill(term);
      const norm=s=>String(s||'').normalize('NFKC').replace(/’/g,"'").toLowerCase();
      const expected=catalog.items.filter(r=>norm([r.en,r.ja,r.note,r.tags,r.section,r.sourceLabel,r.date,r.added_on,r.id].join(' ')).includes(norm(term)));
      assert.equal(await page.locator('#dict-count').textContent(),`${expected.length.toLocaleString()}件 / 全3,970記録`);
    }
    await page.locator('#dict-recovery').click();
    assert.deepEqual(await page.locator('[data-catalog-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.catalogId)),['p1520','p1524','p1525','p1555']);
    await page.locator('[data-say="p1555"]').click();
    await page.waitForFunction(()=>ends.some(x=>x.endsWith('/p1555_slow.mp3')));
    await page.locator('[data-ja="p1555"]').click();
    await page.waitForFunction(()=>ends.some(x=>x.includes('/audio/ja/')));
    await page.locator('[data-catalog-id="p1555"] [data-star]').click();
    assert(await page.evaluate(()=>Store.isFavorite('p1555')));
    await page.locator('#dict-q').fill('');await page.locator('#dict-kind').selectOption('patterns');
    await page.evaluate(()=>{ends=[];});await page.locator('[data-ja="pt_feel_1"]').click();
    await page.waitForFunction(()=>ends.some(x=>x.includes('/audio/ja/')));
    await page.locator('#dict-recovery').click();
    await page.reload();await page.waitForSelector('#dict-kind');
    assert.equal(await page.locator('[data-catalog-id]').count(),4);
    assert(await page.evaluate(()=>Store.isFavorite('p1555')));
    // Long text uses existing sentence clips in order and stops when leaving.
    await page.locator('#dict-q').fill('');await page.locator('#dict-kind').selectOption('reading');
    await page.evaluate(()=>{ends=[];Speech.setRate(1.5);});
    await page.locator('[data-say="r1"]').click();
    await page.waitForFunction(()=>ends.length>=2,{},{timeout:30000});
    assert.deepEqual((await page.evaluate(()=>ends)).slice(0,2).map(x=>x.split('/').pop()),['r1_0_faster.mp3','r1_1_faster.mp3']);
    await page.locator('#dict-home').click();assert(await page.evaluate(()=>media.every(a=>a.paused)));
    await page.locator('[data-go="dict"]').click();await page.waitForSelector('#dict-kind');
    for(const width of [320,390,768,1024]){
      await page.setViewportSize({width,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
    }
    await page.locator('#dict-recovery').click();await page.setViewportSize({width:390,height:844});
    if(process.env.PEACH_TEST_ASSETS)await page.screenshot({path:process.env.PEACH_TEST_ASSETS+'/catalog-v57.png',fullPage:true});
    assert.equal(await page.evaluate(()=>nativeCalls),0);assert.deepEqual(errors,[]);
    // Repeated submissions with unknown dates must not overwrite older notes.
    await page.goto(base+'?batch=2026-11-12-01#notes');await page.waitForSelector('#notes-batch');
    assert.equal(await page.locator('.note-entry').count(),30);
    await page.locator('#notes-batch').selectOption('2026-11-09-01');
    await page.locator('#notes-q').fill('Sure thing!');assert.equal(await page.locator('.note-entry').count(),1);
    await page.locator('#notes-batch').selectOption('2026-11-12-01');
    await page.locator('#notes-q').fill('Sure thing!');assert.equal(await page.locator('.note-entry').count(),1);
    await page.locator('#notes-batch').selectOption('all');await page.locator('#notes-q').fill('Sure thing!');
    assert((await page.locator('.note-entry').count())>=2);
    await page.locator('#hdr-home').click();await page.locator('[data-go="notes"]').click();
    assert.equal(await page.locator('#notes-batch').inputValue(),'2026-11-12-01');
    assert.equal(await page.locator('.note-entry').count(),30);
    await page.reload();await page.waitForSelector('#notes-batch');
    assert.equal(await page.locator('#notes-batch').inputValue(),'2026-11-12-01');
    assert.equal(await page.locator('.note-entry').count(),30);
    console.log('PASS: all 3,970 records paginated; every source family; OCR separated; corrections searchable; recovery links; real bilingual and long-text audio; stop/leave; preserved favorites; 320–1024px layout; repeated submissions and latest notes.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
