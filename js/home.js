/* home.js — ホーム（Speak 風）。window.HomeView */
(function () {
  'use strict';

  function render(container) {
    const S = window.Store;
    const goal = S.progress.goal;
    const cnt = S.todayCount();
    const pct = goal ? Math.min(100, Math.round((cnt / goal) * 100)) : 0;
    const spk = S.speakingStats();
    const lessonDone = window.LessonView && window.LessonView.isDoneToday();
    const gs = window.SmartView ? window.SmartView.groups() : [];
    const score = window.SmartView ? window.SmartView.overall(gs) : 0;
    const h = new Date().getHours();
    const greet = h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは';

    container.innerHTML = `
      <div class="sp-page">
        <div class="sp-greet">${greet}、渡辺さん</div>
        <h1 class="sp-h1">今日も少しだけ、<br>英語を話そう。</h1>

        <button data-go="lesson" class="sp-card sp-hero">
          <div class="sp-eyebrow">TODAY'S LESSON ・ 約5分</div>
          <div class="sp-hero-title">今日のレッスン</div>
          <div class="sp-item-sub">単語 → 発音 → 会話 → クイズ</div>
          <span class="sp-pill cta">${lessonDone ? '↺ もう一度' : '▶ はじめる'}</span>
        </button>

        <div class="sp-grid2">
          <div class="sp-card sp-stat"><div class="sp-stat-num">${cnt}<span>/${goal}</span></div><div class="sp-item-sub">今日の学習</div><div class="sp-track"><span style="width:${pct}%"></span></div></div>
          <div class="sp-card sp-stat"><div class="sp-stat-num">${S.progress.streak.count}<span>日</span></div><div class="sp-item-sub">連続</div><div class="sp-item-sub">発音平均 ${spk.avg}%</div></div>
        </div>

        <h2 class="sp-h2">続ける</h2>
        <button data-go="smart" class="sp-card sp-row-btn">
          <span class="sp-icon" style="background:#3b5bff">⚡</span>
          <div class="sp-item-body"><div class="sp-item-title">スマートレビュー</div><div class="sp-item-sub">習熟度スコア</div><div class="sp-track"><span style="width:${score}%"></span></div></div>
          <span class="sp-pct">${score}%</span>
        </button>
        <button data-go="listen" class="sp-card sp-row-btn">
          <span class="sp-icon" style="background:#7c5cff">🎧</span>
          <div class="sp-item-body"><div class="sp-item-title">聞き流し</div><div class="sp-item-sub">場面を選んで、自然な速さで流す</div></div>
        </button>
        <button data-go="freetalk" class="sp-card sp-row-btn">
          <span class="sp-icon blue">🤖</span>
          <div class="sp-item-body"><div class="sp-item-title">AI と会話</div><div class="sp-item-sub">声で話す。その場で直してくれる</div></div>
        </button>

        <div class="sp-chips">
          <button data-go="practice" class="sp-chip">練習をすべて見る</button>
          <button data-go="patterns" class="sp-chip">パターン練習</button>
          <button data-go="stats" class="sp-chip">学習の記録</button>
          <button id="home-settings" class="sp-chip">設定</button>
        </div>
      </div>`;
    container.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => window.App.navigate(b.dataset.go)));
    container.querySelector('#home-settings').addEventListener('click', openSettings);
  }

  function openSettings() {
    const S = window.Store;
    const cur = S.progress.goal;
    const html = `
      <div class="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" id="set-ov">
        <div class="bg-white w-full max-w-[560px] rounded-t-3xl sm:rounded-3xl p-5">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-lg">設定</h3>
            <button id="set-close" class="text-gray-400 text-2xl leading-none">&times;</button>
          </div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">1日の目標（項目数）</label>
          <input id="set-goal" type="number" min="5" max="100" value="${cur}" class="w-full border rounded-xl px-3 py-2 mb-4" />
          <button id="set-reset" class="w-full text-red-600 border border-red-200 rounded-xl py-2.5 font-semibold mb-2">進捗をリセット</button>
          <button id="set-save" class="w-full brand-grad text-white rounded-xl py-2.5 font-bold">保存</button>
        </div>
      </div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);
    const close = () => div.remove();
    div.querySelector('#set-close').onclick = close;
    div.querySelector('#set-ov').onclick = (e) => { if (e.target.id === 'set-ov') close(); };
    div.querySelector('#set-save').onclick = () => {
      const g = parseInt(div.querySelector('#set-goal').value, 10);
      if (g >= 1) { S.progress.goal = g; S.save(); }
      close();
      window.App.navigate('home');
    };
    div.querySelector('#set-reset').onclick = () => {
      if (confirm('学習進捗（XP・ストリーク・SRS）をすべて消去します。よろしいですか？')) {
        S.resetProgress();
        close();
        window.App.refreshHeader();
        window.App.navigate('home');
      }
    };
  }

  window.HomeView = { render };
})();
