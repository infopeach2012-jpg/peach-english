/* Complete catalog: lessons, submission history and labeled source records. */
(function () {
  'use strict';
  let catalog = null, query = '', kind = 'all', limit = 60, epoch = 0;
  const esc = value => window.App.escapeHtml(String(value || ''));
  const norm = text => String(text || '').normalize('NFKC').replace(/’/g, "'").toLowerCase();
  function stop() { epoch++; window.Speech.stopSpeaking(); }
  async function render(container) {
    stop();
    const ticket = epoch, params = new URLSearchParams(location.search);
    if (params.has('q')) { query = params.get('q'); kind = 'all'; limit = 60; }
    container.innerHTML = '<p class="catalog-loading">全教材を読み込んでいます…</p>';
    try {
      if (!catalog) {
        const response = await fetch('data/catalog.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('load');
        catalog = await response.json();
      }
      if (ticket !== epoch) return;
      draw(container);
    } catch (_) {
      if (ticket !== epoch) return;
      container.innerHTML = '<p>全教材を読み込めませんでした。</p><button class="notes-secondary" id="dict-retry">再読み込み</button>';
      container.querySelector('#dict-retry').onclick = () => render(container);
    }
  }
  function filtered() {
    const q = norm(query.trim());
    return catalog.items.filter(row => (kind === 'all' || row.kind === kind) &&
      (!q || norm([row.en,row.ja,row.note,row.tags,row.section,row.sourceLabel,row.date,row.added_on,row.id].join(' ')).includes(q)));
  }
  function rowHtml(row) {
    const source = row.kind === 'documents', unverified = ['ocr','legacy'].includes(row.kind);
    return `<article class="catalog-entry ${unverified ? 'catalog-unverified' : ''}" data-catalog-id="${esc(row.id)}">
      <div class="catalog-meta">${esc(catalog.labels[row.kind])}${row.date ? ' · '+esc(row.date) : ''}${row.added_on ? ' · 追加 '+esc(row.added_on) : ''}</div>
      ${row.en ? `<p class="catalog-en" lang="en">${esc(row.en)}</p>` : ''}
      ${row.ja ? `<p class="catalog-ja">${esc(row.ja)}</p>` : ''}
      ${row.note ? source ? `<details><summary>${esc(row.sourceLabel)} · 全文を読む</summary><pre class="catalog-source">${esc(row.note)}</pre></details>` : `<p class="catalog-note">${esc(row.note)}</p>` : ''}
      <p class="catalog-origin">${esc(row.section || row.sourceLabel)}</p>
      <div class="catalog-controls">
        ${row.parts && row.parts.length ? `<button data-say="${esc(row.id)}" class="notes-secondary">英語を聞く</button>${row.ja ? `<button data-ja="${esc(row.id)}" class="notes-secondary">和訳を聞く</button>` : ''}` : ''}
        ${row.favoriteKey ? `<button data-star="${esc(row.favoriteKey)}" class="notes-secondary" aria-pressed="${window.Store.isFavorite(row.favoriteKey)}">${window.Store.isFavorite(row.favoriteKey) ? '★' : '☆'} お気に入り</button>` : ''}
        <a href="${esc(row.source)}" class="catalog-source-link">出典を見る</a>
      </div></article>`;
  }
  function draw(container) {
    const audit = catalog.audit;
    container.innerHTML = `<section class="catalog-page">
      <button class="studio-text-link" id="dict-home">← ホーム</button>
      <header class="notes-heading"><p class="studio-eyebrow">ALL YOUR MATERIALS</p><h1>全教材・原資料</h1><p>英語・和訳・説明を、すべての教材から検索できます。</p></header>
      <p class="catalog-summary">教材 ${audit.teaching_records.toLocaleString()}件 · 提出記録 ${audit.batch_occurrences}件 · OCR原文 ${audit.counts.ocr}件 · 旧版の原文 ${audit.counts.legacy}件 · 原資料 ${audit.counts.documents}件</p>
      <div class="catalog-tools"><a href="docs/catalog/all-data.csv" download>全件をCSVで保存</a><a href="docs/catalog/all-data.md" download>全件を文章で保存</a><button id="dict-stop" class="notes-secondary">音声を停止</button></div>
      <div class="catalog-shortcuts"><button id="dict-health" class="notes-secondary">健康・体調を探す</button><button id="dict-recovery" class="notes-secondary">体調が良くなった</button></div>
      <div class="notes-filters"><label class="notes-search">英語・日本語・説明で検索<input id="dict-q" type="search" value="${esc(query)}" placeholder="例：回復、caffeine、11月12日追加" /></label><label>表示する資料<select id="dict-kind"><option value="all">すべて（${catalog.items.length}件）</option>${Object.entries(catalog.labels).map(([key,label])=>`<option value="${key}" ${kind===key?'selected':''}>${esc(label)}（${audit.counts[key] || 0}件）</option>`).join('')}</select></label></div>
      <p id="dict-count" role="status"></p><div id="dict-list"></div><button id="dict-more" class="notes-secondary" hidden>さらに60件表示</button>
      <details class="catalog-scope"><summary>収録範囲と確認状況</summary><p>${esc(audit.scope)}</p><p>提出記録は同じ表現の再提出も別々に残しています。OCR原文は誤認識を含む可能性があり、読み上げの対象にしていません。</p><a href="docs/catalog/audit.json">照合結果を見る</a></details>
    </section>`;
    function list() {
      const rows = filtered();
      container.querySelector('#dict-count').textContent = `${rows.length.toLocaleString()}件 / 全${catalog.items.length.toLocaleString()}記録`;
      container.querySelector('#dict-list').innerHTML = rows.slice(0,limit).map(rowHtml).join('') || '<p class="notes-empty">一致する記録はありません。</p>';
      container.querySelector('#dict-more').hidden = rows.length <= limit;
      container.querySelectorAll('[data-say]').forEach(button => button.onclick = async () => {
        stop(); const ticket = epoch;
        const row = rows.find(r => r.id === button.dataset.say);
        window.Speech.unlockAudio();
        for (const part of row.parts) {
          if (ticket !== epoch) return;
          const ok = await window.Speech.speak(part.en, { key: part.key });
          if (ticket !== epoch) return;
          if (ok === false) { window.App.toast('音声を再生できませんでした'); return; }
        }
      });
      container.querySelectorAll('[data-ja]').forEach(button => button.onclick = () => {
        stop(); const row = rows.find(r => r.id === button.dataset.ja);
        window.Speech.unlockAudio(); window.Speech.speak(row.ja, { lang: 'ja', rate: 1.1 });
      });
      container.querySelectorAll('[data-star]').forEach(button => button.onclick = () => { window.Store.toggleFavorite(button.dataset.star); list(); });
    }
    function search(value) {
      stop(); query=value; limit=60;
      const url=new URL(location.href);
      if (query) url.searchParams.set('q',query); else url.searchParams.delete('q');
      history.replaceState(history.state,'',url);
      list();
    }
    container.querySelector('#dict-q').oninput = e => search(e.target.value);
    container.querySelector('#dict-kind').onchange = e => { stop(); kind=e.target.value; limit=60; list(); };
    container.querySelector('#dict-more').onclick = () => { limit+=60; list(); };
    container.querySelector('#dict-stop').onclick = stop;
    container.querySelector('#dict-home').onclick = () => window.App.navigate('home');
    for (const [id,value] of [['dict-health','健康・体調'],['dict-recovery','体調が良くなった']]) {
      container.querySelector('#'+id).onclick = () => { kind='all'; container.querySelector('#dict-kind').value='all'; container.querySelector('#dict-q').value=value; search(value); };
    }
    list();
  }
  window.DictView = { render, onLeave: stop };
})();
