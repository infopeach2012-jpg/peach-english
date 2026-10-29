/* smart.js — スマートレビュー（Speak 風）。window.SmartView
 * 習熟度スコア → スピーキング／リスニング → 5〜25分 → 概念（場面）ごとの一覧 → 復習スタート
 */
(function () {
  'use strict';

  const SET_KEY = 'speak.smart.v1';
  let settings = { mode: 'listen', minutes: 10, groups: {} };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* noop */ }
  function save() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { /* noop */ } }

  // 1分あたりの文の数（リスニングは自動で流れるので多め）
  const PER_MIN = { listen: 5, speak: 2 };

  function groups() {
    const S = window.Store, C = S.content;
    const SITS = (window.ListenView && window.ListenView.SITS) || [];
    const by = {};
    C.phrases.forEach((p) => {
      const k = p.sit || 'grammar';
      if (!by[k]) by[k] = { key: k, items: [] };
      by[k].items.push({ key: 'p' + p.id, en: p.en, ja: p.ja, note: p.note, kind: p.kind });
    });
    C.dialogues.forEach((d) => {
      const k = d.sit || 'greet';
      if (!by[k]) by[k] = { key: k, items: [] };
      by[k].items.push({ key: 'd' + d.id, en: d.b, ja: d.bJa, note: d.note, kind: 'sentence', askEn: d.a });
    });
    return SITS.filter((s) => by[s.key]).map((s) => {
      const g = by[s.key];
      let sum = 0;
      g.items.forEach((it) => { sum += mastery(it.key); });
      return { key: s.key, label: s.emoji + ' ' + s.label, items: g.items, pct: g.items.length ? Math.round(sum / g.items.length) : 0 };
    });
  }

  function mastery(key) {
    const S = window.Store;
    const s = S.srsState(key);
    let m = s ? Math.min(100, s.reps * 25 + (s.lastScore >= 4 ? 10 : 0)) : 0;
    const spk = (S.progress.speaking || []).filter((r) => r.key === key).slice(-1)[0];
    if (spk && spk.score >= 80) m = Math.max(m, 70);
    return m;
  }

  function overall(gs) {
    let n = 0, sum = 0;
    gs.forEach((g) => { n += g.items.length; sum += g.pct * g.items.length; });
    return n ? Math.round(sum / n) : 0;
  }

  function ring(pct) {
    const R = 16, C = 2 * Math.PI * R;
    return `<svg class="sp-ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${R}"/><circle cx="20" cy="20" r="${R}" class="val" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/></svg>`;
  }

  function render(container) {
    const gs = groups();
    const esc = window.App.escapeHtml;
    const sel = (k) => settings.groups[k] !== false;
    container.innerHTML = `
      <div class="sp-page">
        <h1 class="sp-h1">スマートレビュー</h1>
        <p class="sp-lead">習熟度と間隔反復で、いま復習すべき文を選びます。聞くだけでも、声に出しても。</p>
        <div class="sp-card sp-row-card">
          <div><div class="sp-label">習熟度スコア： <b>${overall(gs)}%</b></div><div class="sp-track"><span style="width:${overall(gs)}%"></span></div></div>
        </div>
        <div class="sp-card">
          <div class="sp-seg2">
            <button data-mode="speak" class="${settings.mode === 'speak' ? 'on' : ''}">🎙 スピーキング</button>
            <button data-mode="listen" class="${settings.mode === 'listen' ? 'on' : ''}">🎧 リスニング</button>
          </div>
          <div class="sp-mins">${[5, 10, 15, 20, 25].map((m) => `<button data-min="${m}" class="${settings.minutes === m ? 'on' : ''}"><b>${m}</b><span>分</span></button>`).join('')}</div>
          <div class="sp-list">
            ${gs.map((g) => `
              <button data-g="${g.key}" class="sp-item ${sel(g.key) ? '' : 'dim'}">
                ${ring(g.pct)}
                <div class="sp-item-body"><div class="sp-item-title">${esc(g.label)}</div><div class="sp-item-sub">${g.items.length} 文 ・ ${g.pct}% マスターしました</div></div>
                <span class="sp-check">${sel(g.key) ? '✓' : ''}</span>
              </button>`).join('')}
          </div>
        </div>
        <button id="sm-start" class="sp-next">復習スタート</button>
      </div>`;
    container.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { settings.mode = b.dataset.mode; save(); render(container); }; });
    container.querySelectorAll('[data-min]').forEach((b) => { b.onclick = () => { settings.minutes = Number(b.dataset.min); save(); render(container); }; });
    container.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { settings.groups[b.dataset.g] = !sel(b.dataset.g); save(); render(container); }; });
    container.querySelector('#sm-start').onclick = () => start(gs);
  }

  function pick(gs) {
    const S = window.Store;
    const pool = [];
    gs.forEach((g) => { if (settings.groups[g.key] !== false) g.items.forEach((it) => pool.push(Object.assign({ group: g.label.replace(/^\S+\s/, '') }, it))); });
    const { due, fresh } = S.srsDue(pool);
    const n = settings.minutes * PER_MIN[settings.mode];
    const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const rest = pool.filter((x) => !due.includes(x) && !fresh.includes(x));
    return shuffle(due).concat(shuffle(fresh), shuffle(rest)).slice(0, n);
  }

  function start(gs) {
    const items = pick(gs);
    if (!items.length) { window.App.toast('選んだ場面に文がありません'); return; }
    window.App.drill = { mode: settings.mode, items, title: settings.mode === 'listen' ? 'リスニング復習' : 'スピーキング復習', back: 'smart' };
    window.App.navigate('drill');
  }

  window.SmartView = { render, groups, overall, mastery };
})();
