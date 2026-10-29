/* stats.js — 学習の統計・進捗（Chart.js）。window.StatsView */
(function () {
  'use strict';

  let charts = [];

  function last14Days() {
    const days = [];
    const base = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      days.push(window.Store.todayStr(d));
    }
    return days;
  }

  function render(container) {
    destroyCharts();
    const S = window.Store;
    const P = S.progress;
    const li = S.levelInfo();
    const spk = S.speakingStats();
    const deck = window.CardsView.buildDeck();
    const srs = S.srsSummary(deck);

    const days = last14Days();
    const dailyCounts = days.map((d) => (P.daily[d] || {}).count || 0);
    const totalStudied = Object.values(P.daily).reduce((s, x) => s + (x.count || 0), 0);

    // 発音スコア分布
    const buckets = [0, 0, 0, 0, 0]; // 0-20,20-40,...80-100
    P.speaking.forEach((r) => {
      const b = Math.min(4, Math.floor(r.score / 20));
      buckets[b]++;
    });

    container.innerHTML = `
      <button class="text-sm text-gray-400 mb-3 back-home">← ホーム</button>

      <div class="grid grid-cols-3 gap-2.5 mb-5">
        ${stat('🔥', P.streak.count, '連続日数')}
        ${stat('⭐', 'Lv' + li.level, li.xp + ' XP')}
        ${stat('🗣️', spk.avg + '%', '発音平均')}
        ${stat('📚', totalStudied, '累計学習')}
        ${stat('🎴', srs.learned, '習得カード')}
        ${stat('🎯', spk.attempts, '発話回数')}
      </div>

      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <div class="text-sm font-bold text-gray-700 mb-3">直近14日の学習量</div>
        <canvas id="c-daily" height="150"></canvas>
      </div>

      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <div class="text-sm font-bold text-gray-700 mb-3">発音スコアの分布</div>
        ${spk.attempts ? '<canvas id="c-score" height="150"></canvas>' : '<div class="text-center text-gray-400 text-sm py-8">まだ発音練習の記録がありません</div>'}
      </div>

      ${calendarHtml()}

      ${achievementsHtml()}

      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <div class="text-sm font-bold text-gray-700 mb-2">カード習得の進捗</div>
        <div class="flex items-center gap-3">
          <div class="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full brand-grad rounded-full" style="width:${srs.total ? (srs.learned / srs.total) * 100 : 0}%"></div>
          </div>
          <div class="text-sm font-bold text-gray-700">${srs.learned}/${srs.total}</div>
        </div>
        <div class="text-xs text-gray-400 mt-2">本日の復習待ち: <b class="text-brand">${srs.dueNow}</b> 枚</div>
      </div>
    `;
    bindBack(container);

    if (!window.Chart) return; // Chart.js 未ロード時はスキップ
    drawDaily(days, dailyCounts);
    if (spk.attempts) drawScore(buckets);
  }

  // 学習カレンダー（貢献グラフ風ヒートマップ・直近約12週）
  function calendarHtml() {
    const P = window.Store.progress;
    const daily = P.daily || {};
    const WEEKS = 12;
    const today = new Date();
    // 週の起点（日曜）に揃える
    const end = new Date(today);
    const start = new Date(today);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));
    // 週×曜日グリッド
    const cols = [];
    let activeDays = 0;
    const cur = new Date(start);
    // startを直近の日曜まで戻す
    cur.setDate(cur.getDate() - cur.getDay());
    while (cur <= end) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const ds = window.Store.todayStr(cur);
        const cnt = (daily[ds] || {}).count || 0;
        const future = cur > today;
        if (cnt > 0) activeDays++;
        week.push({ ds, cnt, future, isToday: ds === window.Store.todayStr() });
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(week);
    }
    const shade = (c, future) => {
      if (future) return 'transparent';
      if (c === 0) return '#f1f0f5';
      if (c < 5) return '#ddd6fe';
      if (c < 10) return '#a78bfa';
      if (c < 20) return '#7c3aed';
      return '#5b21b6';
    };
    return `
      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-bold text-gray-700">学習カレンダー</div>
          <div class="text-xs text-gray-400">${activeDays}日 学習</div>
        </div>
        <div class="overflow-x-auto">
          <div style="display:flex;gap:3px;min-width:max-content">
            ${cols.map((w) => `<div style="display:flex;flex-direction:column;gap:3px">
              ${w.map((d) => `<div title="${d.ds}: ${d.cnt}" style="width:12px;height:12px;border-radius:3px;background:${shade(d.cnt, d.future)};${d.isToday ? 'outline:2px solid var(--brand2);outline-offset:1px' : ''}"></div>`).join('')}
            </div>`).join('')}
          </div>
        </div>
        <div class="flex items-center justify-end gap-1 mt-2 text-[10px] text-gray-400">
          少 <span style="width:10px;height:10px;border-radius:2px;background:#f1f0f5;display:inline-block"></span>
          <span style="width:10px;height:10px;border-radius:2px;background:#ddd6fe;display:inline-block"></span>
          <span style="width:10px;height:10px;border-radius:2px;background:#a78bfa;display:inline-block"></span>
          <span style="width:10px;height:10px;border-radius:2px;background:#7c3aed;display:inline-block"></span>
          <span style="width:10px;height:10px;border-radius:2px;background:#5b21b6;display:inline-block"></span> 多
        </div>
      </div>`;
  }

  function achievementsHtml() {
    if (!window.Achievements) return '';
    const list = window.Achievements.all();
    const got = list.filter((a) => a.unlocked).length;
    return `
      <div class="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-bold text-gray-700">達成バッジ</div>
          <div class="text-xs text-gray-400">${got} / ${list.length}</div>
        </div>
        <div class="grid grid-cols-4 gap-2">
          ${list.map((a) => `
            <div class="text-center ${a.unlocked ? '' : 'opacity-30'}" title="${window.App.escapeHtml(a.title)}">
              <div class="text-2xl ${a.unlocked ? '' : 'grayscale'}">${a.unlocked ? a.emoji : '🔒'}</div>
              <div class="text-[9px] text-gray-500 leading-tight mt-0.5">${window.App.escapeHtml(a.title)}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function stat(emoji, big, label) {
    return `<div class="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm text-center">
      <div class="text-xl">${emoji}</div>
      <div class="text-lg font-extrabold text-gray-800 leading-tight mt-0.5">${big}</div>
      <div class="text-[10px] text-gray-400">${label}</div>
    </div>`;
  }

  function drawDaily(days, counts) {
    const ctx = document.getElementById('c-daily');
    if (!ctx) return;
    charts.push(new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: days.map((d) => d.slice(5).replace('-', '/')),
        datasets: [{ data: counts, backgroundColor: '#a78bfa', borderRadius: 5, maxBarThickness: 16 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#f3f4f6' } },
        },
      },
    }));
  }

  function drawScore(buckets) {
    const ctx = document.getElementById('c-score');
    if (!ctx) return;
    charts.push(new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['0-20', '20-40', '40-60', '60-80', '80-100'],
        datasets: [{
          data: buckets,
          backgroundColor: ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#22c55e'],
          borderRadius: 5, maxBarThickness: 34,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#f3f4f6' } },
        },
      },
    }));
  }

  function destroyCharts() {
    charts.forEach((c) => { try { c.destroy(); } catch (e) {} });
    charts = [];
  }

  function bindBack(container) {
    const b = container.querySelector('.back-home');
    if (b) b.onclick = () => window.App.navigate('home');
  }

  function onLeave() { destroyCharts(); }

  window.StatsView = { render, onLeave };
})();
