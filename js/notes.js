/* Daily lesson notes: uploaded material, dated batches and direct audio practice. */
(function () {
  'use strict';
  let selected = null, query = '';
  const esc = value => window.App.escapeHtml(value);
  function batches() { return window.Store.content.noteBatches || []; }
  function latest() { return batches()[0] || null; }
  function itemsFor(batch) {
    if (!batch) return window.Store.content.notes.slice().sort((a, b) => b.id - a.id).map(n => ({ key: 'n' + n.id, en: n.en, ja: n.ja, note: n.note, section: n.date || '以前のノート' }));
    return batch.items.map(item => {
      const source = window.Store.resolveKey(item.key);
      return source ? Object.assign({}, source, item) : null;
    }).filter(Boolean);
  }
  function render(container) {
    if (selected === null || (selected !== 'all' && !batches().some(b => b.id === selected))) selected = latest() ? latest().id : 'all';
    const batch = batches().find(b => b.id === selected);
    const items = itemsFor(batch);
    container.innerHTML = `<section class="notes-page">
      <header class="notes-heading"><p class="studio-eyebrow">YOUR LESSON NOTES</p><h1>学んだ言葉を、<br>毎日の英語に。</h1><p>英文と和訳を振り返る。聞いて、声に出して、自分の言葉に。</p></header>
      <div class="notes-filters"><label>ノートを選ぶ<select id="notes-batch">${batches().map(b => `<option value="${esc(b.id)}" ${b.id === selected ? 'selected' : ''}>${esc(b.added_on)} 追加 · ${esc(b.title)}</option>`).join('')}<option value="all" ${selected === 'all' ? 'selected' : ''}>すべてのノート（${window.Store.content.notes.length}件）</option></select></label><label>英語・日本語で検索<input id="notes-q" type="search" value="${esc(query)}" placeholder="表現や文法のメモを探す" /></label></div>
      <div class="notes-batch-info"><h2>${batch ? esc(batch.title) : 'これまでのレッスンノート'}</h2>${batch ? `<p>追加日 ${esc(batch.added_on)}${batch.lesson_date ? ` · ノートの日付 ${esc(batch.lesson_date)}` : ''}</p>` : ''}<p id="notes-count" role="status"></p></div>
      <div class="notes-actions"><button id="notes-listen" class="studio-primary">${window.App.icon('listen')} 聞き流す</button><button id="notes-practice" class="notes-secondary">${window.App.icon('speaking')} 発音を練習</button></div>
      <div id="notes-list"></div><button id="notes-more" class="notes-secondary" hidden>さらに表示</button>
    </section>`;
    let limit = 60;
    const matching = () => {
      const q = query.trim().toLocaleLowerCase();
      return q ? items.filter(i => [i.en, i.ja, i.note, i.section].some(value => String(value || '').toLocaleLowerCase().includes(q))) : items;
    };
    function drawList() {
      const filtered = matching();
      let group = null;
      container.querySelector('#notes-list').innerHTML = filtered.slice(0, limit).map(item => {
        const heading = item.section !== group ? `<h3 class="notes-section">${esc(item.section)}</h3>` : '';
        group = item.section;
        return `${heading}<article class="note-entry" data-note-key="${esc(item.key)}"><div class="note-entry-main"><p class="note-en" lang="en">${esc(item.en)}</p><p class="note-ja">${esc(item.ja)}</p>${item.note ? `<p class="note-explanation">${esc(item.note)}</p>` : ''}</div><button class="note-play" data-note-play="${esc(item.key)}" aria-label="${esc(item.en)} を聞く">${window.App.icon('listen')}</button></article>`;
      }).join('') || '<p class="notes-empty">一致する表現はありません。</p>';
      container.querySelector('#notes-count').textContent = `${filtered.length}件${query ? '（検索結果）' : ''}`;
      container.querySelector('#notes-more').hidden = filtered.length <= limit;
      container.querySelector('#notes-listen').disabled = !filtered.length;
      container.querySelector('#notes-practice').disabled = !filtered.length;
      container.querySelectorAll('[data-note-play]').forEach(button => button.onclick = () => {
        const item = filtered.find(i => i.key === button.dataset.notePlay);
        window.Speech.unlockAudio(); window.Speech.speak(item.en, { key: item.key });
      });
    }
    function practice(mode) {
      const list = matching();
      if (!list.length) return;
      window.App.drill = { mode, title: batch ? batch.title : 'レッスンノート', back: 'notes', items: list.map(item => Object.assign({}, item, { group: item.section })) };
      window.App.navigate('drill');
    }
    container.querySelector('#notes-batch').onchange = e => { window.Speech.stopSpeaking(); selected = e.target.value; query = ''; render(container); };
    container.querySelector('#notes-q').oninput = e => { query = e.target.value; limit = 60; drawList(); };
    container.querySelector('#notes-listen').onclick = () => practice('listen');
    container.querySelector('#notes-practice').onclick = () => practice('speak');
    container.querySelector('#notes-more').onclick = () => { limit += 60; drawList(); };
    drawList();
  }
  window.NotesView = { render, latest, onLeave() { window.Speech.stopSpeaking(); } };
})();
