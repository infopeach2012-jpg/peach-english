/* Focused pattern practice: listen, repeat, then use another sentence. */
(function () {
  'use strict';
  let root, courses, course = null, index = 0, active = false, epoch = 0, mic = {};
  let completed = new Set(), feedback = '';
  const KEY = 'speak.patterns.v1';
  let prefs = { mode: 'listen', gap: 0.5, repeat: 2 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  const esc = (s) => window.App.escapeHtml(s);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} }
  function halt() {
    active = false; epoch++;
    if (mic.stop) mic.stop(); mic = {};
    window.Speech.stopSpeaking();
    if (window.Speech.releaseAudio) window.Speech.releaseAudio();
    updateButton();
  }
  async function render(container) {
    root = container; course = null; halt();
    const ticket = epoch;
    root.innerHTML = '<p class="pattern-loading">レッスンを準備しています…</p>';
    try {
      if (!courses) { const res = await fetch('data/patterns.json'); if (!res.ok) throw new Error('load'); courses = await res.json(); }
      if (ticket !== epoch) return;
      chooser();
    } catch (_) {
      if (ticket !== epoch) return;
      root.innerHTML = '<p>レッスンを読み込めませんでした。通信を確認して再度開いてください。</p>';
    }
  }
  function chooser() {
    halt(); course = null;
    root.innerHTML = `<section class="pattern-picker"><p class="pattern-kicker">LISTEN. REPEAT. MAKE IT YOURS.</p><h2>ひとつの型から、<br>話せる英語を増やそう。</h2><p>短いお手本を聞いて、繰り返す。<br>1レッスン8文。声を出せないときは、聞くだけでも。</p><div class="pattern-courses">${courses.map((c,i)=>`<button data-course="${c.id}"><span class="course-number">${String(i+1).padStart(2,'0')}</span><span><small>${esc(c.title)}</small><strong>${esc(c.pattern)}</strong><em>8文 · 約1分</em></span><b aria-hidden="true">→</b></button>`).join('')}</div></section>`;
    root.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{course=courses.find(c=>c.id===b.dataset.course);index=0;completed=new Set();feedback='';screen();run();});
  }
  function updateButton() {
    if (!root) return;
    const b = root.querySelector('#pt-toggle');
    if (b) { b.innerHTML = active ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="4"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>'; b.setAttribute('aria-label', active ? '一時停止' : '再生'); }
  }
  function screen() {
    const item = course.items[index];
    root.innerHTML = `<section class="pattern-session">
      <div class="pattern-top"><button id="pt-exit" aria-label="レッスン一覧へ">×</button><div class="pattern-segments" aria-label="${index+1} / ${course.items.length}">${course.items.map((_,i)=>`<span class="${i<index?'done':i===index?'current':''}"></span>`).join('')}</div><span>${index+1}/${course.items.length}</span></div>
      <div class="pattern-mode"><button data-mode="listen" aria-pressed="${prefs.mode==='listen'}">聞くだけ</button><button data-mode="speak" aria-pressed="${prefs.mode==='speak'}">声に出す</button></div>
      <div class="pattern-context"><p>${esc(course.title)}</p><strong>${esc(course.pattern)}</strong><span>${esc(course.note)}</span></div>
      <div class="pattern-focus"><div id="pt-status" class="pattern-status" role="status">お手本を聞きましょう</div><p id="pt-en" lang="en">${esc(item.en)}</p><p id="pt-ja">${esc(item.ja)}</p>
      <div class="pattern-controls"><button id="pt-replay" aria-label="もう一度">↺</button><button id="pt-toggle" aria-label="再生">▶︎</button><button id="pt-slow" aria-label="ゆっくり再生">0.6×</button></div>
      <button id="pt-mic" class="pattern-mic" ${prefs.mode==='listen'?'hidden':''}>マイクで話す</button><p id="pt-feedback" class="pattern-feedback" aria-live="polite">${esc(feedback)}</p></div>
      <div class="pattern-navigation"><button id="pt-prev" ${index===0?'disabled':''}>← 前の文</button><button id="pt-next">${index===course.items.length-1?'練習を終える':'次の文 →'}</button></div>
      <div class="pattern-options"><label>速さ<select id="pt-rate" data-speech-rate>${window.Speech.rateOptions()}</select></label><label>文の間<select id="pt-gap">${[0,0.25,0.5,1].map(v=>`<option value="${v}" ${v===prefs.gap?'selected':''}>${v===0?'なし':v+'秒'}</option>`).join('')}</select></label><label>繰り返し<select id="pt-repeat">${[1,2,3].map(v=>`<option value="${v}" ${v===prefs.repeat?'selected':''}>${v}回</option>`).join('')}</select></label></div>
    </section>`;
    root.querySelector('#pt-exit').onclick=chooser;
    root.querySelector('#pt-toggle').onclick=()=>{if(active){halt();status('一時停止中');}else run();};
    root.querySelector('#pt-replay').onclick=run;
    root.querySelector('#pt-slow').onclick=()=>run(true);
    root.querySelector('#pt-prev').onclick=()=>move(-1);
    root.querySelector('#pt-next').onclick=()=>move(1);
    root.querySelector('#pt-mic').onclick=record;
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{halt();prefs.mode=b.dataset.mode;save();feedback='';screen();run();});
    ['gap','repeat'].forEach(name=>{root.querySelector('#pt-'+name).onchange=e=>{prefs[name]=Number(e.target.value);save();if(active)run();};});
    updateButton();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function status(text) { const el=root&&root.querySelector('#pt-status'); if(el)el.textContent=text; }
  function mark() {
    const key=course.items[index].key;
    if(completed.has(key))return;
    completed.add(key);window.Store.recordActivity(1);window.App.refreshHeader();
  }
  async function run(slow) {
    if(!course)return;
    halt(); active=true;const ticket=epoch;updateButton();window.Speech.unlockAudio();
    const live=()=>active&&ticket===epoch;
    try {
      while(live()) {
        const item=course.items[index];
        const next=course.items[index+1];if(next)window.Speech.prefetchClip(next.key);
        for(let pass=0;pass<(slow?1:prefs.repeat)&&live();pass++) {
          status(slow?'ゆっくり聞いてみましょう':`お手本 ${pass+1} / ${prefs.repeat}`);
          await window.Speech.speak(item.en,{key:item.key,slow:!!slow});
          if(live()&&pass+1<prefs.repeat&&!slow)await wait(350);
        }
        if(!live())return;
        if(slow){active=false;updateButton();status('もう一度聞くか、次の文へ');return;}
        if(prefs.mode==='speak') {active=false;updateButton();status('あなたの番です。マイクを押して話しましょう');return;}
        mark();status('聞き終わりました');
        await wait(prefs.gap*1000);if(!live())return;
        if(index===course.items.length-1){finish();return;}
        index++;feedback='';screen();
      }
    } catch (_) {if(ticket===epoch){halt();status('再生を押して、もう一度お試しください');}}
  }
  function move(delta) {
    halt();
    if(index+delta>=course.items.length){finish();return;}
    index=Math.max(0,index+delta);feedback='';screen();run();
  }
  async function record() {
    if(!window.Speech.asrSupported){status('このブラウザは音声認識に対応していません');return;}
    halt();const ticket=epoch;mic={};status('聞き取り中…');
    const button=root.querySelector('#pt-mic');button.textContent='話し終えたら停止';button.onclick=()=>{if(mic.stop)mic.stop();};
    try {
      const said=await window.Speech.listenOnce({ref:mic,onPartial:text=>{if(ticket===epoch)root.querySelector('#pt-feedback').textContent=text;}});
      if(ticket!==epoch)return;
      if(!said){status('声が聞き取れませんでした。もう一度どうぞ');return;}
      const result=window.Speech.score(course.items[index].en,said);
      feedback=`聞き取った言葉：${said}（お手本との単語一致 ${result.score}%）`;
      root.querySelector('#pt-feedback').textContent=feedback;
      status(result.score>=80?'言葉が伝わりました。次の文に進めます':'お手本を聞いて、もう一度練習しましょう');
      mark();
    } catch(e){if(ticket===epoch)status(window.Speech.errorMessage(e));}
    finally {if(ticket===epoch){button.textContent='もう一度話す';button.onclick=record;}}
  }
  function finish() {
    halt();
    const title=course.title,count=completed.size;
    root.innerHTML=`<section class="pattern-finish"><span>SESSION COMPLETE</span><h2>今日も、ひとつ前へ。</h2><p>${esc(title)}</p><strong>${count}<small> / ${course.items.length}文を練習</small></strong><button id="pt-again">もう一度練習</button><button id="pt-courses">ほかのレッスンを選ぶ</button><button id="pt-home">ホームへ戻る</button></section>`;
    root.querySelector('#pt-again').onclick=()=>{index=0;completed=new Set();feedback='';screen();run();};
    root.querySelector('#pt-courses').onclick=chooser;
    root.querySelector('#pt-home').onclick=()=>window.App.navigate('home');
  }
  window.PatternsView={render,onLeave:halt,onRateChange(){if(active)run();}};
})();
