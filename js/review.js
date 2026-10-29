/* review.js — 復習ボックス（お気に入り★ ＋ 苦手フレーズ）。window.ReviewView */
(function () {
  'use strict';

  let tab = 'weak';
  let micRef = {};
  let listening = false;

  function render(container) {
    draw(container);
  }

  function draw(container) {
    const S = window.Store;
    const weak = S.weakItems();
    const favs = S.favoriteItems();
    const list = tab === 'weak' ? weak : favs;

    container.innerHTML = `
      <button class="text-sm text-gray-400 mb-3 back-home">← ホーム</button>
      <div class="flex gap-2 mb-4">
        <button data-tab="weak" class="chip ${tab === 'weak' ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">💪 苦手 <span class="opacity-70">${weak.length}</span></button>
        <button data-tab="fav" class="chip ${tab === 'fav' ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">⭐ お気に入り <span class="opacity-70">${favs.length}</span></button>
      </div>

      ${list.length === 0 ? emptyState() : `
        <div class="text-xs text-gray-400 mb-2 px-1">${tab === 'weak' ? '発音スコアが低い/つまずいた項目。声に出して克服しよう' : '★を付けた項目。マイクで再確認'}</div>
        <div id="rv-list" class="space-y-2"></div>`}
    `;
    bindBack(container);
    container.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(container); }; });

    const wrap = container.querySelector('#rv-list');
    if (wrap) list.forEach((it) => wrap.appendChild(rowEl(it, container)));
  }

  function emptyState() {
    if (tab === 'weak') {
      return `<div class="text-center py-16 text-gray-400">
        <div class="text-5xl mb-3">🌱</div>
        <div class="font-semibold">まだ苦手はありません</div>
        <div class="text-xs mt-1">発音練習で60点未満だった項目がここに集まります</div>
      </div>`;
    }
    return `<div class="text-center py-16 text-gray-400">
      <div class="text-5xl mb-3">⭐</div>
      <div class="font-semibold">お気に入りは空です</div>
      <div class="text-xs mt-1">発音練習や辞書で★を付けるとここに表示されます</div>
    </div>`;
  }

  function rowEl(it, container) {
    const el = document.createElement('div');
    el.className = 'bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm';
    const fav = window.Store.isFavorite(it.key);
    el.innerHTML = `
      <div class="flex items-start gap-2">
        <button class="rv-say shrink-0 w-8 h-8 rounded-full bg-violet-50 text-brand flex items-center justify-center text-sm">🔊</button>
        <button class="rv-mic shrink-0 w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-sm" style="color:var(--brand2)">🎤</button>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-800">${window.App.escapeHtml(it.en)}</div>
          <div class="text-sm text-gray-500">${window.App.escapeHtml(it.ja)}</div>
          ${it.score != null ? `<div class="text-xs mt-0.5" style="color:var(--bad)">前回 ${it.score}点</div>` : ''}
          <div class="rv-fb text-xs mt-1"></div>
        </div>
        <button class="rv-star shrink-0 text-xl" style="color:${fav ? '#f59e0b' : '#d1d5db'}">${fav ? '★' : '☆'}</button>
      </div>`;
    el.querySelector('.rv-say').onclick = () => window.Speech.speak(it.en, { rate: 0.9 });
    el.querySelector('.rv-mic').onclick = () => micRow(el, it);
    el.querySelector('.rv-star').onclick = (e) => {
      const on = window.Store.toggleFavorite(it.key);
      e.target.textContent = on ? '★' : '☆';
      e.target.style.color = on ? '#f59e0b' : '#d1d5db';
      if (!on && tab === 'fav') setTimeout(() => draw(container), 150);
    };
    return el;
  }

  async function micRow(el, it) {
    if (!window.Speech.asrSupported) { window.App.toast('音声認識に非対応のブラウザです'); return; }
    if (listening) { if (micRef.stop) micRef.stop(); return; }
    const fb = el.querySelector('.rv-fb');
    const mic = el.querySelector('.rv-mic');
    listening = true; mic.classList.add('listening');
    fb.style.color = '#9ca3af'; fb.textContent = '🎤 聞き取り中…';
    window.Speech.stopSpeaking();
    micRef = {};
    try {
      const said = await window.Speech.listenOnce({ ref: micRef, onPartial: (t) => { fb.textContent = '🎤 ' + (t || '…'); } });
      const r = window.Speech.score(it.en, said);
      fb.style.color = window.App.scoreColor(r.score);
      fb.innerHTML = `${r.score}点 ${window.App.scoreLabel(r.score)} — ${r.tokens.map((t) => `<span class="wtok ${t.ok ? 'ok' : 'ng'}">${window.App.escapeHtml(t.word)}</span>`).join(' ')}`;
      window.Store.recordSpeaking(it.key, r.score);
      window.App.checkLevelUp();
      if (r.score >= 80) window.App.toast('🌟 ' + r.score + '点！克服！');
    } catch (e) { fb.style.color = 'var(--bad)'; fb.textContent = 'もう一度お試しください'; }
    finally { listening = false; mic.classList.remove('listening'); }
  }

  function bindBack(container) {
    const b = container.querySelector('.back-home');
    if (b) b.onclick = () => window.App.navigate('home');
  }

  function onLeave() { if (micRef.stop) micRef.stop(); listening = false; window.Speech.stopSpeaking(); }

  window.ReviewView = { render, onLeave };
})();
