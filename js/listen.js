/* listen.js — 聞き流し（フレーズを場面別に連続再生／長文を文ごとに自動で進める）
 * window.ListenView
 */
(function () {
  'use strict';

  // 場面の一覧（data/situations.json のキーと対応）
  const SITS = [
    { key: 'greet', emoji: '👋', label: 'あいさつ・雑談' },
    { key: 'work', emoji: '💼', label: '仕事・職場' },
    { key: 'food', emoji: '🍽️', label: '食事・レストラン' },
    { key: 'shop', emoji: '🛍️', label: '買い物・お金' },
    { key: 'health', emoji: '🩺', label: '健康・体調' },
    { key: 'travel', emoji: '🚃', label: '旅行・交通' },
    { key: 'home', emoji: '🏠', label: '家・暮らし' },
    { key: 'hobby', emoji: '⚽', label: '趣味・休日' },
    { key: 'study', emoji: '📝', label: '学校・学習' },
    { key: 'plan', emoji: '📅', label: '予定・約束' },
    { key: 'feel', emoji: '💭', label: '気持ち・意見' },
    { key: 'people', emoji: '👨‍👩‍👧', label: '家族・人間関係' },
    { key: 'tech', emoji: '📱', label: '電話・スマホ' },
    { key: 'grammar', emoji: '🔤', label: '単語・文法メモ' },
  ];

  const SETTINGS_KEY = 'speak.listen.v1';
  let settings = { tab: 'phrase', sit: 'greet', rate: 1, ja: true, repeat: 1, kind: 'all', matKey: null, gap: 0.8, pattern: 'std' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* noop */ }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* noop */ } }

  // 再生状態
  let queue = [];        // [{en, ja, key, el?}]
  let idx = 0;
  let playing = false;
  let session = 0;       // 再生ループの世代（停止・切替で無効化する）
  let container = null;
  let listenedThisRun = 0;

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---- フレーズ側のキュー ----
  function phraseItems(sitKey) {
    const C = window.Store.content;
    const out = [];
    C.phrases.forEach((p) => {
      if (sitKey !== 'all' && p.sit !== sitKey) return;
      if (settings.kind === 'word' && p.kind !== 'word') return;
      if (settings.kind === 'sentence' && p.kind !== 'sentence') return;
      out.push({ en: p.en, ja: p.ja, key: 'p' + p.id });
    });
    if (settings.kind !== 'word') {
      C.dialogues.forEach((d) => {
        if (sitKey !== 'all' && d.sit !== sitKey) return;
        out.push({ en: d.a, ja: d.aJa, key: 'd' + d.id + 'a' });
        out.push({ en: d.b, ja: d.bJa, key: 'd' + d.id + 'b' });
      });
    }
    return out;
  }
  function sitCount(sitKey) { return phraseItems(sitKey).length; }

  // ---- 長文側の教材 ----
  function splitSentences(text) {
    const parts = (text || '').match(/[^.!?]+[.!?]*/g) || [text];
    return parts.map((s) => s.trim()).filter(Boolean);
  }
  function materials() {
    const C = window.Store.content;
    const mats = [];
    C.reading.forEach((r) => mats.push({ key: 'r' + r.id, group: '🚗 東北旅行', title: r.section, en: r.en, ja: r.ja }));
    // スピーチは同じセクション名のものを1章にまとめる
    const groups = {};
    C.speeches.forEach((s) => {
      const g = s.section || 'スピーチ';
      if (!groups[g]) { groups[g] = { key: 's' + s.id, group: '🎤 スピーチ', title: g, en: '', ja: '' }; mats.push(groups[g]); }
      groups[g].en += (groups[g].en ? ' ' : '') + s.en;
      groups[g].ja += (groups[g].ja ? ' ' : '') + s.ja;
    });
    return mats;
  }

  // ---- 描画 ----
  function render(c) {
    container = c;
    draw();
  }

  function draw() {
    stop();
    const isPhrase = settings.tab === 'phrase';
    container.innerHTML = `
      <div class="flex gap-2 mb-4">
        <button data-tab="phrase" class="flex-1 rounded-xl py-2.5 text-sm font-bold ${isPhrase ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">💬 フレーズ・単語</button>
        <button data-tab="text" class="flex-1 rounded-xl py-2.5 text-sm font-bold ${!isPhrase ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">📖 長文</button>
      </div>
      <div id="ls-body"></div>
    `;
    container.querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => { settings.tab = b.dataset.tab; saveSettings(); draw(); };
    });
    if (isPhrase) drawPhrase(container.querySelector('#ls-body'));
    else drawText(container.querySelector('#ls-body'));
  }

  function player(extra) {
    return `
      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <div class="flex items-center justify-between text-xs font-semibold text-gray-500 mb-1">
          <span id="ls-pos">— / —</span><span id="ls-sub"></span>
        </div>
        <div class="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden"><div id="ls-bar" class="h-full brand-grad rounded-full" style="width:0%"></div></div>
        <div id="ls-en" class="text-[22px] font-bold text-gray-800 leading-snug min-h-[64px]" style="text-wrap:balance">再生を押すと順に流れます</div>
        <div id="ls-ja" class="text-sm text-gray-500 mt-2 min-h-[20px]"></div>
        <div class="flex items-center justify-center gap-5 mt-5">
          <button id="ls-prev" class="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-xl" aria-label="前へ">⏮</button>
          <button id="ls-play" class="w-20 h-20 rounded-full brand-grad text-white text-3xl shadow-lg" aria-label="再生">▶</button>
          <button id="ls-next" class="w-12 h-12 rounded-full bg-gray-100 text-gray-700 text-xl" aria-label="次へ">⏭</button>
        </div>
        ${extra || ''}
      </div>`;
  }

  function settingsRow() {
    const seg = (name, opts, cur) => `
      <div class="flex rounded-xl bg-gray-100 p-0.5">
        ${opts.map((o) => `<button data-set="${name}" data-val="${o.v}" class="flex-1 rounded-lg py-1.5 text-xs font-bold ${String(cur) === String(o.v) ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}">${o.l}</button>`).join('')}
      </div>`;
    return `
      <div class="mt-4 text-xs">
        <div class="text-gray-400 mb-1">再生のしかた</div>
        ${seg('pattern', [{ v: 'std', l: '英語 → 和訳' }, { v: 'study', l: '英語 → ゆっくり → 和訳 → 英語' }], settings.pattern)}
      </div>
      <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
        <div><div class="text-gray-400 mb-1">速さ</div>${seg('rate', [{ v: 0.8, l: 'ゆっくり' }, { v: 1, l: '普通' }, { v: 1.2, l: '速め' }], settings.rate)}</div>
        <div><div class="text-gray-400 mb-1">和訳の読み上げ</div>${seg('ja', [{ v: true, l: 'あり' }, { v: false, l: 'なし' }], settings.ja)}</div>
        <div><div class="text-gray-400 mb-1">1文の繰り返し</div>${seg('repeat', [{ v: 1, l: '1回' }, { v: 2, l: '2回' }, { v: 3, l: '3回' }], settings.repeat)}</div>
        <div><div class="text-gray-400 mb-1">文の間</div>${seg('gap', [{ v: 0.3, l: '短め' }, { v: 0.8, l: '普通' }, { v: 1.5, l: '長め' }], settings.gap)}</div>
      </div>
      ${voiceRow()}`;
  }

  // 英語の声の選択（端末に入っている音声から）
  function voiceRow() {
    const vs = window.Speech.listVoices ? window.Speech.listVoices() : [];
    const src = window.Speech.getSource ? window.Speech.getSource() : 'clip';
    const srcRow = `
      <div class="mt-3 text-xs">
        <div class="text-gray-400 mb-1">声の種類</div>
        <div class="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1">
          <button data-src="clip" class="ls-src rounded-lg py-2 font-bold ${src === 'clip' ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}">作った音声</button>
          <button data-src="device" class="ls-src rounded-lg py-2 font-bold ${src === 'device' ? 'bg-white text-brand shadow-sm' : 'text-gray-500'}">iPad の声</button>
        </div>
      </div>`;
    if (src === 'clip' && window.Speech.clipsLoaded) return srcRow + `<div class="mt-2 text-xs text-gray-400">🎧 作った音声で再生します。無い文だけ端末の声になります。</div>`;
    if (!vs.length) return srcRow;
    const good = vs.some((v) => v.score >= 20);
    return srcRow + `
      <div class="mt-3 text-xs">
        <div class="flex items-center justify-between mb-1">
          <span class="text-gray-400">英語の声</span>
          <button id="ls-voicetest" class="text-brand font-bold">🔊 試聴</button>
        </div>
        <select id="ls-voice" class="w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
          ${vs.map((v) => `<option value="${window.App.escapeHtml(v.name)}" ${v.current ? 'selected' : ''}>${window.App.escapeHtml(v.name)}（${window.App.escapeHtml(v.lang)}）${v.score >= 20 ? ' ★' : ''}</option>`).join('')}
        </select>
        ${good ? '' : `<div class="text-gray-400 mt-1 leading-relaxed">★の自然な声がありません。iPad の「設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 英語」で、Ava・Zoe などの「プレミアム」版をダウンロードすると、ここに出てきます。</div>`}
      </div>`;
  }
  function bindVoice(root) {
    root.querySelectorAll('.ls-src').forEach((b) => {
      b.onclick = () => { stop(); window.Speech.setSource(b.dataset.src); window.App.toast(b.dataset.src === 'device' ? 'iPad の声にしました' : '作った音声にしました'); window.App.navigate('listen'); };
    });
    const sel = root.querySelector('#ls-voice');
    if (!sel) return;
    sel.onchange = () => { window.Speech.setVoice(sel.value); window.App.toast('声を変えました'); };
    root.querySelector('#ls-voicetest').onclick = () => { stop(); window.Speech.speak("Hi! Let's get started. How's your day going?", { rate: settings.rate }); };
  }

  function bindSettings(root, onChange) {
    bindVoice(root);
    root.querySelectorAll('[data-set]').forEach((b) => {
      b.onclick = () => {
        const n = b.dataset.set, v = b.dataset.val;
        settings[n] = n === 'ja' ? v === 'true' : (isNaN(Number(v)) ? v : Number(v));
        saveSettings();
        onChange();
      };
    });
  }

  function bindPlayer(root, buildQueue) {
    root.querySelector('#ls-play').onclick = () => { if (playing) pause(); else play(buildQueue); };
    root.querySelector('#ls-next').onclick = () => jump(1, buildQueue);
    root.querySelector('#ls-prev').onclick = () => jump(-1, buildQueue);
  }

  // ---- フレーズ画面 ----
  function drawPhrase(body) {
    const all = sitCount('all');
    body.innerHTML = `
      <div class="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        <button data-sit="all" class="chip whitespace-nowrap ${settings.sit === 'all' ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">🔀 すべて ${all}</button>
        ${SITS.map((s) => {
          const n = sitCount(s.key);
          if (!n) return '';
          return `<button data-sit="${s.key}" class="chip whitespace-nowrap ${settings.sit === s.key ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">${s.emoji} ${s.label} ${n}</button>`;
        }).join('')}
      </div>
      <div class="flex gap-2 mb-4">
        ${[['all', '文も単語も'], ['sentence', '文だけ'], ['word', '単語だけ']].map(([v, l]) => `<button data-kind="${v}" class="chip ${settings.kind === v ? 'bg-violet-100 text-brand' : 'bg-gray-50 text-gray-500'}">${l}</button>`).join('')}
      </div>
      ${player(settingsRow())}
      <div id="ls-list" class="space-y-1"></div>
    `;
    body.querySelectorAll('[data-sit]').forEach((b) => { b.onclick = () => { settings.sit = b.dataset.sit; saveSettings(); draw(); }; });
    body.querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => { settings.kind = b.dataset.kind; saveSettings(); draw(); }; });
    bindSettings(body, () => drawPhrase(body));

    queue = phraseItems(settings.sit);
    idx = 0;
    const list = body.querySelector('#ls-list');
    list.innerHTML = queue.map((q, i) => `
      <button data-i="${i}" class="ls-row w-full text-left rounded-xl px-3 py-2 bg-white border border-gray-100">
        <div class="text-sm font-semibold text-gray-800">${window.App.escapeHtml(q.en)}</div>
        <div class="text-xs text-gray-400">${window.App.escapeHtml(q.ja)}</div>
      </button>`).join('');
    list.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { idx = Number(b.dataset.i); play(); }; });
    const sitLabel = settings.sit === 'all' ? 'すべて' : (SITS.find((s) => s.key === settings.sit) || {}).label;
    body.querySelector('#ls-sub').textContent = sitLabel;
    updatePos();
    bindPlayer(body);
  }

  // ---- 長文画面 ----
  function drawText(body) {
    const mats = materials();
    if (!settings.matKey || !mats.find((m) => m.key === settings.matKey)) settings.matKey = mats[0] && mats[0].key;
    const groups = [];
    mats.forEach((m) => { let g = groups.find((x) => x.name === m.group); if (!g) { g = { name: m.group, items: [] }; groups.push(g); } g.items.push(m); });
    body.innerHTML = `
      ${groups.map((g) => `
        <div class="text-xs font-bold text-gray-400 mb-1 mt-2">${g.name}</div>
        <div class="flex gap-2 mb-2 overflow-x-auto pb-1 -mx-1 px-1">
          ${g.items.map((m) => `<button data-mat="${m.key}" class="chip whitespace-nowrap ${m.key === settings.matKey ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">${window.App.escapeHtml(m.title)}</button>`).join('')}
        </div>`).join('')}
      <div class="mt-2">${player(settingsRow())}</div>
      <div class="text-xs text-gray-400 mb-2">最後まで読むと、次の章へ自動で進みます</div>
      <div id="ls-text" class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm leading-relaxed text-[15px] text-gray-800"></div>
      <button id="ls-jatoggle" class="text-xs text-gray-400 underline mt-3">和訳を表示</button>
      <div id="ls-jatext" class="hidden-x text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mt-2"></div>
    `;
    body.querySelectorAll('[data-mat]').forEach((b) => { b.onclick = () => { settings.matKey = b.dataset.mat; saveSettings(); draw(); }; });
    bindSettings(body, () => drawText(body));
    body.querySelector('#ls-jatoggle').onclick = (e) => {
      const t = body.querySelector('#ls-jatext');
      t.classList.toggle('hidden-x');
      e.target.textContent = t.classList.contains('hidden-x') ? '和訳を表示' : '和訳を隠す';
    };
    loadMaterial(body, settings.matKey);
    bindPlayer(body);
  }

  function loadMaterial(body, key) {
    const mats = materials();
    const mat = mats.find((m) => m.key === key);
    if (!mat) return;
    settings.matKey = key; saveSettings();
    body.querySelectorAll('[data-mat]').forEach((b) => {
      const on = b.dataset.mat === key;
      b.classList.toggle('brand-grad', on); b.classList.toggle('text-white', on);
      b.classList.toggle('bg-gray-100', !on); b.classList.toggle('text-gray-600', !on);
    });
    const sents = splitSentences(mat.en);
    queue = sents.map((s, i) => ({ en: s, ja: '', key: mat.key + '_' + i }));
    idx = 0;
    const tx = body.querySelector('#ls-text');
    tx.innerHTML = sents.map((s, i) => `<span data-i="${i}" class="ls-sent rounded px-0.5">${window.App.escapeHtml(s)}</span>`).join(' ');
    tx.querySelectorAll('[data-i]').forEach((el) => { el.onclick = () => { idx = Number(el.dataset.i); play(); }; });
    body.querySelector('#ls-jatext').textContent = mat.ja;
    body.querySelector('#ls-sub').textContent = mat.title;
    body.querySelector('#ls-en').textContent = sents[0] || '';
    body.querySelector('#ls-ja').textContent = '';
    updatePos();
  }

  // 長文: 章の最後まで来たら次の章へ
  function nextMaterial() {
    const mats = materials();
    const i = mats.findIndex((m) => m.key === settings.matKey);
    if (i < 0 || i + 1 >= mats.length) return false;
    loadMaterial(container.querySelector('#ls-body'), mats[i + 1].key);
    return true;
  }

  // ---- 再生制御 ----
  function updatePos() {
    const pos = container.querySelector('#ls-pos');
    const bar = container.querySelector('#ls-bar');
    if (pos) pos.textContent = queue.length ? `${idx + 1} / ${queue.length}` : '0 / 0';
    if (bar) bar.style.width = queue.length ? `${((idx + 1) / queue.length) * 100}%` : '0%';
    container.querySelectorAll('.ls-row, .ls-sent').forEach((el) => el.classList.toggle('ls-now', Number(el.dataset.i) === idx));
  }
  function showCurrent() {
    const q = queue[idx];
    if (!q) return;
    const en = container.querySelector('#ls-en'), ja = container.querySelector('#ls-ja');
    if (en) en.textContent = q.en;
    if (ja) ja.textContent = q.ja || '';
    updatePos();
    const now = container.querySelector('.ls-now');
    if (now && now.scrollIntoView) now.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function setPlayBtn() {
    const b = container.querySelector('#ls-play');
    if (b) b.textContent = playing ? '⏸' : '▶';
  }

  async function play() {
    if (!queue.length) { window.App.toast('再生するものがありません'); return; }
    if (!window.Speech.ttsSupported) { window.App.toast('この端末は音声読み上げに対応していません'); return; }
    window.Speech.unlockAudio();
    const my = ++session;
    playing = true;
    setPlayBtn();
    while (playing && my === session) {
      if (idx >= queue.length) {
        // 長文は次の章へ、フレーズは先頭へ戻って続ける
        if (settings.tab === 'text' && nextMaterial()) { /* loadMaterial が idx=0 にした */ }
        else idx = 0;
      }
      const q = queue[idx];
      showCurrent();
      if (queue[idx + 1] && window.Speech.prefetchClip) window.Speech.prefetchClip(queue[idx + 1].key);
      const alive = () => playing && my === session;
      for (let r = 0; r < settings.repeat && alive(); r++) {
        await window.Speech.speak(q.en, { rate: settings.rate, key: q.key });
        if (r + 1 < settings.repeat && alive()) await sleep(300);
      }
      if (settings.pattern === 'study' && alive()) {
        // 学習パターン: 英語 → ゆっくり → 和訳（あれば）→ 英語
        await sleep(350);
        if (alive()) await window.Speech.speak(q.en, { rate: settings.rate, key: q.key, slow: true });
      }
      if (settings.ja && q.ja && alive()) {
        await sleep(200);
        await window.Speech.speak(q.ja, { lang: 'ja', rate: 1.1 });
      }
      if (settings.pattern === 'study' && alive()) {
        await sleep(350);
        if (alive()) await window.Speech.speak(q.en, { rate: settings.rate, key: q.key });
      }
      if (!(playing && my === session)) break;
      listenedThisRun++;
      if (listenedThisRun % 5 === 0) { window.Store.recordActivity(1); window.App.refreshHeader(); }
      await sleep(settings.gap * 1000);
      if (!(playing && my === session)) break;
      idx++;
    }
  }
  function pause() {
    playing = false;
    session++;
    window.Speech.stopSpeaking();
    if (window.Speech.releaseAudio) window.Speech.releaseAudio();
    setPlayBtn();
  }
  function stop() { pause(); }
  function jump(d) {
    if (!queue.length) return;
    idx = (idx + d + queue.length) % queue.length;
    if (playing) { session++; window.Speech.stopSpeaking(); playing = false; play(); }
    else showCurrent();
  }

  // 音声一覧は端末によって後から届くので、届いたら設定欄だけ描き直す
  window.addEventListener('speak:voices', () => {
    if (!container || !container.closest('.view.active') || playing) return;
    if (container.querySelector('#ls-voice')) return;
    draw();
  });

  function onLeave() { stop(); }

  window.ListenView = { render, onLeave, SITS };
})();
