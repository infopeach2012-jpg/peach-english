/* shadow.js — 長文・シャドーイング（東北旅行エッセイ／スピーチ練習）
 * window.ShadowView
 */
(function () {
  'use strict';

  let state = null; // { matKey }
  let micRef = {};
  let listening = false;

  function materials() {
    const C = window.Store.content;
    const mats = [];
    if (C.reading.length) {
      mats.push({ key: 'tohoku', title: '東北旅行エッセイ', emoji: '🚗', blocks: C.reading.map((r, i) => ({ id: 'r' + r.id, label: r.section, en: r.en, ja: r.ja })) });
    }
    // スピーチはセクション名でグループ化
    const groups = {};
    C.speeches.forEach((s) => {
      const g = s.section || 'スピーチ';
      (groups[g] = groups[g] || []).push(s);
    });
    Object.entries(groups).forEach(([g, arr], gi) => {
      mats.push({ key: 'sp' + gi, title: g, emoji: '🎤', blocks: arr.map((s) => ({ id: 's' + s.id, label: '', en: s.en, ja: s.ja })) });
    });
    return mats;
  }

  function splitSentences(text) {
    const parts = (text || '').match(/[^.!?]+[.!?]*/g) || [text];
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  function render(container) {
    const mats = materials();
    if (!state) state = { matKey: mats[0] ? mats[0].key : null };
    draw(container, mats);
  }

  function draw(container, mats) {
    mats = mats || materials();
    const mat = mats.find((m) => m.key === state.matKey) || mats[0];
    if (!mat) { container.innerHTML = '<div class="text-center py-20 text-gray-400">教材がありません</div>'; return; }

    // 進捗集計
    let total = 0, done = 0;
    mat.blocks.forEach((b) => {
      splitSentences(b.en).forEach((_, si) => {
        total++;
        if (window.Store.isDone('shadow', b.id + '_' + si)) done++;
      });
    });

    container.innerHTML = `
      <!-- 教材選択 -->
      <div class="flex gap-2 mb-4 overflow-x-auto pb-1">
        ${mats.map((m) => `
          <button data-mat="${m.key}" class="chip whitespace-nowrap ${m.key === mat.key ? 'brand-grad text-white' : 'bg-gray-100 text-gray-600'}">
            ${m.emoji} ${window.App.escapeHtml(m.title)}
          </button>`).join('')}
      </div>

      <div class="flex items-center justify-between mb-1 text-xs font-semibold text-gray-500">
        <span>シャドーイング進捗</span><span>${done} / ${total} 文</span>
      </div>
      <div class="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div class="h-full brand-grad rounded-full" style="width:${total ? (done / total) * 100 : 0}%"></div>
      </div>

      <button id="sh-playall" class="w-full bg-violet-50 text-brand font-bold rounded-xl py-2.5 text-sm mb-4">▶ 全文を通しで再生</button>

      <div id="sh-blocks" class="space-y-4"></div>
    `;

    const wrap = container.querySelector('#sh-blocks');
    mat.blocks.forEach((b) => wrap.appendChild(blockEl(b)));

    container.querySelectorAll('[data-mat]').forEach((btn) => {
      btn.onclick = () => { state.matKey = btn.dataset.mat; window.Speech.stopSpeaking(); draw(container); };
    });
    container.querySelector('#sh-playall').onclick = () => playAll(mat);
  }

  function blockEl(b) {
    const sents = splitSentences(b.en);
    const el = document.createElement('div');
    el.className = 'bg-white border border-gray-100 rounded-2xl p-4 shadow-sm';
    el.innerHTML = `
      ${b.label ? `<div class="chip bg-violet-50 text-brand mb-2">${window.App.escapeHtml(b.label)}</div>` : ''}
      <div class="space-y-2">
        ${sents.map((s, si) => {
          const doneKey = b.id + '_' + si;
          const isDone = window.Store.isDone('shadow', doneKey);
          return `
          <div class="sh-sent flex items-start gap-2" data-en="${window.App.escapeHtml(s)}" data-key="${doneKey}">
            <button class="sh-play mt-0.5 shrink-0 w-7 h-7 rounded-full bg-violet-50 text-brand flex items-center justify-center text-xs">▶</button>
            <button class="sh-mic mt-0.5 shrink-0 w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center text-xs" style="color:var(--brand2)">🎤</button>
            <div class="flex-1 text-[15px] text-gray-800 leading-relaxed">${window.App.escapeHtml(s)}
              <span class="sh-badge ml-1 text-xs font-bold ${isDone ? '' : 'hidden-x'}" style="color:var(--ok)">✓</span>
              <div class="sh-fb text-xs mt-0.5"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <button class="sh-ja text-xs text-gray-400 underline mt-3">和訳を表示</button>
      <div class="sh-ja-text hidden-x text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mt-2">${window.App.escapeHtml(b.ja)}</div>
    `;

    el.querySelector('.sh-ja').onclick = (e) => {
      const t = el.querySelector('.sh-ja-text');
      t.classList.toggle('hidden-x');
      e.target.textContent = t.classList.contains('hidden-x') ? '和訳を表示' : '和訳を隠す';
    };
    el.querySelectorAll('.sh-sent').forEach((row) => {
      const en = row.dataset.en;
      row.querySelector('.sh-play').onclick = () => (window.Speech.unlockAudio(), window.Speech.speak)(en, { rate: 0.9 });
      row.querySelector('.sh-mic').onclick = () => micSentence(row, en);
    });
    return el;
  }

  async function micSentence(row, en) {
    if (!window.Speech.asrSupported) { window.App.toast('音声認識に非対応のブラウザです'); return; }
    if (listening) { if (micRef.stop) micRef.stop(); return; }
    const fb = row.querySelector('.sh-fb');
    const micBtn = row.querySelector('.sh-mic');
    listening = true;
    micBtn.classList.add('listening');
    fb.style.color = '#9ca3af';
    fb.textContent = '🎤 聞き取り中…';
    window.Speech.stopSpeaking();
    micRef = {};
    try {
      const said = await window.Speech.listenOnce({
        ref: micRef,
        onPartial: (t) => { fb.textContent = '🎤 ' + (t || '…'); },
      });
      const res = window.Speech.score(en, said);
      const color = window.App.scoreColor(res.score);
      fb.style.color = color;
      fb.innerHTML = `${res.score}点 ${window.App.scoreLabel(res.score)} — ${res.tokens.map((t) => `<span class="wtok ${t.ok ? 'ok' : 'ng'}">${window.App.escapeHtml(t.word)}</span>`).join(' ')}`;
      window.Store.recordSpeaking('sh', res.score);
      if (res.score >= 60) {
        window.Store.markDone('shadow', row.dataset.key);
        window.Store.save();
        const badge = row.querySelector('.sh-badge');
        if (badge) badge.classList.remove('hidden-x');
      }
      window.App.checkLevelUp();
    } catch (e) {
      fb.style.color = 'var(--bad)';
      fb.textContent = 'もう一度お試しください';
    } finally {
      listening = false;
      micBtn.classList.remove('listening');
    }
  }

  async function playAll(mat) {
    window.Speech.stopSpeaking();
    for (const b of mat.blocks) {
      for (const s of splitSentences(b.en)) {
        await (window.Speech.unlockAudio(), window.Speech.speak)(s, { rate: 0.95 });
      }
    }
  }

  function onLeave() {
    if (micRef.stop) micRef.stop();
    listening = false;
    window.Speech.stopSpeaking();
  }

  window.ShadowView = { render, onLeave };
})();
