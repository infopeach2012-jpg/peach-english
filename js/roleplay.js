/* roleplay.js — ロールプレイ会話（SpeakBuddy型：相手役AとやりとりしBを発話）
 * window.RoleplayView
 */
(function () {
  'use strict';

  let state = null; // { list, idx, revealed, result }
  let micRef = {};
  let listening = false;

  function render(container) {
    if (!state) newSession();
    draw(container);
  }

  function newSession() {
    const items = window.Store.content.dialogues.slice();
    state = { list: shuffle(items), idx: 0, revealed: false, result: null };
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function draw(container) {
    const d = state.list[state.idx];
    if (!d) { newSession(); }
    const asr = window.Speech.asrSupported;

    container.innerHTML = `
      <div class="flex items-center justify-between mb-2 text-xs text-gray-400 font-semibold">
        <span>会話 ${state.idx + 1} / ${state.list.length}</span>
        <button id="rp-restart" class="underline">最初から</button>
      </div>
      <div class="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div class="h-full brand-grad rounded-full transition-all" style="width:${(state.idx / state.list.length) * 100}%"></div>
      </div>

      <!-- 相手A の吹き出し -->
      <div class="flex items-start gap-2 mb-3">
        <div class="w-9 h-9 rounded-full brand-grad text-white flex items-center justify-center text-sm shrink-0">A</div>
        <div class="bg-white border border-gray-100 rounded-2xl rounded-tl-sm p-3.5 shadow-sm max-w-[85%]">
          <div class="font-semibold text-gray-800">${window.App.escapeHtml(d.a)}</div>
          <div class="text-xs text-gray-500 mt-1">${window.App.escapeHtml(d.aJa)}</div>
          <button id="rp-playA" class="text-brand text-xs font-semibold mt-1.5">🔊 もう一度聞く</button>
        </div>
      </div>

      <!-- あなた(B) の番 -->
      <div class="flex items-start gap-2 flex-row-reverse mb-4">
        <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0" style="background:var(--brand2);color:#fff">You</div>
        <div class="rounded-2xl rounded-tr-sm p-3.5 max-w-[85%] ${state.revealed ? 'bg-pink-50 border border-pink-100' : 'bg-gray-50 border border-dashed border-gray-300'}">
          <div class="text-xs font-semibold text-gray-500 mb-1">こう答えよう（日本語）</div>
          <div class="text-gray-800 font-medium">${window.App.escapeHtml(d.bJa)}</div>
          <div id="rp-ben" class="${state.revealed ? '' : 'blur-sm select-none'} mt-2 font-bold text-gray-800">${window.App.escapeHtml(d.b)}</div>
        </div>
      </div>

      ${d.note ? `<div class="text-xs text-gray-500 bg-violet-50 rounded-xl px-3 py-2 mb-4">💡 ${window.App.escapeHtml(d.note)}</div>` : ''}

      <div id="rp-result" class="mb-4"></div>

      <div class="flex flex-col items-center gap-2">
        <button id="rp-mic" class="mic-btn brand-grad">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>
        <div id="rp-hint" class="text-xs text-gray-400 h-4">${asr ? 'タップしてBのセリフを発音' : '⚠️ 音声認識は非対応（Chrome/Edge/Safari推奨）'}</div>
      </div>

      <div class="flex gap-2 mt-5">
        <button id="rp-reveal" class="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2.5 font-semibold text-sm">答えを見る</button>
        <button id="rp-next" class="flex-1 bg-gray-800 text-white rounded-xl py-2.5 font-semibold text-sm">次の会話 →</button>
      </div>
    `;

    // A を自動再生
    window.Speech.speak(d.a, { rate: 0.95 });

    if (state.result) renderResult(container, d);

    container.querySelector('#rp-playA').onclick = () => window.Speech.speak(d.a, { rate: 0.95 });
    container.querySelector('#rp-restart').onclick = () => { newSession(); draw(container); };
    container.querySelector('#rp-reveal').onclick = () => {
      state.revealed = true;
      draw(container);
      window.Speech.speak(d.b, { rate: 0.95 });
    };
    container.querySelector('#rp-next').onclick = () => next(container);
    container.querySelector('#rp-mic').onclick = () => toggleMic(container, d);
  }

  async function toggleMic(container, d) {
    if (!window.Speech.asrSupported) { window.App.toast('音声認識に非対応のブラウザです'); return; }
    const micBtn = container.querySelector('#rp-mic');
    const hint = container.querySelector('#rp-hint');
    if (listening) { if (micRef.stop) micRef.stop(); return; }
    listening = true;
    micBtn.classList.add('listening');
    micBtn.style.background = 'var(--brand2)';
    hint.textContent = '🎤 聞き取り中…';
    window.Speech.stopSpeaking();
    micRef = {};
    try {
      const said = await window.Speech.listenOnce({
        ref: micRef,
        onPartial: (t) => { hint.textContent = '🎤 ' + (t || '…'); },
      });
      const res = window.Speech.score(d.b, said);
      state.result = { said, res };
      state.revealed = true;
      window.Store.recordSpeaking('d' + d.id, res.score);
      window.App.checkLevelUp();
      // 答えを表示してから結果描画
      const ben = container.querySelector('#rp-ben');
      if (ben) ben.classList.remove('blur-sm', 'select-none');
      renderResult(container, d);
      if (res.score >= 80) window.App.toast('🌟 ' + res.score + '点！');
    } catch (e) {
      hint.textContent = 'もう一度お試しください';
    } finally {
      listening = false;
      micBtn.classList.remove('listening');
      micBtn.style.background = '';
    }
  }

  function renderResult(container, d) {
    const box = container.querySelector('#rp-result');
    if (!box || !state.result) return;
    const { said, res } = state.result;
    const color = window.App.scoreColor(res.score);
    const toks = res.tokens.map((t) => `<span class="wtok ${t.ok ? 'ok' : 'ng'}">${window.App.escapeHtml(t.word)}</span>`).join(' ');
    box.innerHTML = `
      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="text-3xl font-extrabold" style="color:${color}">${res.score}</div>
          <div class="text-sm font-bold" style="color:${color}">${window.App.scoreLabel(res.score)}</div>
          <button id="rp-cmp" class="ml-auto text-brand text-xs font-semibold">🔊 お手本</button>
        </div>
        <div class="mt-2 leading-relaxed">${toks}</div>
        <div class="mt-1 text-xs text-gray-400">あなた: 「${window.App.escapeHtml(said) || '(認識なし)'}」</div>
      </div>`;
    box.querySelector('#rp-cmp').onclick = () => window.Speech.speak(d.b, { rate: 0.9 });
  }

  function next(container) {
    if (state.idx < state.list.length - 1) {
      state.idx++;
      state.revealed = false;
      state.result = null;
      draw(container);
    } else {
      container.innerHTML = `
        <div class="text-center py-16">
          <div class="text-6xl mb-3">🎊</div>
          <div class="text-xl font-bold text-gray-800">全${state.list.length}会話クリア！</div>
          <div class="text-sm text-gray-500 mt-1">実践会話おつかれさまでした</div>
          <button id="rp-again" class="mt-6 brand-grad text-white rounded-xl px-6 py-3 font-bold">もう一度</button>
        </div>`;
      container.querySelector('#rp-again').onclick = () => { newSession(); draw(container); };
    }
  }

  function onLeave() {
    if (micRef.stop) micRef.stop();
    listening = false;
  }

  window.RoleplayView = { render, onLeave };
})();
