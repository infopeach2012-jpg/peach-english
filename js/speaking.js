/* speaking.js — 発音・スピーキング練習（Speak型：お手本→発話→AI採点）
 * window.SpeakingView
 */
(function () {
  'use strict';

  let state = null; // { list, idx, mode }
  let micRef = {};

  function decks() {
    const C = window.Store.content;
    return {
      sentence: { label: '文で練習', emoji: '💬', items: C.phrases.filter((p) => p.kind === 'sentence').map(mapPhrase) },
      word: { label: '単語で練習', emoji: '🔤', items: C.phrases.filter((p) => p.kind === 'word').map(mapPhrase) },
      note: { label: 'レッスンノート', emoji: '📝', items: C.notes.map(mapNote) },
    };
  }
  function mapPhrase(p) { return { key: 'p' + p.id, en: p.en, ja: p.ja, note: p.note }; }
  function mapNote(n) { return { key: 'n' + n.id, en: n.en, ja: n.ja, note: n.note }; }

  function render(container) {
    if (!state) startSession('sentence');
    draw(container);
  }

  function startSession(deckKey, filtered) {
    const d = decks()[deckKey];
    let items = filtered || d.items.slice();
    // 適度にシャッフル
    items = shuffle(items).slice(0, 30);
    state = { deckKey, list: items, idx: 0, result: null };
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
    const d = decks();
    const item = state.list[state.idx];
    if (!item) {
      container.innerHTML = `<div class="text-center py-20 text-gray-400">項目がありません</div>`;
      return;
    }
    const asr = window.Speech.asrSupported;

    container.innerHTML = `
      <!-- デッキ選択 -->
      <div class="flex gap-2 mb-4 overflow-x-auto pb-1">
        ${Object.entries(d).map(([k, v]) => `
          <button data-deck="${k}" class="chip whitespace-nowrap ${k === state.deckKey ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">
            ${v.emoji} ${v.label} <span class="opacity-70">${v.items.length}</span>
          </button>`).join('')}
      </div>

      <div class="flex items-center justify-between mb-2 text-xs text-gray-400 font-semibold">
        <span>${state.idx + 1} / ${state.list.length}</span>
        <button id="spk-shuffle" class="underline">シャッフル</button>
      </div>
      <div class="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div class="h-full brand-grad rounded-full transition-all" style="width:${((state.idx) / state.list.length) * 100}%"></div>
      </div>

      <!-- お手本カード -->
      <div class="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm mb-4">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-bold text-brand">お手本を声に出して読もう</div>
          <button id="spk-star" class="text-xl leading-none" style="color:${window.Store.isFavorite(item.key) ? '#f59e0b' : '#d1d5db'}">${window.Store.isFavorite(item.key) ? '★' : '☆'}</button>
        </div>
        <div id="spk-en" class="text-xl font-bold text-gray-800 leading-relaxed">${window.App.escapeHtml(item.en)}</div>
        <div class="text-sm text-gray-500 mt-2">${window.App.escapeHtml(item.ja)}</div>
        ${item.note ? `<div class="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg px-3 py-2">💡 ${window.App.escapeHtml(item.note)}</div>` : ''}
        <div class="flex gap-2 mt-4">
          <button id="spk-play" class="flex-1 bg-violet-50 text-brand font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-1.5">
            🔊 お手本
          </button>
          <button id="spk-slow" class="flex-1 bg-violet-50 text-brand font-semibold rounded-xl py-2.5 text-sm">
            🐢 ゆっくり
          </button>
        </div>
        ${window.Speech.recordSupported ? `<div id="spk-rec-wrap" class="mt-2 flex items-center gap-2">
          <button id="spk-rec" class="flex-1 bg-pink-50 font-semibold rounded-xl py-2.5 text-sm" style="color:var(--brand2)">🎙️ 録音して聞き比べ</button>
          <button id="spk-myvoice" class="flex-1 bg-gray-100 text-gray-400 font-semibold rounded-xl py-2.5 text-sm hidden-x">▶ 自分の声</button>
        </div>` : ''}
      </div>

      <!-- 結果 -->
      <div id="spk-result" class="mb-4"></div>

      <!-- マイク or 自己採点フォールバック -->
      ${asr ? `
      <div class="flex flex-col items-center gap-3">
        <button id="spk-mic" class="mic-btn brand-grad">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </button>
        <div id="spk-hint" class="text-xs text-gray-400 h-4">タップして発音</div>
      </div>` : `
      <div class="bg-amber-50 border border-amber-100 rounded-2xl p-4">
        <div class="text-sm font-bold text-gray-700 mb-1">🔎 この端末では自動採点は使えません</div>
        <div class="text-xs text-gray-500 mb-3">iPhone / iPad のブラウザは音声認識（自動採点）に非対応です。お手本を聞いて声に出し、${window.Speech.recordSupported ? '🎙️録音して聞き比べ' : '自分の耳'}で確認しましょう。PCのChrome / Edgeなら自動採点が使えます。</div>
        <div class="flex gap-2">
          <button id="spk-replay" class="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2.5 font-semibold text-sm">🔁 お手本</button>
          <button id="spk-got" class="flex-1 brand-grad text-white rounded-xl py-2.5 font-semibold text-sm">👍 言えた</button>
        </div>
      </div>`}

      <div class="flex gap-2 mt-5">
        <button id="spk-prev" class="flex-1 bg-gray-100 text-gray-600 rounded-xl py-2.5 font-semibold text-sm">← 前へ</button>
        <button id="spk-next" class="flex-1 bg-gray-800 text-white rounded-xl py-2.5 font-semibold text-sm">次へ →</button>
      </div>
    `;

    // 前回結果の再表示
    if (state.result) renderResult(container, state.result, item);

    // イベント
    container.querySelectorAll('[data-deck]').forEach((b) => {
      b.addEventListener('click', () => { startSession(b.dataset.deck); draw(container); });
    });
    container.querySelector('#spk-shuffle').onclick = () => { startSession(state.deckKey); draw(container); };
    const starBtn = container.querySelector('#spk-star');
    starBtn.onclick = () => {
      const on = window.Store.toggleFavorite(item.key);
      starBtn.textContent = on ? '★' : '☆';
      starBtn.style.color = on ? '#f59e0b' : '#d1d5db';
      window.App.toast(on ? '⭐ お気に入りに追加' : 'お気に入りから削除');
    };
    if (window.Speech.recordSupported) bindRecord(container, item);
    container.querySelector('#spk-play').onclick = () => (window.Speech.unlockAudio(), window.Speech.speak)(item.en, { rate: 0.95 });
    container.querySelector('#spk-slow').onclick = () => (window.Speech.unlockAudio(), window.Speech.speak)(item.en, { rate: 0.6 });
    container.querySelector('#spk-prev').onclick = () => { if (state.idx > 0) { state.idx--; state.result = null; draw(container); } };
    container.querySelector('#spk-next').onclick = () => nextItem(container);
    const micEl = container.querySelector('#spk-mic');
    if (micEl) {
      micEl.onclick = () => toggleMic(container, item);
    } else {
      // 音声認識非対応（iPhone等）: 自己採点フォールバック
      const replay = container.querySelector('#spk-replay');
      const got = container.querySelector('#spk-got');
      if (replay) replay.onclick = () => (window.Speech.unlockAudio(), window.Speech.speak)(item.en, { rate: 0.95 });
      if (got) got.onclick = () => {
        window.Store.recordActivity(5);
        window.App.checkLevelUp();
        window.App.toast('👍 ナイス！次へ');
        nextItem(container);
      };
    }
  }

  // 録音して聞き比べ
  let recCtl = null;
  let recording = false;
  let myVoiceUrl = null;
  function bindRecord(container, item) {
    myVoiceUrl = null;
    const recBtn = container.querySelector('#spk-rec');
    const playBtn = container.querySelector('#spk-myvoice');
    if (!recBtn) return;
    recBtn.onclick = async () => {
      if (recording) { // 停止
        if (recCtl) recCtl.stop();
        return;
      }
      // マイク競合回避のため認識中は不可
      if (listening) { window.App.toast('採点マイクの停止後に録音できます'); return; }
      try {
        recBtn.textContent = '⏺ 録音中… タップで停止';
        recBtn.classList.add('listening');
        recording = true;
        recCtl = await window.Speech.startRecording();
        myVoiceUrl = await recCtl.done;
        recording = false;
        recBtn.textContent = '🎙️ もう一度録音';
        recBtn.classList.remove('listening');
        if (myVoiceUrl) {
          playBtn.classList.remove('hidden-x');
          playBtn.classList.remove('text-gray-400');
          playBtn.style.background = '#fce7f3';
          playBtn.style.color = 'var(--brand2)';
        }
      } catch (e) {
        recording = false;
        recBtn.textContent = '🎙️ 録音して聞き比べ';
        recBtn.classList.remove('listening');
        window.App.toast('マイクを使用できませんでした');
      }
    };
    playBtn.onclick = async () => {
      if (!myVoiceUrl) return;
      // お手本→自分の声の順で聞き比べ
      await (window.Speech.unlockAudio(), window.Speech.speak)(item.en, { rate: 0.95 });
      const a = new Audio(myVoiceUrl);
      a.play().catch(() => {});
    };
  }

  let listening = false;
  async function toggleMic(container, item) {
    if (!window.Speech.asrSupported) { window.App.toast('音声認識に非対応のブラウザです'); return; }
    const micBtn = container.querySelector('#spk-mic');
    const hint = container.querySelector('#spk-hint');
    if (listening) { if (micRef.stop) micRef.stop(); return; }

    listening = true;
    micBtn.classList.add('listening');
    micBtn.classList.remove('brand-grad');
    micBtn.style.background = 'var(--brand2)';
    hint.textContent = '🎤 聞き取り中… 話し終えたら自動で採点';
    window.Speech.stopSpeaking();

    micRef = {};
    try {
      const said = await window.Speech.listenOnce({
        ref: micRef,
        onPartial: (t) => { hint.textContent = '🎤 ' + (t || '…'); },
      });
      const res = window.Speech.score(item.en, said);
      state.result = { said, res };
      window.Store.recordSpeaking(item.key, res.score);
      window.App.checkLevelUp();
      renderResult(container, state.result, item);
      // 高得点は自動でお手本比較の余韻
      if (res.score >= 80) window.App.toast('🌟 ' + res.score + '点！ Great!');
    } catch (e) {
      hint.textContent = window.Speech.errorMessage(e);
    } finally {
      listening = false;
      micBtn.classList.remove('listening');
      micBtn.style.background = '';
      micBtn.classList.add('brand-grad');
    }
  }

  function renderResult(container, result, item) {
    const box = container.querySelector('#spk-result');
    if (!box) return;
    const { said, res } = result;
    const color = window.App.scoreColor(res.score);
    const toks = res.tokens.map((t) => `<span class="wtok ${t.ok ? 'ok' : 'ng'}">${window.App.escapeHtml(t.word)}</span>`).join(' ');
    box.innerHTML = `
      <div class="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="text-center">
            <div class="text-4xl font-extrabold" style="color:${color}">${res.score}</div>
            <div class="text-[10px] text-gray-400 font-semibold">SCORE</div>
          </div>
          <div class="flex-1">
            <div class="font-bold" style="color:${color}">${window.App.scoreLabel(res.score)}</div>
            <div class="text-xs text-gray-500 mt-0.5">${res.matched} / ${res.total} 語を認識</div>
          </div>
        </div>
        <div class="mt-3 leading-relaxed text-[15px]">${toks}</div>
        <div class="mt-2 text-xs text-gray-400">あなた: 「${window.App.escapeHtml(said) || '(認識なし)'}」</div>
        <div class="flex gap-2 mt-3">
          <button id="spk-retry" class="flex-1 bg-violet-50 text-brand font-semibold rounded-xl py-2 text-sm">🔁 もう一度</button>
          <button id="spk-cmp" class="flex-1 bg-violet-50 text-brand font-semibold rounded-xl py-2 text-sm">🔊 お手本と比較</button>
        </div>
      </div>`;
    box.querySelector('#spk-retry').onclick = () => toggleMic(container, item);
    box.querySelector('#spk-cmp').onclick = () => (window.Speech.unlockAudio(), window.Speech.speak)(item.en, { rate: 0.9 });
  }

  function nextItem(container) {
    if (state.idx < state.list.length - 1) {
      state.idx++;
      state.result = null;
      draw(container);
    } else {
      // セッション終了
      container.innerHTML = `
        <div class="text-center py-16">
          <div class="text-6xl mb-3">🎉</div>
          <div class="text-xl font-bold text-gray-800">セッション完了！</div>
          <div class="text-sm text-gray-500 mt-1">お疲れさまでした</div>
          <button id="spk-again" class="mt-6 brand-grad text-white rounded-xl px-6 py-3 font-bold">もう一度練習する</button>
        </div>`;
      container.querySelector('#spk-again').onclick = () => { startSession(state.deckKey); draw(container); };
    }
  }

  function onLeave() {
    if (micRef.stop) micRef.stop();
    if (recCtl && recording) recCtl.stop();
    listening = false;
    recording = false;
  }

  window.SpeakingView = { render, onLeave };
})();
