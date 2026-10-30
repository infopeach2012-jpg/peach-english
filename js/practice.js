/* practice.js — 練習（Speak 風）。window.PracticeView
 * AI と会話 ／ クイックレッスン（語彙・表現）／ 復習（スマートレビュー・保存した表現・苦手・場面で聞く）
 */
(function () {
  'use strict';

  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function quick(kind) {
    const S = window.Store, C = S.content;
    const SITS = (window.ListenView && window.ListenView.SITS) || [];
    const label = (k) => { const s = SITS.find((x) => x.key === k); return s ? s.label : ''; };
    const pool = C.phrases.filter((p) => kind === 'word' ? p.kind === 'word' : p.kind === 'sentence')
      .map((p) => ({ key: 'p' + p.id, en: p.en, ja: p.ja, note: p.note, group: label(p.sit) }));
    const { due, fresh } = S.srsDue(pool);
    const items = shuffle(due).concat(shuffle(fresh), shuffle(pool)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 10);
    window.App.drill = { mode: 'speak', items, title: kind === 'word' ? '語彙' : '表現', back: 'practice' };
    window.App.navigate('drill');
  }

  function weakDrill() {
    const S = window.Store;
    const items = S.weakItems().map((it) => ({ key: it.key, en: it.en, ja: it.ja, note: it.note, group: '苦手' })).slice(0, 15);
    if (!items.length) { window.App.toast('まだ苦手はありません。話す練習で60点未満だった文がここに入ります'); return; }
    window.App.drill = { mode: 'speak', items, title: '苦手', back: 'practice' };
    window.App.navigate('drill');
  }

  function render(container) {
    const S = window.Store;
    const gs = window.SmartView.groups();
    const score = window.SmartView.overall(gs);
    const favs = S.favoriteItems().length;
    const weak = S.weakItems().length;
    container.innerHTML = `
      <div class="sp-page">
        <p class="studio-eyebrow">YOUR DAILY PRACTICE</p><h1 class="sp-h1">今日の一言を、増やそう。</h1>

        <div class="sp-card">
          <div class="sp-row"><span class="sp-icon blue">${window.App.icon('freetalk')}</span><div><div class="sp-item-title">AI と会話</div><div class="sp-item-sub">場面を選んで、声で話す。その場で直してくれる</div></div></div>
          <button data-go="freetalk" class="sp-btn-wide">会話をはじめる →</button>
        </div>

        <h2 class="sp-h2">クイックレッスン</h2>
        <div class="sp-grid2">
          <button data-quick="word" class="sp-card sp-tile"><span class="sp-tile-icon" style="background:#ff8a3d">${window.App.icon('cards')}</span><div class="sp-item-title">語彙</div></button>
          <button data-quick="sentence" class="sp-card sp-tile"><span class="sp-tile-icon" style="background:#ff4d6d">${window.App.icon('sentence')}</span><div class="sp-item-title">表現</div></button>
        </div>

        <h2 class="sp-h2">復習</h2>
        <button data-go="smart" class="sp-card sp-row-btn">
          <span class="sp-icon" style="background:#3b5bff">${window.App.icon('smart')}</span>
          <div class="sp-item-body"><div class="sp-item-title">スマートレビュー</div><div class="sp-item-sub">習熟度スコア</div><div class="sp-track"><span style="width:${score}%"></span></div></div>
          <span class="sp-pct">${score}%</span>
        </button>
        <button data-go="review" class="sp-card sp-row-btn">
          <span class="sp-icon" style="background:#2fbf8f">${window.App.icon('review')}</span>
          <div class="sp-item-body"><div class="sp-item-title">保存した表現</div><div class="sp-item-sub">${favs} 保存済み</div></div>
        </button>
        <button data-weak class="sp-card sp-row-btn">
          <span class="sp-icon" style="background:#e5734a">${window.App.icon('weak')}</span>
          <div class="sp-item-body"><div class="sp-item-title">苦手</div><div class="sp-item-sub">${weak ? weak + ' 件の間違いを復習しましょう' : 'まだありません'}</div></div>
        </button>
        <button data-go="listen" class="sp-card sp-row-btn">
          <span class="sp-icon" style="background:#7c5cff">${window.App.icon('listen')}</span>
          <div class="sp-item-body"><div class="sp-item-title">場面で聞く</div><div class="sp-item-sub">${gs.length} の場面 ・ 聞き流し</div></div>
        </button>

        <h2 class="sp-h2">ほかの練習</h2>
        <div class="sp-chips">
          <button data-go="patterns" class="sp-chip">パターン練習（型で覚える）</button>
          <button data-go="lesson" class="sp-chip">今日のレッスン</button>
          <button data-go="roleplay" class="sp-chip">ロールプレイ</button>
          <button data-go="shadow" class="sp-chip">長文・シャドーイング</button>
          <button data-go="cards" class="sp-chip">フラッシュカード</button>
          <button data-go="speaking" class="sp-chip">発音</button>
          <button data-go="notes" class="sp-chip">レッスンノート</button>
          <button data-go="dict" class="sp-chip">辞書</button>
        </div>
      </div>`;
    container.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => window.App.navigate(b.dataset.go); });
    container.querySelectorAll('[data-quick]').forEach((b) => { b.onclick = () => quick(b.dataset.quick); });
    container.querySelector('[data-weak]').onclick = weakDrill;
  }

  window.PracticeView = { render };
})();
