/* Daily lesson notes: uploaded material, dated batches and direct audio practice. */
(function () {
  'use strict';
  const FILTER_KEY = 'speak.notes.filters.v1';
  let selected = null, query = '', order = 'newest', selectedBatch = 'all';
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || '{}');
    if (typeof saved.date === 'string') selected = saved.date;
    if (saved.order === 'oldest') order = saved.order;
    if (typeof saved.batch === 'string') selectedBatch = saved.batch;
  } catch (_) {}
  function saveFilters() { try { localStorage.setItem(FILTER_KEY, JSON.stringify({ date: selected, order, batch: selectedBatch })); } catch (_) {} }
  const esc = value => window.App.escapeHtml(value);
  function batches() { return window.Store.content.noteBatches || []; }
  function latest() { return batches()[0] || null; }
  function lessonDate(value) {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(value || ''));
    if (!m) return '';
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (date.getUTCFullYear() !== Number(m[1]) || date.getUTCMonth() + 1 !== Number(m[2]) || date.getUTCDate() !== Number(m[3])) return '';
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  function dateLabel(date) {
    if (!date) return '学習日未記録';
    const [year, month, day] = date.split('-');
    return `${year}年${Number(month)}月${Number(day)}日`;
  }
  function itemsByDate() {
    const items = [], seen = new Set();
    const add = item => {
      const occurrence = item.occurrence || item.key + ':' + item.lessonDate;
      if (!seen.has(occurrence)) { seen.add(occurrence); items.push(item); }
    };
    // Preserve each submission, including repeated expressions with no lesson date.
    // Canonical IDs and audio stay shared; submission translations stay separate.
    batches().forEach(batch => batch.items.forEach(item => {
      const source = window.Store.resolveKey(item.key);
      if (source) add(Object.assign({}, source, item, { lessonDate: lessonDate(batch.lesson_date),
        batchId: batch.id, addedOn: batch.added_on, batchTitle: batch.title, occurrence: batch.id + ':' + item.key }));
    }));
    window.Store.content.notes.forEach(note => {
      const batch = batches().find(b => b.id === note.source_batch);
      const date = lessonDate(batch ? batch.lesson_date : note.date);
      if (items.some(item => item.key === 'n' + note.id && item.lessonDate === date)) return;
      // If a batch's learning date is unknown, do not mistake its upload date for it.
      add({ key: 'n' + note.id, en: note.en, ja: note.ja, note: note.note,
        lessonDate: date, section: '' });
    });
    return items;
  }
  function compareDates(a, b) {
    if (!a) return b ? 1 : 0;
    if (!b) return -1;
    return order === 'oldest' ? a.localeCompare(b) : b.localeCompare(a);
  }
  function render(container) {
    const params = new URLSearchParams(location.search);
    if (params.has('batch')) {
      selectBatch(params.get('batch'));
      const url = new URL(location.href); url.searchParams.delete('batch'); history.replaceState(history.state, '', url);
    }
    const all = itemsByDate();
    const counts = new Map();
    all.forEach(item => { const date = item.lessonDate || 'unknown'; counts.set(date, (counts.get(date) || 0) + 1); });
    const dates = [...counts.keys()].filter(date => date !== 'unknown').sort((a, b) => compareDates(a, b));
    if (counts.has('unknown')) dates.push('unknown');
    if (selected === null || (selected !== 'all' && !counts.has(selected))) selected = [...counts.keys()].filter(date => date !== 'unknown').sort().pop() || 'all';
    const chosenBatch = batches().find(batch => batch.id === selectedBatch);
    const items = all.filter(item => (!chosenBatch || item.batchId === selectedBatch) && (selected === 'all' || (item.lessonDate || 'unknown') === selected))
      .sort((a, b) => compareDates(a.lessonDate, b.lessonDate));
    const title = chosenBatch ? chosenBatch.title : selected === 'all' ? 'これまでのレッスンノート' : selected === 'unknown' ? '学習日未記録のノート' : dateLabel(selected) + 'のノート';
    container.innerHTML = `<section class="notes-page">
      <header class="notes-heading"><p class="studio-eyebrow">YOUR LESSON NOTES</p><h1>学んだ言葉を、<br>毎日の英語に。</h1><p>英文と和訳を振り返る。聞いて、声に出して、自分の言葉に。</p></header>
      <div class="notes-filters"><label class="notes-search">追加された教材<select id="notes-batch"><option value="all">すべての追加分と元のノート</option>${batches().map(batch => `<option value="${esc(batch.id)}" ${batch.id === selectedBatch ? 'selected' : ''}>${esc(batch.added_on)} · ${esc(batch.title)}（${batch.items.length}件）</option>`).join('')}</select></label><button id="notes-catalog" class="notes-secondary">全教材・原資料を探す</button></div>
      <div class="notes-filters"><label>学んだ日<select id="notes-date"><option value="all" ${selected === 'all' ? 'selected' : ''}>すべての学習日（${all.length}件）</option>${dates.map(date => `<option value="${esc(date)}" ${date === selected ? 'selected' : ''}>${dateLabel(date === 'unknown' ? '' : date)} · ${counts.get(date)}件</option>`).join('')}</select></label><label>並び順<select id="notes-order"><option value="newest" ${order === 'newest' ? 'selected' : ''}>新しい順</option><option value="oldest" ${order === 'oldest' ? 'selected' : ''}>古い順</option></select></label><label class="notes-search">英語・日本語で検索<input id="notes-q" type="search" value="${esc(query)}" placeholder="表現や文法のメモを探す" /></label></div>
      <div class="notes-batch-info"><h2>${esc(title)}</h2><p>学んだ日の${order === 'oldest' ? '古い順' : '新しい順'}に表示</p><p id="notes-count" role="status"></p></div>
      <div class="notes-actions"><button id="notes-listen" class="studio-primary">${window.App.icon('listen')} 聞き流す</button><button id="notes-practice" class="notes-secondary">${window.App.icon('speaking')} 発音を練習</button></div>
      <div id="notes-list"></div><button id="notes-more" class="notes-secondary" hidden>さらに表示</button>
    </section>`;
    let limit = 60;
    const matching = () => {
      const q = query.trim().toLocaleLowerCase();
      return q ? items.filter(i => [i.en, i.ja, i.note, i.section, i.addedOn, i.batchTitle].some(value => String(value || '').toLocaleLowerCase().includes(q))) : items;
    };
    function drawList() {
      const filtered = matching();
      let group = null;
      container.querySelector('#notes-list').innerHTML = filtered.slice(0, limit).map(item => {
        const label = dateLabel(item.lessonDate) + (item.addedOn ? ' · 追加 ' + item.addedOn : '') + (item.section ? ' · ' + item.section : '');
        const heading = label !== group ? `<h3 class="notes-section">${esc(label)}</h3>` : '';
        group = label;
        return `${heading}<article class="note-entry" data-note-key="${esc(item.key)}" data-note-date="${item.lessonDate}"><div class="note-entry-main"><p class="note-en" lang="en">${esc(item.en)}</p><p class="note-ja">${esc(item.ja)}</p>${item.note ? `<p class="note-explanation">${esc(item.note)}</p>` : ''}</div><button class="note-play" data-note-play="${esc(item.key)}" aria-label="${esc(item.en)} を聞く">${window.App.icon('listen')}</button></article>`;
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
      window.App.drill = { mode, title, back: 'notes', items: list.map(item => Object.assign({}, item, { group: dateLabel(item.lessonDate) + (item.section ? ' · ' + item.section : '') })) };
      window.App.navigate('drill');
    }
    container.querySelector('#notes-batch').onchange = e => { window.Speech.stopSpeaking(); selectBatch(e.target.value); render(container); };
    container.querySelector('#notes-catalog').onclick = () => window.App.navigate('dict');
    container.querySelector('#notes-date').onchange = e => { window.Speech.stopSpeaking(); selected = e.target.value; selectedBatch = 'all'; saveFilters(); render(container); };
    container.querySelector('#notes-order').onchange = e => { window.Speech.stopSpeaking(); order = e.target.value; saveFilters(); render(container); };
    container.querySelector('#notes-q').oninput = e => { query = e.target.value; limit = 60; drawList(); };
    container.querySelector('#notes-listen').onclick = () => practice('listen');
    container.querySelector('#notes-practice').onclick = () => practice('speak');
    container.querySelector('#notes-more').onclick = () => { limit += 60; drawList(); };
    drawList();
  }
  function selectBatch(id) { selectedBatch = batches().some(b => b.id === id) ? id : 'all'; selected = 'all'; query = ''; saveFilters(); }
  window.NotesView = { render, latest, selectBatch, onLeave() { window.Speech.stopSpeaking(); } };
})();
