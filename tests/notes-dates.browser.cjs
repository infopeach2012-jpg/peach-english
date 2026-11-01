// Run with Playwright and a local server on port 8005.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    if (process.env.PEACH_TEST_ASSETS) {
      await context.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/tailwind.js',contentType:'text/javascript'}));
      await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
    }
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.PEACH_BASE_URL||'http://127.0.0.1:8005/')+'#notes');
    await page.waitForSelector('#notes-date');
    assert.equal(await page.locator('#notes-date').inputValue(),'2026-10-29');
    assert.equal(await page.locator('#notes-order').inputValue(),'newest');
    assert.equal(await page.locator('.note-entry').count(),46);
    const values=()=>page.locator('#notes-date option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(v=>v!=='all'));
    const dates=await values();
    assert.equal(dates.length,39);assert.equal(dates[0],'2026-10-29');assert.equal(dates.at(-1),'2025-06-04');
    assert(dates.indexOf('2025-12-12')<dates.indexOf('2025-09-01'),'Sort by date, not unpadded date text');
    assert(!dates.includes('2026-10-30'),'The import date is not a learning date');
    await page.locator('#notes-date').selectOption('2025-06-04');
    assert.equal(await page.locator('.note-entry').count(),31);
    assert(await page.locator('.note-entry').evaluateAll(nodes=>nodes.every(n=>n.dataset.noteDate==='2025-06-04')));
    await page.locator('#notes-date').selectOption('all');
    assert.equal(await page.locator('#notes-count').textContent(),'1170件');
    assert.equal(await page.locator('.note-entry').first().getAttribute('data-note-date'),'2026-10-29');
    await page.locator('#notes-order').selectOption('oldest');
    assert.equal((await values())[0],'2025-06-04');
    assert.equal(await page.locator('.note-entry').first().getAttribute('data-note-date'),'2025-06-04');
    await page.locator('#notes-more').click();
    assert.equal(await page.locator('.note-entry').count(),120);
    const rendered=await page.locator('.note-entry').evaluateAll(nodes=>nodes.map(n=>n.dataset.noteDate));
    assert.deepEqual(rendered,[...rendered].sort());
    // The same date order must reach listening, including entries beyond page one.
    await page.locator('#notes-listen').click();
    await page.waitForSelector('#dr-close');
    const queue=await page.evaluate(()=>App.drill.items.map(i=>i.lessonDate));
    assert.equal(queue.length,1170);assert.deepEqual(queue,[...queue].sort());
    await page.locator('#dr-close').click();
    assert.equal(await page.locator('#notes-order').inputValue(),'oldest');
    await page.locator('#notes-date').selectOption('2026-10-29');
    await page.locator('#notes-q').fill('custody');
    await page.locator('#notes-order').selectOption('newest');
    assert.equal(await page.locator('#notes-q').inputValue(),'custody');
    assert.equal(await page.locator('.note-entry').count(),2);
    await page.locator('#notes-date').selectOption('2025-06-04');
    assert.equal(await page.locator('.note-entry').count(),0);assert(await page.locator('#notes-listen').isDisabled());
    await page.locator('#notes-q').fill('');
    await page.locator('#notes-order').selectOption('oldest');
    await page.reload();await page.waitForSelector('#notes-date');
    assert.equal(await page.locator('#notes-date').inputValue(),'2025-06-04');
    assert.equal(await page.locator('#notes-order').inputValue(),'oldest');
    assert.equal(await page.locator('.note-entry').count(),31);
    for (const width of [320,390,768,1024]) {
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
      assert(await page.locator('#notes-date').isVisible());assert(await page.locator('#notes-order').isVisible());
    }
    await page.setViewportSize({width:390,height:844});
    if(process.env.PEACH_SCREENSHOTS)await page.screenshot({path:process.env.PEACH_SCREENSHOTS+'/notes-dates-mobile.png'});
    // Later lessons may reuse a recorded expression. Keep both learning dates,
    // merge duplicate same-day references, and never invent unknown dates.
    await page.evaluate(()=>{
      Store.content.noteBatches.push({id:'future-test',lesson_date:'2026-11-02',added_on:'2026-11-09',items:[{key:'n1',section:'Review'},{key:'n1',section:'Review'}]});
      Store.content.noteBatches.push({id:'unknown-test',lesson_date:null,added_on:'2026-11-10',items:[{key:'n2',section:'Unknown date'}]});
      App.navigate('notes');
    });
    await page.locator('#notes-date').selectOption('2026-11-02');
    assert.equal(await page.locator('.note-entry').count(),1);
    assert.equal(await page.locator('.note-entry').first().getAttribute('data-note-key'),'n1');
    await page.locator('#notes-date').selectOption('2025-09-01');
    assert.equal(await page.locator('[data-note-key="n1"]').count(),1);
    assert(!(await values()).includes('2026-11-09'));assert(!(await values()).includes('2026-11-10'));
    assert.equal((await values()).at(-1),'unknown');
    await page.locator('#notes-order').selectOption('newest');assert.equal((await values()).at(-1),'unknown');
    await page.locator('#notes-date').selectOption('unknown');assert.equal(await page.locator('.note-entry').count(),1);
    assert.equal(await page.locator('.notes-batch-info h2').textContent(),'学習日未記録のノート');
    assert.deepEqual(errors,[]);
    console.log('PASS: 39 learning dates, chronological sorting, date/search filters, pagination, matching playback order, saved choices, mobile layout, reused notes and unknown dates.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
