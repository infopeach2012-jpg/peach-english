/* lesson.js — 今日のレッスン（ガイド付き4ステップコース：SpeakBuddy型カリキュラム）
 * ウォームアップ → キーフレーズ発音 → ミニ会話 → 仕上げクイズ
 * 日付シードで「今日の内容」は1日固定。window.LessonView
 */
(function () {
  'use strict';

  let micRef = {};
  let listening = false;
  let autoplayTimer = null;
  let viewEpoch = 0;
  function cancelAutoplay() { clearTimeout(autoplayTimer); autoplayTimer = null; }
  function play(text) { cancelAutoplay(); return window.Speech.speak(text); }
  function scheduleSpeech(text) { cancelAutoplay(); autoplayTimer = setTimeout(() => play(text), 200); }
  let plan = null;  // 今日の教材（日付固定）
  let st = null;    // 進行状態 { step, i, results }

  // 日付シードの簡易乱数
  function seedFromDate(dateStr) {
    let h = 2166136261;
    for (let i = 0; i < dateStr.length; i++) { h ^= dateStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
  }
  function pick(arr, n, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }

  function buildPlan() {
    const C = window.Store.content;
    const today = window.Store.todayStr();
    const rnd = seedFromDate(today);
    const words = C.phrases.filter((p) => p.kind === 'word');
    const sents = C.phrases.filter((p) => p.kind === 'sentence');
    const quizPool = []
      .concat(C.phrases.map((p) => ({ en: p.en, ja: p.ja })))
      .concat(C.notes.map((n) => ({ en: n.en, ja: n.ja })))
      .filter((x) => x.en && x.ja && x.ja.length <= 40);
    return {
      date: today,
      warmup: pick(words, 5, rnd),
      speak: pick(sents, 5, rnd),
      talk: pick(C.dialogues, 3, rnd),
      quiz: pick(quizPool, 5, rnd).map((item) => {
        const distr = pick(quizPool.filter((x) => x.ja !== item.ja), 3, rnd);
        const opts = pick([item].concat(distr), 4, rnd);
        return { item, options: opts, answer: opts.indexOf(item) };
      }),
    };
  }

  const STEPS = [
    { key: 'warmup', label: 'ウォームアップ', emoji: '🔥' },
    { key: 'speak', label: 'キーフレーズ', emoji: '🗣️' },
    { key: 'talk', label: 'ミニ会話', emoji: '💬' },
    { key: 'quiz', label: '仕上げクイズ', emoji: '🧩' },
  ];

  function render(container) {
    if (!plan || plan.date !== window.Store.todayStr()) plan = buildPlan();
    if (!st) { drawIntro(container); return; }
    drawStep(container);
  }

  function isDoneToday() {
    const d = window.Store.progress.lessonDone || {};
    return !!d[window.Store.todayStr()];
  }

  function drawIntro(container) {
    const done = isDoneToday();
    container.innerHTML = `
      <button class="text-sm text-gray-400 mb-3 back-home">← ホーム</button>
      <div class="rounded-3xl p-6 text-white shadow-md mb-5 relative overflow-hidden" style="background:linear-gradient(135deg,#6d28d9,#ec4899)">
        <div class="text-[11px] font-semibold opacity-80">TODAY'S LESSON · ${plan.date}</div>
        <div class="text-2xl font-bold mt-1">今日のレッスン</div>
        <div class="text-sm opacity-90 mt-1">${done ? '本日は達成済み！復習にもう一周できます' : '4ステップ・約5分の総合トレーニング'}</div>
        <div class="absolute -right-3 -bottom-3 text-7xl opacity-20">🎓</div>
      </div>
      <div class="space-y-2.5 mb-6">
        ${STEPS.map((s, i) => `
          <div class="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm">
            <div class="w-9 h-9 rounded-full bg-violet-50 text-brand flex items-center justify-center font-bold">${i + 1}</div>
            <div class="flex-1"><div class="font-bold text-gray-800 text-sm">${s.emoji} ${s.label}</div>
              <div class="text-xs text-gray-500">${stepDesc(s.key)}</div></div>
          </div>`).join('')}
      </div>
      <button id="lesson-start" class="w-full brand-grad text-white rounded-2xl py-3.5 font-bold shadow-md">${done ? 'もう一度挑戦する' : '▶ レッスンを始める'}</button>
    `;
    bindBack(container);
    container.querySelector('#lesson-start').onclick = () => { st = { step: 0, i: 0, results: { speak: [], quiz: 0, talk: [] } }; drawStep(container); };
  }

  function stepDesc(key) {
    if (key === 'warmup') return `単語 ${plan.warmup.length} 語をさっと確認`;
    if (key === 'speak') return `重要フレーズ ${plan.speak.length} 文を発音`;
    if (key === 'talk') return `会話 ${plan.talk.length} 場面を実践`;
    return `${plan.quiz.length} 問で理解度チェック`;
  }

  function stepper(active) {
    return `<div class="flex items-center gap-1.5 mb-4">
      ${STEPS.map((s, i) => `<div class="flex-1 h-1.5 rounded-full ${i < active ? 'bg-green-400' : i === active ? 'brand-grad' : 'bg-gray-200'}"></div>`).join('')}
    </div>
    <div class="text-center text-xs font-bold text-gray-400 mb-3">STEP ${active + 1}/4 · ${STEPS[active].emoji} ${STEPS[active].label}</div>`;
  }

  function drawStep(container) {
    viewEpoch++;
    cancelAutoplay();
    window.Speech.stopSpeaking();
    const s = STEPS[st.step];
    if (s.key === 'warmup') drawWarmup(container);
    else if (s.key === 'speak') drawSpeak(container);
    else if (s.key === 'talk') drawTalk(container);
    else drawQuiz(container);
  }

  function advance(container) {
    // 次の項目 or 次のステップ
    const s = STEPS[st.step];
    const listLen = plan[s.key].length;
    if (st.i < listLen - 1) { st.i++; st.sub = null; drawStep(container); }
    else if (st.step < STEPS.length - 1) { st.step++; st.i = 0; st.sub = null; drawStep(container); }
    else finish(container);
  }

  // --- STEP 1: ウォームアップ（単語） ---
  function drawWarmup(container) {
    const w = plan.warmup[st.i];
    const revealed = st.sub === 'r';
    container.innerHTML = stepper(0) + `
      <div class="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm text-center" style="min-height:230px">
        <div class="text-xs text-gray-400 mb-1">${st.i + 1} / ${plan.warmup.length}</div>
        <div class="text-3xl font-extrabold text-gray-800 mt-6">${window.App.escapeHtml(w.en)}</div>
        <button id="l-tts" class="mt-3 bg-violet-50 text-brand rounded-full px-4 py-2 text-sm font-semibold">🔊 発音</button>
        <div class="mt-5 text-lg text-gray-600 ${revealed ? '' : 'blur-sm select-none'}">${window.App.escapeHtml(w.ja)}</div>
        ${w.note && revealed ? `<div class="text-xs text-gray-400 mt-2">${window.App.escapeHtml(w.note)}</div>` : ''}
      </div>
      <button id="l-next" class="w-full mt-5 ${revealed ? 'bg-gray-800' : 'brand-grad'} text-white rounded-2xl py-3.5 font-bold">${revealed ? '次へ →' : '意味を確認'}</button>
    `;
    container.querySelector('#l-tts').onclick = () => play(w.en);
    scheduleSpeech(w.en);
    container.querySelector('#l-next').onclick = () => {
      if (!revealed) { st.sub = 'r'; drawStep(container); }
      else { window.Store.recordActivity(2); advance(container); }
    };
  }

  // --- STEP 2: キーフレーズ発音 ---
  function drawSpeak(container) {
    const item = plan.speak[st.i];
    const res = st.sub;
    container.innerHTML = stepper(1) + `
      <div class="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm mb-4">
        <div class="text-xs text-gray-400 mb-2">${st.i + 1} / ${plan.speak.length}</div>
        <div class="text-xl font-bold text-gray-800 leading-relaxed">${window.App.escapeHtml(item.en)}</div>
        <div class="text-sm text-gray-500 mt-2">${window.App.escapeHtml(item.ja)}</div>
        <button id="l-play" class="mt-3 bg-violet-50 text-brand rounded-full px-4 py-2 text-sm font-semibold">🔊 お手本</button>
      </div>
      <div id="l-res" class="mb-4"></div>
      <div class="flex flex-col items-center gap-2">
        <button id="l-mic" class="mic-btn brand-grad"><svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
        <div id="l-hint" class="text-xs text-gray-400 h-4">${window.Speech.asrSupported ? 'タップして発音' : '⚠️ 音声認識に非対応'}</div>
      </div>
      <button id="l-skip" class="w-full mt-5 bg-gray-100 text-gray-500 rounded-2xl py-3 font-bold text-sm">${res ? '次へ →' : 'スキップ →'}</button>
    `;
    container.querySelector('#l-play').onclick = () => play(item.en);
    container.querySelector('#l-mic').onclick = () => micScore(container, item.en, 'l', (r) => {
      st.sub = r; st.results.speak.push(r.score);
      renderInlineScore(container.querySelector('#l-res'), r);
      container.querySelector('#l-skip').textContent = '次へ →';
    });
    container.querySelector('#l-skip').onclick = () => advance(container);
    if (res) renderInlineScore(container.querySelector('#l-res'), res);
  }

  // --- STEP 3: ミニ会話 ---
  function drawTalk(container) {
    const d = plan.talk[st.i];
    const res = st.sub;
    container.innerHTML = stepper(2) + `
      <div class="flex items-start gap-2 mb-3">
        <div class="w-8 h-8 rounded-full brand-grad text-white flex items-center justify-center text-xs shrink-0">A</div>
        <div class="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-3 shadow-sm">
          <div class="font-semibold text-gray-800">${window.App.escapeHtml(d.a)}</div>
          <div class="text-xs text-gray-500 mt-0.5">${window.App.escapeHtml(d.aJa)}</div>
          <button id="l-playa" class="text-brand text-xs font-semibold mt-1">🔊 もう一度</button>
        </div>
      </div>
      <div class="flex items-start gap-2 flex-row-reverse mb-4">
        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0" style="background:var(--brand2);color:#fff">You</div>
        <div class="rounded-2xl rounded-tr-sm p-3 ${res ? 'bg-pink-50 border border-pink-100' : 'bg-gray-50 border border-dashed border-gray-300'}">
          <div class="text-xs text-gray-500 mb-1">こう答えよう</div>
          <div class="font-medium text-gray-800">${window.App.escapeHtml(d.bJa)}</div>
          <div class="mt-1 font-bold text-gray-800 ${res ? '' : 'blur-sm select-none'}">${window.App.escapeHtml(d.b)}</div>
        </div>
      </div>
      <div id="l-res" class="mb-4"></div>
      <div class="flex flex-col items-center gap-2">
        <button id="l-mic" class="mic-btn brand-grad"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
        <div id="l-hint" class="text-xs text-gray-400 h-4">${window.Speech.asrSupported ? 'Bのセリフを発音' : '⚠️ 音声認識に非対応'}</div>
      </div>
      <button id="l-skip" class="w-full mt-5 bg-gray-100 text-gray-500 rounded-2xl py-3 font-bold text-sm">${res ? '次へ →' : '答えを見て次へ →'}</button>
    `;
    scheduleSpeech(d.a);
    container.querySelector('#l-playa').onclick = () => play(d.a);
    container.querySelector('#l-mic').onclick = () => micScore(container, d.b, 'l', (r) => {
      st.sub = r; st.results.talk.push(r.score);
      drawStep(container);
      play(d.b);
    });
    container.querySelector('#l-skip').onclick = () => advance(container);
    if (res) renderInlineScore(container.querySelector('#l-res'), res);
  }

  // --- STEP 4: 仕上げクイズ ---
  function drawQuiz(container) {
    const q = plan.quiz[st.i];
    container.innerHTML = stepper(3) + `
      <div class="text-center text-xs text-gray-400 mb-3">Q ${st.i + 1} / ${plan.quiz.length}</div>
      <div class="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm text-center mb-4">
        <div class="text-[11px] font-bold text-brand mb-2">意味を選ぼう</div>
        <div class="text-xl font-bold text-gray-800">${window.App.escapeHtml(q.item.en)}</div>
        <button id="l-say" class="mt-2 text-brand text-sm font-semibold">🔊</button>
      </div>
      <div id="l-opts" class="space-y-2.5">
        ${q.options.map((o, i) => `<button data-i="${i}" class="l-opt w-full text-left bg-white border border-gray-200 rounded-2xl px-4 py-3.5 font-medium text-gray-800 shadow-sm">${window.App.escapeHtml(o.ja)}</button>`).join('')}
      </div>`;
    container.querySelector('#l-say').onclick = () => play(q.item.en);
    container.querySelectorAll('.l-opt').forEach((b) => {
      b.onclick = () => {
        if (q.picked != null) return;
        q.picked = +b.dataset.i;
        const ok = q.picked === q.answer;
        if (ok) st.results.quiz++;
        window.Store.recordActivity(ok ? 5 : 1);
        container.querySelectorAll('.l-opt').forEach((el, idx) => {
          el.classList.add('pointer-events-none');
          if (idx === q.answer) el.classList.add('opt-correct');
          else if (idx === q.picked) el.classList.add('opt-wrong');
        });
        const nb = document.createElement('button');
        nb.className = 'w-full mt-4 bg-gray-800 text-white rounded-2xl py-3.5 font-bold';
        nb.textContent = st.i < plan.quiz.length - 1 ? '次の問題 →' : '結果を見る';
        nb.onclick = () => advance(container);
        container.appendChild(nb);
      };
    });
  }

  // 共通: 発音採点
  async function micScore(container, target, idPrefix, cb) {
    if (!window.Speech.asrSupported) { window.App.toast('音声認識に非対応のブラウザです'); return; }
    const mic = container.querySelector('#' + idPrefix + '-mic');
    const hint = container.querySelector('#' + idPrefix + '-hint');
    if (listening) { if (micRef.stop) micRef.stop(); return; }
    const epoch = viewEpoch;
    cancelAutoplay();
    listening = true; mic.classList.add('listening'); mic.style.background = 'var(--brand2)';
    hint.textContent = '🎤 聞き取り中…';
    window.Speech.stopSpeaking();
    micRef = {};
    try {
      const said = await window.Speech.listenOnce({ ref: micRef, onPartial: (t) => { hint.textContent = '🎤 ' + (t || '…'); } });
      if (epoch !== viewEpoch) return;
      const r = window.Speech.score(target, said);
      r.said = said;
      window.Store.recordSpeaking('lesson', r.score);
      window.App.checkLevelUp();
      cb(r);
      if (r.score >= 80) window.App.toast('🌟 ' + r.score + '点！');
    } catch (e) { hint.textContent = 'もう一度お試しください'; }
    finally { listening = false; mic.classList.remove('listening'); mic.style.background = ''; }
  }

  function renderInlineScore(box, r) {
    if (!box) return;
    const color = window.App.scoreColor(r.score);
    const toks = r.tokens.map((t) => `<span class="wtok ${t.ok ? 'ok' : 'ng'}">${window.App.escapeHtml(t.word)}</span>`).join(' ');
    box.innerHTML = `<div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div class="flex items-center gap-3"><div class="text-3xl font-extrabold" style="color:${color}">${r.score}</div>
      <div class="text-sm font-bold" style="color:${color}">${window.App.scoreLabel(r.score)}</div></div>
      <div class="mt-2 leading-relaxed">${toks}</div></div>`;
  }

  function finish(container) {
    // 記録
    if (!window.Store.progress.lessonDone) window.Store.progress.lessonDone = {};
    const firstToday = !window.Store.progress.lessonDone[window.Store.todayStr()];
    window.Store.progress.lessonDone[window.Store.todayStr()] = true;
    if (firstToday) window.Store.progress.xp += 25; // 完走ボーナス
    window.Store.save();
    window.App.checkLevelUp();
    if (window.Achievements) window.Achievements.check();

    const spk = st.results.speak.concat(st.results.talk);
    const avg = spk.length ? Math.round(spk.reduce((a, b) => a + b, 0) / spk.length) : null;
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-6xl mb-3">🎓✨</div>
        <div class="text-2xl font-extrabold text-gray-800">レッスン完了！</div>
        <div class="text-sm text-gray-500 mt-1">${firstToday ? '完走ボーナス +25 XP 🎁' : 'おかえりなさい、もう一周おつかれさま'}</div>
        <div class="grid grid-cols-2 gap-3 max-w-xs mx-auto mt-6">
          <div class="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm"><div class="text-2xl font-bold text-brand">${avg != null ? avg + '%' : '—'}</div><div class="text-[10px] text-gray-400">発音平均</div></div>
          <div class="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm"><div class="text-2xl font-bold" style="color:var(--brand2)">${st.results.quiz}/${plan.quiz.length}</div><div class="text-[10px] text-gray-400">クイズ正解</div></div>
        </div>
        <div class="flex gap-2 mt-6 max-w-xs mx-auto">
          <button id="l-home" class="flex-1 brand-grad text-white rounded-xl py-3 font-bold">ホームへ</button>
          <button id="l-again" class="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 font-bold">もう一周</button>
        </div>
      </div>`;
    st = null;
    container.querySelector('#l-home').onclick = () => window.App.navigate('home');
    container.querySelector('#l-again').onclick = () => { st = { step: 0, i: 0, results: { speak: [], quiz: 0, talk: [] } }; drawStep(container); };
  }

  function bindBack(container) {
    const b = container.querySelector('.back-home');
    if (b) b.onclick = () => window.App.navigate('home');
  }

  function onLeave() {
    viewEpoch++;
    cancelAutoplay();
    if (micRef.stop) micRef.stop();
    listening = false;
    window.Speech.stopSpeaking();
  }

  window.LessonView = { render, onLeave, isDoneToday, onRateChange() { cancelAutoplay(); window.Speech.stopSpeaking(); } };
})();
