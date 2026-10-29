/* quiz.js — リスニング＆意味クイズ（4択・ゲーミフィケーション）
 * window.QuizView
 */
(function () {
  'use strict';

  let state = null; // { questions, idx, correct, mode }

  function pool() {
    const C = window.Store.content;
    // 文・意味がそろっている項目のみ出題対象に
    const items = []
      .concat(C.phrases.map((p) => ({ en: p.en, ja: p.ja })))
      .concat(C.notes.map((n) => ({ en: n.en, ja: n.ja })))
      .filter((x) => x.en && x.ja && x.ja.length <= 40);
    return items;
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuestions(mode, n) {
    const all = pool();
    const picked = shuffle(all).slice(0, n);
    return picked.map((item, i) => {
      // ダミー選択肢を3つ
      const distractors = shuffle(all.filter((x) => x.ja !== item.ja && x.en !== item.en)).slice(0, 3);
      const opts = shuffle([item].concat(distractors));
      // 'mix'（まぜて）は1問ごとに 日→英 か 英→日 をランダムに選ぶ
      const m = mode === 'mix' ? (Math.random() < 0.5 ? 'ja2en' : 'en2ja') : mode;
      return {
        item,
        mode: m, // 'listen'（英語音声→意味）/ 'ja2en'（日本語→英語）/ 'en2ja'（英語→意味）
        options: opts,
        answer: opts.indexOf(item),
      };
    });
  }

  function render(container) {
    if (!state) { drawStart(container); return; }
    drawQuestion(container);
  }

  function drawStart(container) {
    container.innerHTML = `
      <button class="text-sm text-gray-400 mb-3 back-home">← ホーム</button>
      <div class="text-center mb-5">
        <div class="text-5xl mb-2">🧩</div>
        <div class="text-lg font-bold text-gray-800">クイズで力だめし</div>
        <div class="text-sm text-gray-500 mt-1">10問4択・出題形式を選んでね</div>
      </div>
      <div class="space-y-3">
        <button data-mode="ja2en" class="row w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left flex items-center gap-3">
          <div class="text-3xl">🇯🇵</div><div><div class="font-bold text-gray-800">① 日本語 → 英語</div><div class="text-xs text-gray-500">日本語に合う英語を選ぶ</div></div>
        </button>
        <button data-mode="en2ja" class="row w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left flex items-center gap-3">
          <div class="text-3xl">🔤</div><div><div class="font-bold text-gray-800">② 英語 → 日本語</div><div class="text-xs text-gray-500">英文を読んで意味を選ぶ</div></div>
        </button>
        <button data-mode="mix" class="row w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left flex items-center gap-3">
          <div class="text-3xl">🔀</div><div><div class="font-bold text-gray-800">③ まぜて（混合）</div><div class="text-xs text-gray-500">1問ごとに ①と② が入れ替わる</div></div>
        </button>
        <button data-mode="listen" class="row w-full bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left flex items-center gap-3">
          <div class="text-3xl">🔊</div><div><div class="font-bold text-gray-800">リスニング</div><div class="text-xs text-gray-500">英語を聞いて意味を選ぶ</div></div>
        </button>
      </div>`;
    bindBack(container);
    container.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        state = { questions: buildQuestions(b.dataset.mode, 10), idx: 0, correct: 0, mode: b.dataset.mode };
        drawQuestion(container);
      };
    });
  }

  function drawQuestion(container) {
    const q = state.questions[state.idx];
    if (!q) { drawResult(container); return; }
    const isListen = q.mode === 'listen';
    const prompt = q.mode === 'ja2en' ? q.item.ja : q.item.en;
    const optText = (o) => (q.mode === 'ja2en' ? o.en : o.ja);

    container.innerHTML = `
      <div class="flex items-center justify-between mb-2 text-xs font-semibold text-gray-400">
        <span>Q ${state.idx + 1} / ${state.questions.length}</span>
        <span>正解 ${state.correct}</span>
      </div>
      <div class="h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
        <div class="h-full brand-grad rounded-full transition-all" style="width:${(state.idx / state.questions.length) * 100}%"></div>
      </div>

      <div class="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm text-center mb-5">
        <div class="text-[11px] font-bold text-brand mb-2">${isListen ? '音声を聞いて意味を選ぼう' : q.mode === 'ja2en' ? '日本語に合う英語は？' : '意味を選ぼう'}</div>
        ${isListen
          ? `<button id="q-play" class="w-20 h-20 rounded-full brand-grad text-white mx-auto flex items-center justify-center text-3xl shadow-md">🔊</button>
             <div class="text-xs text-gray-400 mt-3">タップで再生</div>`
          : `<div class="text-xl font-bold text-gray-800 leading-relaxed">${window.App.escapeHtml(prompt)}</div>`}
      </div>

      <div id="q-opts" class="space-y-2.5">
        ${q.options.map((o, i) => `
          <button data-i="${i}" class="q-opt w-full text-left bg-white border border-gray-200 rounded-2xl px-4 py-3.5 font-medium text-gray-800 shadow-sm">
            ${window.App.escapeHtml(optText(o))}
          </button>`).join('')}
      </div>`;
    bindBack(container);

    if (isListen) {
      const play = () => window.Speech.speak(q.item.en, { rate: 0.9 });
      container.querySelector('#q-play').onclick = play;
      setTimeout(play, 300);
    }
    container.querySelectorAll('.q-opt').forEach((b) => {
      b.onclick = () => choose(container, parseInt(b.dataset.i, 10));
    });
  }

  function choose(container, i) {
    const q = state.questions[state.idx];
    if (q.picked != null) return;
    q.picked = i;
    const correct = i === q.answer;
    if (correct) state.correct++;
    window.Store.recordActivity(correct ? 5 : 1);
    window.App.checkLevelUp();

    container.querySelectorAll('.q-opt').forEach((b, idx) => {
      b.classList.add('pointer-events-none');
      if (idx === q.answer) b.classList.add('opt-correct');
      else if (idx === i) b.classList.add('opt-wrong');
    });
    // 正解の英語を読み上げ（リスニング以外でも定着）
    if (correct) window.App.toast('⭕ 正解！');

    const bar = document.createElement('div');
    bar.className = 'mt-4';
    bar.innerHTML = `
      <div class="bg-gray-50 rounded-2xl p-4 text-sm">
        <div class="font-bold text-gray-800">${window.App.escapeHtml(q.item.en)}</div>
        <div class="text-gray-500 mt-1">${window.App.escapeHtml(q.item.ja)}</div>
      </div>
      <button id="q-next" class="w-full mt-3 bg-gray-800 text-white rounded-xl py-3 font-bold">${state.idx < state.questions.length - 1 ? '次の問題 →' : '結果を見る'}</button>`;
    container.appendChild(bar);
    container.querySelector('#q-next').onclick = () => { state.idx++; drawQuestion(container); };
  }

  function drawResult(container) {
    const total = state.questions.length;
    const pct = Math.round((state.correct / total) * 100);
    const emoji = pct >= 90 ? '🏆' : pct >= 70 ? '🎉' : pct >= 50 ? '👍' : '💪';
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-6xl mb-3">${emoji}</div>
        <div class="text-2xl font-extrabold text-gray-800">${state.correct} / ${total} 正解</div>
        <div class="text-lg font-bold text-brand mt-1">${pct}点</div>
        <div class="text-sm text-gray-500 mt-2">${pct >= 70 ? 'すばらしい！この調子です' : 'カード復習で弱点を補強しよう'}</div>
        <div class="flex gap-2 mt-6 max-w-xs mx-auto">
          <button id="q-again" class="flex-1 brand-grad text-white rounded-xl py-3 font-bold">もう一度</button>
          <button id="q-home" class="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 font-bold">ホーム</button>
        </div>
      </div>`;
    container.querySelector('#q-again').onclick = () => { state = null; drawStart(container); };
    container.querySelector('#q-home').onclick = () => { state = null; window.App.navigate('home'); };
  }

  function bindBack(container) {
    const b = container.querySelector('.back-home');
    if (b) b.onclick = () => { state = null; window.App.navigate('home'); };
  }

  function onLeave() { window.Speech.stopSpeaking(); }

  window.QuizView = { render, onLeave };
})();
