// Run from the repo root with a local HTTP server on port 8002 and Playwright installed.
// PEACH_BASE_URL overrides the server; PEACH_TEST_ASSETS optionally provides offline CDN fixtures.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1024,height:1366},serviceWorkers:'block',reducedMotion:'reduce'});
 if(process.env.PEACH_TEST_ASSETS){
   await context.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/tailwind.js',contentType:'text/javascript'}));
   await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
 }
 await context.addInitScript(()=>{
   window.audit={calls:[],media:[],plays:0};const play=HTMLMediaElement.prototype.play;
   HTMLMediaElement.prototype.play=function(...args){audit.plays++;if(!audit.media.includes(this))audit.media.push(this);return play.apply(this,args);};
 });
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto((process.env.PEACH_BASE_URL||'http://127.0.0.1:8002/')+'#speaking');await p.waitForFunction(()=>window.Store?.content.phrases.length&&document.querySelector('#global-speed').options.length===5);
 assert.equal(await p.locator('#global-speed').inputValue(),'0.75');
 // Same short sentence, five actual rendered MP3 variants; browser playbackRate stays at one.
 for(const [rate,suffix] of [['0.6','_gentle'],['0.75','_slow'],['1',''],['1.25','_fast'],['1.5','_faster']]){
   await p.locator('#global-speed').selectOption(rate);
   await p.evaluate(()=>{Speech.speak(Store.content.phrases[0].en,{key:'p1'});});
   await p.waitForFunction(s=>audit.media.some(a=>a.src.endsWith('/p1'+s+'.mp3')&&!a.paused),suffix);
   assert.equal(await p.evaluate(()=>audit.media[0].playbackRate),1);
 }
 await p.locator('#global-speed').selectOption('0.6');await p.reload();await p.waitForSelector('#spk-play');
 assert.equal(await p.locator('#global-speed').inputValue(),'0.6');
 await p.evaluate(()=>{const speak=Speech.speak;Speech.speak=function(text,opts){audit.calls.push({text,rate:Speech.getRate(),opts});return speak(text,opts);};});
 const missing=await p.evaluate(()=>{
   const split=t=>(t.match(/[^.!?]+[.!?]*/g)||[t]).map(s=>s.trim()).filter(Boolean);
   const texts=[...Store.content.phrases.map(x=>x.en),...Store.content.notes.map(x=>x.en),...Store.content.dialogues.flatMap(x=>[x.a,x.b]),...Store.content.reading.flatMap(x=>split(x.en)),...Store.content.speeches.flatMap(x=>split(x.en))];
   return texts.filter(t=>t&&!Speech.hasClip(Speech.clipKeyFor(t)));
 });assert.deepEqual(missing,[],'All source text played by the practice views must resolve to MP3 audio');
 // All views share the persisted choice; local selectors are available in their actual sessions.
 await p.evaluate(()=>App.navigate('freetalk'));assert.equal(await p.locator('#ft-rate').inputValue(),'0.6');
 await p.locator('[data-sc="chat"]').click();assert.equal(await p.locator('#ft-rate').inputValue(),'0.6');
 await p.locator('#ft-rate').selectOption('0.75');await p.waitForFunction(()=>audit.media.some(a=>a.src.includes('ft_chat_slow.mp3')&&!a.paused));
 await p.evaluate(()=>App.navigate('patterns'));await p.locator('[data-course="feel"]').click();assert.equal(await p.locator('#pt-rate').inputValue(),'0.75');
 await p.locator('#pt-rate').selectOption('0.6');await p.waitForFunction(()=>audit.media.some(a=>a.src.includes('pt_feel_1_gentle.mp3')&&!a.paused));
 for(const width of [320,390,768,1024]){
   await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'pattern width '+width);
   const b=await p.locator('#pt-rate').boundingBox();assert(b.x>=0&&b.x+b.width<=width);
 }
 await p.setViewportSize({width:1024,height:1366});await p.evaluate(()=>App.navigate('listen'));assert.equal(await p.locator('#ls-speed').inputValue(),'0.6');
 await p.evaluate(()=>{App.drill={title:'Speed test',mode:'listen',items:[{key:'p1',en:Store.content.phrases[0].en,ja:''},{key:'p2',en:Store.content.phrases[1].en,ja:''}]};App.navigate('drill');});
 assert.equal(await p.locator('#dr-rate').inputValue(),'0.6');await p.locator('#dr-rate').selectOption('0.75');await p.waitForFunction(()=>audit.media.some(a=>a.src.endsWith('/p1_slow.mp3')&&!a.paused));
 await p.evaluate(()=>App.navigate('home'));assert.equal(await p.locator('#global-speed').inputValue(),'0.75');
 // Leaving a long-text loop must cancel the remaining sentences, including resolved await continuations.
 await p.evaluate(()=>App.navigate('shadow'));await p.locator('#sh-playall').click();await p.waitForFunction(()=>audit.media.some(a=>!a.paused));
 await p.locator('#hdr-home').click();let count=await p.evaluate(()=>audit.calls.length);await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>audit.calls.length),count);assert(await p.evaluate(()=>audit.media.every(a=>a.paused)));
 // Leaving before a lesson's delayed autoplay fires must never start it on Home.
 await p.evaluate(()=>App.navigate('lesson'));count=await p.evaluate(()=>audit.calls.length);
 await p.evaluate(()=>{document.querySelector('#lesson-start').click();App.navigate('home');});await p.waitForTimeout(400);assert.equal(await p.evaluate(()=>audit.calls.length),count);
 // Cancelling the example in a recorded-voice comparison must not start the user's recording later.
 await p.evaluate(async()=>{
   const buf=await(await fetch('audio/clips/p1.mp3')).arrayBuffer();const url=URL.createObjectURL(new Blob([buf],{type:'audio/mpeg'}));
   Speech.recordSupported=true;Speech.startRecording=async()=>({done:Promise.resolve(url),stop(){}});App.navigate('speaking');
 });
 await p.locator('#spk-rec').click();await p.waitForSelector('#spk-myvoice:not(.hidden-x)');
 await p.locator('#spk-myvoice').click();await p.locator('#hdr-home').click();count=await p.evaluate(()=>audit.plays);await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>audit.plays),count);assert(await p.evaluate(()=>audit.media.every(a=>a.paused)));
 await p.evaluate(()=>{
   window.translationCalls=[];
   Speech.speak=(text,opts)=>{translationCalls.push(opts?.lang||'en');return Promise.resolve();};
   DrillView.settings.ja=true;
   App.drill={title:'Cancellation',mode:'listen',items:[{key:'p1',en:'Hello',ja:'こんにちは'}]};
   App.navigate('drill');setTimeout(()=>App.navigate('home'),30);
 });await p.waitForTimeout(300);assert.deepEqual(await p.evaluate(()=>translationCalls),['en']);
 assert.deepEqual(errors,[]);console.log('PASS: five rendered speeds; default/persistence/shared selectors; all practice text resolves to recordings; live speed changes; responsive session controls; shadow/lesson/comparison cancellation.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
