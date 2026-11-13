const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.PEACH_BASE_URL || 'http://127.0.0.1:8022/';
const batch = JSON.parse(fs.readFileSync('data/note_batches.json')).find(b=>b.id==='2026-11-12-01');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    if(process.env.PEACH_TEST_ASSETS)await ctx.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
    await ctx.addInitScript(()=>{
      window.nativeCalls=0;window.ends=[];window.media=[];
      Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],speak(){nativeCalls++;},cancel(){},resume(){}}});
      const play=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(...args){if(!media.includes(this)){media.push(this);this.addEventListener('ended',()=>ends.push(this.src),{capture:true});}return play.apply(this,args);};
    });
    const page=await ctx.newPage(),errors=[],bad=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)bad.push(r.url());});
    await page.goto(base+'?batch=2026-11-12-01#notes');await page.waitForSelector('#notes-batch');
    assert.equal(await page.locator('#notes-count').textContent(),'30件');
    assert.equal(await page.locator('#notes-date').inputValue(),'all');
    assert.deepEqual(await page.locator('.note-entry').evaluateAll(nodes=>nodes.map(n=>n.dataset.noteKey)),batch.items.map(i=>i.key));
    for(const [rate,suffix] of [['0.6','_gentle'],['0.75','_slow'],['1',''],['1.25','_fast'],['1.5','_faster']]){
      await page.locator('#global-speed').selectOption(rate);await page.locator('[data-note-play="n1327"]').click();
      await page.waitForFunction(suffix=>media.some(a=>a.src.endsWith('/n1327'+suffix+'.mp3')&&!a.paused&&a.currentTime>0),suffix);
      assert.equal(await page.evaluate(()=>media.find(a=>!a.paused).playbackRate),1);
    }
    await page.evaluate(()=>{Speech.stopSpeaking();ends=[];});
    await page.locator('#notes-listen').click();
    await page.waitForSelector('.sp-done',{timeout:360000});
    const expected=await page.evaluate(items=>items.flatMap(i=>[i.key+'_faster.mp3',Speech.japaneseClipFor(i.ja).split('/').pop()+'.mp3']),batch.items);
    assert.deepEqual(await page.evaluate(()=>ends.map(src=>src.split('/').pop())),expected);
    assert.equal(await page.evaluate(()=>nativeCalls),0);
    await page.locator('#dr-back').click();
    await page.locator('#notes-q').fill('decreasing');assert.equal(await page.locator('.note-entry').count(),1);
    await page.locator('#notes-q').fill('reducing');assert.equal(await page.locator('.note-entry').count(),2);
    await page.locator('#notes-q').fill('');
    for(const width of [320,390,768,1024]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'notes overflow '+width);}
    await page.setViewportSize({width:390,height:844});
    if(process.env.PEACH_TEST_ASSETS)await page.screenshot({path:process.env.PEACH_TEST_ASSETS+'/notes-v57.png'});
    assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
    console.log('PASS: 30 submitted items; 60 ordered real English/Japanese clips; five English speeds; original correction attempts searchable; unknown learning dates; responsive notes.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
