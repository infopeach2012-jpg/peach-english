/* cards.js — フラッシュカード（間隔反復SRS）。window.CardsView */
(function () {
  'use strict';

  let state = null; // { queue, pos, flipped, source }

  // デッキ構築（フレーズ＋レッスンノート）
  function buildDeck(source) {
    const C = window.Store.content;
    let cards = [];
    if (source === 'phrase' || !source || source === 'all') {
      cards = cards.concat(C.phrases.map((p) => ({ key: 'p' + p.id, en: p.en, ja: p.ja, note: p.note, tag: 'フレーズ' })));
    }
    if (source === 'note' || !source || source === 'all') {
      cards = cards.concat(C.notes.map((n) => ({ key: 'n' + n.id, en: n.en, ja: n.ja, note: n.note, tag: 'ノート' })));
    }
    return cards;
  }

  function render(container) {
    if (!state) startSession('all');
    draw(container);
  }

  function startSession(source) {
    const deck = buildDeck(source);
    const { due, fresh } = window.Store.srsDue(deck);
    // 期限到来を優先、次に新規カードを最大20枚
    let queue = due.concat(shuffle(fresh).slice(0, Math.max(0, 20 - due.length)));
    if (queue.length === 0) queue = shuffle(deck).slice(0, 20); // 全て学習済みなら復習
    state = { queue: shuffle(queue), pos: 0, flipped: false, source, reviewed: 0 };
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
    const card = state.queue[state.pos];
    if (!card) { finish(container); return; }
    const st = window.Store.srsState(card.key);

    container.innerHTML = `
      <!-- ソース選択 -->
      <div class="flex gap-2 mb-4">
        ${[['all', 'すべて'], ['phrase', 'フレーズ'], ['note', 'ノート']].map(([k, l]) => `
          <button data-src="${k}" class="chip ${k === state.source ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">${l}</button>`).join('')}
      </div>

      <div class="flex items-center justify-between mb-3 text-xs text-gray-400 font-semibold">
        <span>残り ${state.queue.length - state.pos} 枚</span>
        <span>${st ? '復習' + (st.reps + 1) + '回目' : '🆕 新しいカード'}</span>
      </div>

      <!-- カード -->
      <div id="card-flip" class="flip mb-5" style="height:280px">
        <div class="flip-inner w-full h-full">
          <!-- 表：英語 -->
          <div class="flip-face bg-white border border-gray-100 rounded-3xl shadow-sm p-6 items-center justify-center text-center cursor-pointer">
            <div class="chip bg-violet-50 text-brand mb-3">${card.tag}</div>
            <div class="text-2xl font-bold text-gray-800 leading-relaxed">${window.App.escapeHtml(card.en)}</div>
            <button id="card-tts" class="mt-4 bg-violet-50 text-brand font-semibold rounded-full px-4 py-2 text-sm">🔊 発音</button>
            <div class="text-xs text-gray-300 mt-5">タップで意味を表示</div>
          </div>
          <!-- 裏：意味 -->
          <div class="flip-face flip-back brand-grad text-white rounded-3xl shadow-sm p-6 items-center justify-center text-center cursor-pointer">
            <div class="text-2xl font-bold leading-relaxed">${window.App.escapeHtml(card.ja)}</div>
            ${card.note ? `<div class="text-sm opacity-90 mt-3 bg-white/15 rounded-xl px-3 py-2">${window.App.escapeHtml(card.note)}</div>` : ''}
            <div class="text-xs opacity-70 mt-4">${window.App.escapeHtml(card.en)}</div>
          </div>
        </div>
      </div>

      <!-- 採点ボタン（裏面表示時） -->
      <div id="card-grades" class="grid grid-cols-4 gap-2 ${state.flipped ? '' : 'opacity-40 pointer-events-none'}">
        <button data-g="0" class="bg-red-50 text-red-600 rounded-xl py-3 font-bold text-sm">もう一度<div class="text-[10px] font-normal opacity-70">&lt;10分</div></button>
        <button data-g="3" class="bg-orange-50 text-orange-600 rounded-xl py-3 font-bold text-sm">難しい<div class="text-[10px] font-normal opacity-70">1日</div></button>
        <button data-g="4" class="bg-blue-50 text-blue-600 rounded-xl py-3 font-bold text-sm">普通<div class="text-[10px] font-normal opacity-70">3日〜</div></button>
        <button data-g="5" class="bg-green-50 text-green-600 rounded-xl py-3 font-bold text-sm">簡単<div class="text-[10px] font-normal opacity-70">長め</div></button>
      </div>
      <div class="text-center text-xs text-gray-300 mt-3 ${state.flipped ? 'hidden-x' : ''}">意味を確認してから、覚え具合を選んでください</div>
    `;

    if (state.flipped) container.querySelector('#card-flip').classList.add('flipped');

    const flipEl = container.querySelector('#card-flip');
    flipEl.addEventListener('click', (e) => {
      if (e.target.id === 'card-tts') return;
      state.flipped = !state.flipped;
      flipEl.classList.toggle('flipped', state.flipped);
      container.querySelector('#card-grades').classList.toggle('opacity-40', !state.flipped);
      container.querySelector('#card-grades').classList.toggle('pointer-events-none', !state.flipped);
    });
    container.querySelector('#card-tts').onclick = (e) => { e.stopPropagation(); (window.Speech.unlockAudio(), window.Speech.speak)(card.en, {}); };
    container.querySelectorAll('[data-src]').forEach((b) => {
      b.onclick = () => { startSession(b.dataset.src); draw(container); };
    });
    container.querySelectorAll('[data-g]').forEach((b) => {
      b.onclick = () => grade(container, card, parseInt(b.dataset.g, 10));
    });
  }

  function grade(container, card, g) {
    window.Store.srsReview(card.key, g);
    window.App.checkLevelUp();
    state.reviewed++;
    // 「もう一度」は後方に差し込み、それ以外は次へ
    if (g < 3) {
      state.queue.push(card);
    }
    state.pos++;
    state.flipped = false;
    draw(container);
  }

  function finish(container) {
    container.innerHTML = `
      <div class="text-center py-16">
        <div class="text-6xl mb-3">🧠✨</div>
        <div class="text-xl font-bold text-gray-800">復習完了！</div>
        <div class="text-sm text-gray-500 mt-1">${state.reviewed} 枚を復習しました</div>
        <button id="card-more" class="mt-6 brand-grad text-white rounded-xl px-6 py-3 font-bold">続けて復習する</button>
      </div>`;
    container.querySelector('#card-more').onclick = () => { startSession(state.source); draw(container); };
  }

  window.CardsView = { render, buildDeck };
})();
