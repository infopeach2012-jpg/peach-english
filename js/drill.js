/* drill.js — Speak 風のレッスン画面（1文ずつのカード・上に区切りの進み具合）
 * window.DrillView。開く前に window.App.drill = { mode:'listen'|'speak', items:[{key,en,ja,note,group}], title, back } を入れる。
 *  listen: 英語を自然な速さで読み、（設定で）和訳を読み、自動で次へ。
 *  speak : 英語と和訳を見せて読み上げ、「話す」で録音して採点、「次に進む」で次へ。
 */
(function () {
  'use strict';

  const SET_KEY = 'speak.drill.v1';
  let settings = { ja: false, rate: 1, gap: 0.4, muted: false };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* noop */ }
  function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* noop */ } }

  let container = null;
  let cfg = null;
  let idx = 0;
  let playing = false;
  let session = 0;
  let micRef = {};
  let listening = false;
  let results = {};   // key -> score

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function render(c) {
    container = c;
    cfg = window.App.drill;
    if (!cfg || !cfg.items || !cfg.items.length) { container.innerHTML = '<div class="sp-empty">練習する文がありません。</div>'; return; }
    idx = 0; results = {}; session++;
    drawItem();
    if (cfg.mode === 'listen') playLoop();
    else sayCurrent();
  }

  function segments() {
    const n = cfg.items.length;
    return `<div class="sp-segs">${cfg.items.map((_, i) => `<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}"></span>`).join('')}</div>`;
  }

  function drawItem() {
    const it = cfg.items[idx];
    if (!it) { drawDone(); return; }
    const esc = window.App.escapeHtml;
    const isSpeak = cfg.mode === 'speak';
    container.innerHTML = `
      <div class="sp-drill">
        <div class="sp-drill-top">
          <button id="dr-close" class="sp-round" aria-label="閉じる">✕</button>
          <div class="sp-drill-title">${esc(cfg.title || '')}</div>
          <button id="dr-mute" class="sp-round ${settings.muted ? 'off' : ''}" aria-label="音声のオン・オフ">${settings.muted ? '🔇' : '🔊'}</button>
        </div>
        ${segments()}
        <div class="sp-drill-body">
          <div class="sp-card">
            <div class="sp-card-tools">
              <button id="dr-flag" class="sp-tool" aria-label="苦手に入れる">⚑</button>
              ${isSpeak ? '<button id="dr-mic" class="sp-pill">🎙 話す</button>' : '<span class="sp-pill muted">🎧 聞く</span>'}
              <button id="dr-star" class="sp-tool" aria-label="保存">${window.Store.isFavorite(it.key) ? '★' : '☆'}</button>
            </div>
            <div class="sp-group">${esc(it.group || '')}</div>
            <div class="sp-en" id="dr-en">${esc(it.en)}</div>
            <div class="sp-ja" id="dr-ja">${esc(it.ja || '')}</div>
            <div class="sp-fb" id="dr-fb"></div>
            <div class="sp-card-actions">
              <button id="dr-again" class="sp-btn-ghost">↺ もう一度</button>
              <button id="dr-hint" class="sp-avatar" aria-label="ヒント">🤖</button>
            </div>
          </div>
        </div>
        <div class="sp-drill-ctl">
          <button id="dr-prev" class="sp-round big" aria-label="前へ">↺</button>
          <button id="dr-play" class="sp-round huge" aria-label="再生・一時停止">${playing ? '❚❚' : '▶'}</button>
          <button id="dr-next" class="sp-round big" aria-label="次へ">↻</button>
        </div>
        ${isSpeak ? '<button id="dr-go" class="sp-next">次に進む</button>' : `<div class="sp-sub">${idx + 1} / ${cfg.items.length}　${settings.ja ? '英語 → 和訳' : '英語のみ'}　<button id="dr-ja-toggle" class="sp-link">${settings.ja ? '和訳を読まない' : '和訳も読む'}</button></div>`}
      </div>`;
    const $ = (s) => container.querySelector(s);
    $('#dr-close').onclick = () => { stopAll(); window.App.navigate(cfg.back || 'practice'); };
    $('#dr-mute').onclick = () => { settings.muted = !settings.muted; saveSettings(); drawItem(); };
    $('#dr-star').onclick = (e) => { const on = window.Store.toggleFavorite(it.key); e.target.textContent = on ? '★' : '☆'; window.App.toast(on ? '保存しました' : '保存を外しました'); };
    $('#dr-flag').onclick = () => { window.Store.recordSpeaking(it.key, 40); window.App.toast('苦手に入れました'); };
    $('#dr-again').onclick = () => sayCurrent();
    $('#dr-hint').onclick = () => { const fb = $('#dr-fb'); fb.textContent = it.note ? it.note : (it.ja || ''); fb.className = 'sp-fb hint'; };
    $('#dr-prev').onclick = () => go(-1);
    $('#dr-next').onclick = () => go(1);
    $('#dr-play').onclick = () => { if (cfg.mode === 'listen') { if (playing) pause(); else playLoop(); } else sayCurrent(); };
    const mic = $('#dr-mic'); if (mic) mic.onclick = () => record(it);
    const goBtn = $('#dr-go'); if (goBtn) goBtn.onclick = () => go(1);
    const jt = $('#dr-ja-toggle'); if (jt) jt.onclick = () => { settings.ja = !settings.ja; saveSettings(); drawItem(); };
  }

  function setPlayBtn() { const b = container.querySelector('#dr-play'); if (b) b.textContent = playing ? '❚❚' : '▶'; }

  async function sayCurrent() {
    const it = cfg.items[idx];
    if (!it || settings.muted) return;
    window.Speech.unlockAudio();
    window.Speech.stopSpeaking();
    await window.Speech.speak(it.en, { rate: settings.rate, key: it.key });
  }

  // ---- リスニング: 自動で進む ----
  async function playLoop() {
    const my = ++session;
    playing = true; setPlayBtn();
    window.Speech.unlockAudio();
    const alive = () => playing && my === session;
    while (alive()) {
      const it = cfg.items[idx];
      if (!it) { playing = false; drawDone(); return; }
      if (!settings.muted) await window.Speech.speak(it.en, { rate: settings.rate, key: it.key });
      if (!alive()) return;
      if (settings.ja && it.ja && !settings.muted) { await sleep(150); await window.Speech.speak(it.ja, { lang: 'ja', rate: 1.1 }); }
      if (!alive()) return;
      await sleep(settings.gap * 1000);
      if (!alive()) return;
      results[it.key] = 100;
      window.Store.srsReview(it.key, 4);
      idx++;
      if (idx >= cfg.items.length) { playing = false; drawDone(); return; }
      drawItem();
    }
  }
  function pause() { playing = false; session++; window.Speech.stopSpeaking(); setPlayBtn(); }
  function stopAll() { pause(); if (micRef.stop) micRef.stop(); listening = false; }

  function go(d) {
    stopAll();
    idx = Math.max(0, idx + d);
    if (idx >= cfg.items.length) { drawDone(); return; }
    drawItem();
    if (cfg.mode === 'listen') playLoop(); else sayCurrent();
  }

  // ---- スピーキング: 録音して採点 ----
  async function record(it) {
    if (!window.Speech.asrSupported) { window.App.toast('このブラウザは音声認識に対応していません'); return; }
    const fb = container.querySelector('#dr-fb');
    const mic = container.querySelector('#dr-mic');
    if (listening) { if (micRef.stop) micRef.stop(); return; }
    window.Speech.stopSpeaking();
    listening = true; mic.classList.add('listening'); mic.textContent = '● 聞いています';
    fb.className = 'sp-fb'; fb.textContent = '…';
    micRef = {};
    try {
      const said = await window.Speech.listenOnce({ ref: micRef, onPartial: (t) => { fb.textContent = t || '…'; } });
      const r = window.Speech.score(it.en, said);
      results[it.key] = r.score;
      fb.className = 'sp-fb ' + (r.score >= 80 ? 'good' : r.score >= 60 ? 'ok' : 'bad');
      fb.innerHTML = `<div class="sp-score">${r.score}点 ${window.App.scoreLabel(r.score)}</div><div>${r.tokens.map((t) => `<span class="wtok ${t.ok ? 'ok' : 'ng'}">${window.App.escapeHtml(t.word)}</span>`).join(' ')}</div>`;
      window.Store.recordSpeaking(it.key, r.score);
      window.Store.srsReview(it.key, r.score >= 80 ? 5 : r.score >= 60 ? 4 : 2);
      window.App.checkLevelUp();
      if (r.score >= 80) { await sleep(700); go(1); }
    } catch (e) {
      fb.className = 'sp-fb bad'; fb.textContent = '聞き取れませんでした。もう一度「話す」を押してください';
    } finally {
      listening = false;
      const m = container.querySelector('#dr-mic'); if (m) { m.classList.remove('listening'); m.textContent = '🎙 話す'; }
    }
  }

  function drawDone() {
    stopAll();
    const n = cfg.items.length;
    const scores = Object.values(results);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    window.Store.recordActivity(Math.max(1, Math.round(n / 2)));
    window.App.refreshHeader();
    container.innerHTML = `
      <div class="sp-drill">
        <div class="sp-drill-top"><button id="dr-close" class="sp-round">✕</button><div class="sp-drill-title">${window.App.escapeHtml(cfg.title || '')}</div><span></span></div>
        <div class="sp-done">
          <div class="sp-done-emoji">${avg >= 80 || cfg.mode === 'listen' ? '🎉' : '💪'}</div>
          <h2>${cfg.mode === 'listen' ? `${n} 文を聞きました` : `${scores.length} / ${n} 文を話しました`}</h2>
          ${cfg.mode === 'speak' && scores.length ? `<p>平均 ${avg} 点</p>` : '<p>復習の予定に入れました。明日また出ます。</p>'}
          <div class="sp-done-actions">
            <button id="dr-redo" class="sp-next">もう一度</button>
            <button id="dr-back" class="sp-btn-ghost">練習に戻る</button>
          </div>
        </div>
      </div>`;
    container.querySelector('#dr-close').onclick = () => window.App.navigate(cfg.back || 'practice');
    container.querySelector('#dr-back').onclick = () => window.App.navigate(cfg.back || 'practice');
    container.querySelector('#dr-redo').onclick = () => render(container);
  }

  function onLeave() { stopAll(); }

  window.DrillView = { render, onLeave, settings };
})();
