/* dict.js — フレーズ辞書（全フレーズ・ノートの検索/ブラウズ）。window.DictView */
(function () {
  'use strict';

  let all = null;
  let query = '';
  let limit = 60;

  function buildIndex() {
    const C = window.Store.content;
    all = []
      .concat(C.phrases.map((p) => ({ key: 'p' + p.id, en: p.en, ja: p.ja, note: p.note, tag: 'フレーズ' })))
      .concat(C.notes.map((n) => ({ key: 'n' + n.id, en: n.en, ja: n.ja, note: n.note, tag: 'ノート' })));
  }

  function render(container) {
    if (!all) buildIndex();
    draw(container);
  }

  function filtered() {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((x) =>
      (x.en && x.en.toLowerCase().includes(q)) ||
      (x.ja && x.ja.includes(query.trim())) ||
      (x.note && x.note.toLowerCase().includes(q))
    );
  }

  function draw(container) {
    const list = filtered();
    const shown = list.slice(0, limit);
    container.innerHTML = `
      <button class="text-sm text-gray-400 mb-3 back-home">← ホーム</button>
      <div class="sticky top-[calc(env(safe-area-inset-top))] z-10 bg-white pb-2">
        <div class="relative">
          <input id="dict-q" value="${window.App.escapeHtml(query)}" placeholder="英語・日本語・キーワードで検索" class="w-full border border-gray-200 rounded-full pl-10 pr-4 py-2.5 text-sm" />
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9ca3af" stroke-width="2" class="absolute left-3.5 top-3"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
        </div>
        <div class="text-xs text-gray-400 mt-2 px-1">${list.length} 件${query ? '（検索中）' : '（全フレーズ）'}</div>
      </div>
      <div id="dict-list" class="space-y-2 mt-2">
        ${shown.map(rowHtml).join('') || '<div class="text-center text-gray-400 py-10 text-sm">見つかりませんでした</div>'}
      </div>
      ${list.length > limit ? `<button id="dict-more" class="w-full mt-3 bg-gray-100 text-gray-600 rounded-xl py-2.5 font-semibold text-sm">さらに表示（残り ${list.length - limit} 件）</button>` : ''}
    `;
    bindBack(container);

    const q = container.querySelector('#dict-q');
    q.addEventListener('input', debounce(() => { query = q.value; limit = 60; redraw(container, q); }, 200));
    // フォーカス維持のため再描画は最小限
    container.querySelectorAll('.dict-say').forEach((b) => {
      b.onclick = () => window.Speech.speak(b.dataset.en, {});
    });
    container.querySelectorAll('.dict-star').forEach((b) => {
      b.onclick = () => {
        const on = window.Store.toggleFavorite(b.dataset.key);
        b.textContent = on ? '★' : '☆';
        b.style.color = on ? '#f59e0b' : '#d1d5db';
      };
    });
    const more = container.querySelector('#dict-more');
    if (more) more.onclick = () => { limit += 60; draw(container); container.querySelector('#dict-q').focus(); };
  }

  function redraw(container, qEl) {
    const pos = qEl.selectionStart;
    draw(container);
    const nq = container.querySelector('#dict-q');
    nq.focus();
    try { nq.setSelectionRange(pos, pos); } catch (e) {}
  }

  function rowHtml(x) {
    return `
      <div class="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-sm flex items-start gap-2">
        <button class="dict-say shrink-0 w-8 h-8 rounded-full bg-violet-50 text-brand flex items-center justify-center text-sm" data-en="${window.App.escapeHtml(x.en)}">🔊</button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="chip ${x.tag === 'フレーズ' ? 'bg-violet-50 text-brand' : 'bg-blue-50 text-blue-600'}" style="font-size:10px;padding:1px 7px">${x.tag}</span>
          </div>
          <div class="font-semibold text-gray-800 mt-1">${window.App.escapeHtml(x.en)}</div>
          <div class="text-sm text-gray-500">${window.App.escapeHtml(x.ja)}</div>
          ${x.note ? `<div class="text-xs text-gray-400 mt-1">${window.App.escapeHtml(x.note)}</div>` : ''}
        </div>
        <button class="dict-star shrink-0 text-xl leading-none" data-key="${x.key}" style="color:${window.Store.isFavorite(x.key) ? '#f59e0b' : '#d1d5db'}">${window.Store.isFavorite(x.key) ? '★' : '☆'}</button>
      </div>`;
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function bindBack(container) {
    const b = container.querySelector('.back-home');
    if (b) b.onclick = () => window.App.navigate('home');
  }

  window.DictView = { render };
})();
