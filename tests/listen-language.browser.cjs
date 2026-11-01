// Run against a local server on port 8005 with Playwright/Chromium installed.
// English uses real MP3s; the native Japanese speech engine is simulated so its
// completion/cancellation can be checked without depending on installed voices.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
 if(process.env.PEACH_TEST_ASSETS){
  await context.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/tailwind.js',contentType:'text/javascript'}));
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({path:process.env.PEACH_TEST_ASSETS+'/chart.js',contentType:'text/javascript'}));
 }
 await context.addInitScript(()=>{
  window.audit={events:[],media:[],japanese:[]};const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){
   if(!audit.media.includes(this)){audit.media.push(this);this.addEventListener('ended',()=>audit.events.push({type:'en-end',src:this.src}));}
   audit.events.push({type:'en-start',src:this.src});return play.apply(this,args);
  };
  window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  let timer=null;
  const synth={speaking:false,paused:false,getVoices:()=>[{name:'Samantha',lang:'en-US'},{name:'Kyoko',lang:'ja-JP'}],
   resume(){},cancel(){clearTimeout(timer);this.speaking=false;},
   speak(u){this.speaking=true;const entry={text:u.text,lang:u.lang,voice:u.voice?.name,mediaActive:audit.media.some(a=>!a.paused),position:document.querySelector('#ls-pos')?.textContent};
    audit.japanese.push(entry);audit.events.push({type:'ja-start',text:u.text});
    timer=setTimeout(()=>{this.speaking=false;audit.events.push({type:'ja-end',text:u.text});u.onend?.();},750);
   }
  };Object.defineProperty(window,'speechSynthesis',{value:synth});
 });
 const p=await context.newPage(),errors=[],bad=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/audio/')&&r.status()>=400)bad.push(r.url());});
 await p.goto((process.env.PEACH_BASE_URL||'http://127.0.0.1:8005/')+'#home');await p.waitForSelector('.launch-hero');
 await p.evaluate(()=>{Store.content.phrases=[492,523,530].map(id=>({...Store.content.phrases.find(x=>x.id===id),sit:'greet'}));Store.content.dialogues=[];});
 await p.locator('[data-top="listen"]').click();await p.waitForSelector('[data-listen-language="en"]');
 assert.equal(await p.locator('[data-listen-language="en"]').getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('[data-listen-language="en-ja"]').evaluate(el=>el.closest('details')===null),true);
 assert.equal(await p.locator('.listen-options').evaluate(el=>el.open),false);
 await p.waitForFunction(()=>audit.media.some(a=>a.src.endsWith('/p492_slow.mp3')&&!a.paused&&a.currentTime>0));
 await p.locator('.ls-row[data-i="1"]').click();
 await p.locator('[data-listen-language="en-ja"]').click();assert.equal(await p.locator('#ls-pos').textContent(),'2 / 3');
 await p.waitForFunction(()=>audit.japanese.length===1);
 let ja=await p.evaluate(()=>audit.japanese[0]);assert.equal(ja.text,"そのノートパソコンはいくらくらいしますか？");
 assert.equal(ja.lang,'ja-JP');assert.equal(ja.voice,'Kyoko');assert.equal(ja.mediaActive,false);assert.equal(ja.position,'2 / 3');
 await p.waitForFunction(()=>audit.media.some(a=>a.src.endsWith('/p530_slow.mp3')&&!a.paused));
 const events=await p.evaluate(()=>audit.events);const end=events.findIndex(e=>e.type==='en-end'&&e.src.endsWith('/p523_slow.mp3'));
 const jStart=events.findIndex(e=>e.type==='ja-start');const jEnd=events.findIndex(e=>e.type==='ja-end');const next=events.findIndex(e=>e.type==='en-start'&&e.src.endsWith('/p530_slow.mp3'));
 assert(end>=0&&end<jStart&&jStart<jEnd&&jEnd<next,'English must end before Japanese starts; next English must wait for Japanese to finish');
 // Switch while Japanese is active, keeping the current sentence and cancelling its old loop.
 await p.locator('.ls-row[data-i="1"]').click();await p.waitForFunction(()=>audit.japanese.length===2&&speechSynthesis.speaking);
 await p.locator('[data-listen-language="en"]').click();assert.equal(await p.locator('#ls-pos').textContent(),'2 / 3');
 assert.equal(await p.evaluate(()=>speechSynthesis.speaking),false);
 await p.waitForFunction(()=>audit.media.some(a=>a.src.endsWith('/p530_slow.mp3')&&!a.paused));
 assert.equal(await p.evaluate(()=>audit.japanese.length),2,'English-only mode must omit Japanese');
 await p.locator('#ls-play').click();const paused=await p.locator('#ls-pos').textContent();
 await p.locator('[data-listen-language="en-ja"]').click();await p.waitForTimeout(900);
 assert.equal(await p.locator('#ls-pos').textContent(),paused);assert(await p.evaluate(()=>audit.media.every(a=>a.paused)));
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('speak.listen.v3')).ja),true);
 // Reload and re-enter: the visible choice and the playback order must stay in sync.
 await p.reload();await p.waitForSelector('[data-listen-language="en-ja"]');
 assert.equal(await p.locator('[data-listen-language="en-ja"]').getAttribute('aria-pressed'),'true');
 for(const width of [320,390,768,1024]){
  await p.setViewportSize({width,height:1000});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
  const box=await p.locator('[data-listen-language="en-ja"]').boundingBox();assert(box.x>=0&&box.x+box.width<=width);
 }
 await p.setViewportSize({width:390,height:844});if(process.env.PEACH_SCREENSHOTS)await p.screenshot({path:process.env.PEACH_SCREENSHOTS+'/listen-language-mobile.png',fullPage:false});
 // Long text: use the existing translations sentence-by-sentence when aligned,
 // and once after the full chapter if translations combine several sentences.
 await p.evaluate(()=>{window.longCalls=[];Speech.speak=(text,opts)=>{longCalls.push({text,opts});if(opts?.lang==='ja')setTimeout(()=>ListenView.onLeave(),0);return Promise.resolve();};});
 await p.locator('[data-tab="text"]').click();await p.locator('[data-mat="r1"]').click();await p.locator('#ls-play').click();
 await p.waitForFunction(()=>longCalls.some(x=>x.opts?.lang==='ja'));await p.waitForTimeout(150);
 const paired=await p.evaluate(()=>longCalls);assert.equal(paired.length,2);assert.equal(paired[0].text,'This September, I will travel by car.');assert.equal(paired[1].text,'今年の9月、私は車で旅行します。');
 await p.evaluate(()=>{longCalls=[];});await p.locator('[data-mat="s1"]').click();await p.locator('#ls-gap').selectOption('0');await p.locator('#ls-play').click();
 await p.waitForFunction(()=>longCalls.some(x=>x.opts?.lang==='ja'));await p.waitForTimeout(150);
 const chapter=await p.evaluate(()=>longCalls);assert.equal(chapter.length,19);assert(chapter.slice(0,18).every(x=>x.opts?.lang!=='ja'));
 const expected=await p.evaluate(()=>Store.content.speeches.filter(x=>x.section===Store.content.speeches[0].section).map(x=>x.ja).join(' '));assert.equal(chapter[18].text,expected);
 await p.locator('[data-listen-language="en"]').click();await p.evaluate(()=>{longCalls=[];});await p.locator('#ls-play').click();await p.waitForFunction(()=>longCalls.length>=2);await p.locator('#ls-play').click();
 assert(await p.evaluate(()=>longCalls.every(x=>x.opts?.lang!=='ja')));
 await p.locator('#hdr-home').click();assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log('PASS: visible English-only/bilingual choices, actual English MP3 then Japanese completion before advance, mid-speech switch without reset, paused-state preservation, saved choice, responsive controls and long-text translation alignment. Japanese TTS simulated; hardware output not measured.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
