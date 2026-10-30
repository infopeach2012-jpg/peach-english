// Start a local HTTP server on port 8003. Requires Playwright/Chromium.
// PEACH_BASE_URL and PEACH_TEST_ASSETS can override the server and offline CDN fixtures.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1024,height:1366},serviceWorkers:'block',reducedMotion:'reduce'});
 if(process.env.PEACH_TEST_ASSETS){
  await context.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/tailwind.js',contentType:'text/javascript'}));
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
 }
 await context.addInitScript(()=>{window.testMedia=[];const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){if(!testMedia.includes(this))testMedia.push(this);return play.apply(this,args);};});
 const p=await context.newPage(),errors=[],bad=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('127.0.0.1')&&r.status()>=400)bad.push(r.status()+' '+r.url());});
 const base=process.env.PEACH_BASE_URL||'http://127.0.0.1:8003/';
 await p.goto(base+'#home');await p.locator('.notes-home').click();await p.waitForSelector('#notes-batch');
 const imported=await p.evaluate(()=>Store.content.noteBatches[0]);assert.equal(imported.items.length,46);
 assert.equal(await p.locator('.note-entry').count(),46);assert.equal(await p.locator('#notes-count').textContent(),'46件');
 assert.equal(await p.locator('[data-top="notes"]').getAttribute('aria-current'),'page');
 assert.equal(await p.locator('#global-speed').inputValue(),'0.75');
 const missing=await p.evaluate(()=>Store.content.noteBatches[0].items.filter(i=>!Store.resolveKey(i.key)||!['','@gentle','@slow','@fast','@faster'].every(s=>Speech.hasClip(i.key+s))));assert.deepEqual(missing,[]);
 for(const width of [320,390,768,1024,1440]){
  await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'notes overflow at '+width);
  assert(await p.locator('#hdr-home').isVisible());
 }
 await p.setViewportSize({width:1024,height:1366});
 if(process.env.PEACH_SCREENSHOTS)await p.screenshot({path:process.env.PEACH_SCREENSHOTS+'/notes-tablet.png',fullPage:false});
 await p.locator('#notes-q').fill('custody');assert.equal(await p.locator('.note-entry').count(),2);
 const key=await p.locator('[data-note-play]').first().getAttribute('data-note-play');
 for(const [rate,suffix] of [['0.6','_gentle'],['0.75','_slow'],['1',''],['1.25','_fast'],['1.5','_faster']]){
  await p.locator('#global-speed').selectOption(rate);await p.locator('[data-note-play]').first().click();
  await p.waitForFunction(([key,suffix])=>testMedia.some(a=>a.src.endsWith('/'+key+suffix+'.mp3')&&!a.paused&&a.currentTime>0),[key,suffix]);
  assert.equal(await p.evaluate(()=>testMedia.find(a=>!a.paused).playbackRate),1);
 }
 await p.locator('#notes-q').fill('remember');assert.equal(await p.locator('.note-entry').count(),2);
 await p.locator('#notes-listen').click();await p.waitForSelector('#dr-close');
 assert.equal(await p.evaluate(()=>App.drill.items.length),2);assert.equal(await p.locator('#dr-rate').inputValue(),'1.5');
 await p.waitForFunction(()=>testMedia.some(a=>a.src.includes('/n1161_faster.mp3')&&!a.paused));
 await p.locator('#dr-close').click();await p.waitForSelector('#notes-q');assert.equal(await p.locator('#notes-q').inputValue(),'remember');assert(await p.evaluate(()=>testMedia.every(a=>a.paused)));
 await p.locator('#notes-practice').click();assert.equal(await p.evaluate(()=>App.drill.mode),'speak');await p.locator('#dr-close').click();
 await p.locator('#notes-q').fill('存在しない表現000');assert(await p.locator('#notes-listen').isDisabled());assert.equal(await p.locator('.note-entry').count(),0);
 await p.locator('#notes-batch').selectOption('all');assert.equal(await p.locator('.note-entry').count(),60);await p.locator('#notes-more').click();assert.equal(await p.locator('.note-entry').count(),120);
 await p.locator('#notes-q').fill('bankruptcy');assert(await p.locator('.note-entry').count()>0);
 await p.locator('#hdr-home').click();await p.goBack();await p.waitForSelector('#view-notes.active');
 await p.reload();await p.waitForSelector('#view-notes.active #notes-batch');assert.equal(await p.locator('.note-entry').count(),46);
 // The same imported note is available from the existing dictionary and note flashcards.
 await p.evaluate(()=>App.navigate('dict'));await p.locator('#dict-q').fill('custody');await p.waitForTimeout(300);assert.equal(await p.locator('#dict-list .dict-say').count(),2);
 for(const route of ['home','practice','listen','notes']){
  await p.evaluate(route=>App.navigate(route),route);
  for(const width of [320,390,768,1024]){
   await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' overflow at '+width);
  }
 }
 await p.evaluate(()=>App.navigate('home'));assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log('PASS: 46 notes/230 audio variants; latest batch and archive; search, five actual playback speeds, listen/speak practice, return/reload, dictionary, responsive navigation; no JS or local asset errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
