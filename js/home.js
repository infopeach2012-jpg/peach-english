/* home.js — ホーム（ダッシュボード）。window.HomeView */
(function () {
  'use strict';

  function ring(pct, count, goal) {
    const R = 46, C = 2 * Math.PI * R;
    const off = C * (1 - Math.min(1, pct / 100));
    return `
      <svg viewBox="0 0 110 110" width="130" height="130" class="ring">
        <circle cx="55" cy="55" r="${R}" stroke="#ede9fe"></circle>
        <circle cx="55" cy="55" r="${R}" stroke="url(#g)" stroke-dasharray="${C}" stroke-dashoffset="${off}"></circle>
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6d28d9"/><stop offset="1" stop-color="#ec4899"/>
        </linearGradient></defs>
      </svg>`;
  }

  function tile(view, emoji, title, sub, tint) {
    return `
      <button data-go="${view}" class="row text-left bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-3 w-full">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style="background:${tint}">${emoji}</div>
        <div class="min-w-0 flex-1">
          <div class="font-bold text-gray-800">${title}</div>
          <div class="text-xs text-gray-500 mt-0.5">${sub}</div>
        </div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#c4b5fd" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg>
      </button>`;
  }

  function miniTile(view, emoji, title) {
    return `
      <button data-go="${view}" class="row bg-white border border-gray-100 rounded-2xl p-3 shadow-sm text-center">
        <div class="text-2xl">${emoji}</div>
        <div class="text-xs font-bold text-gray-700 mt-1">${title}</div>
      </button>`;
  }

  function render(container) {
    const S = window.Store;
    const C = S.content;
    const goal = S.progress.goal;
    const cnt = S.todayCount();
    const pct = goal ? (cnt / goal) * 100 : 0;
    const spk = S.speakingStats();

    // デッキ集計（フレーズ＋ノート）
    const deck = window.CardsView.buildDeck();
    const srs = S.srsSummary(deck);

    const sentences = C.phrases.filter((p) => p.kind === 'sentence').length;
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'こんばんは' : hour < 11 ? 'おはようございます' : hour < 18 ? 'こんにちは' : 'こんばんは';

    const goalDone = cnt >= goal;
    const lessonDone = window.LessonView && window.LessonView.isDoneToday();

    container.innerHTML = `
      <!-- 今日のゴール -->
      <div class="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex items-center gap-4 mb-4">
        <div class="relative shrink-0" style="width:130px;height:130px">
          ${ring(pct)}
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <div class="text-3xl font-extrabold text-gray-800">${cnt}</div>
            <div class="text-[11px] text-gray-400 font-semibold">/ ${goal} 今日</div>
          </div>
        </div>
        <div class="flex-1">
          <div class="text-sm text-gray-500">${greet}、渡辺さん</div>
          <div class="text-lg font-bold text-gray-800 mt-0.5">${goalDone ? '今日の目標達成！🎉' : '今日の学習を始めましょう'}</div>
          <div class="flex gap-2 mt-3">
            <div class="flex-1 bg-violet-50 rounded-xl px-3 py-2 text-center">
              <div class="text-lg font-bold text-brand">🔥 ${S.progress.streak.count}</div>
              <div class="text-[10px] text-gray-500">連続日数</div>
            </div>
            <div class="flex-1 bg-pink-50 rounded-xl px-3 py-2 text-center">
              <div class="text-lg font-bold" style="color:var(--brand2)">${spk.avg}<span class="text-xs">%</span></div>
              <div class="text-[10px] text-gray-500">発音平均</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 今日のレッスン（総合コース） -->
      <button data-go="lesson" class="w-full text-left rounded-3xl p-5 shadow-md mb-4 relative overflow-hidden brand-grad text-white">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-[11px] font-semibold opacity-80">TODAY'S LESSON</div>
            <div class="text-xl font-bold mt-1">今日のレッスン ${lessonDone ? '✅' : ''}</div>
            <div class="text-xs opacity-90 mt-1">${lessonDone ? '本日達成！もう一周もOK' : '単語→発音→会話→クイズを約5分で'}</div>
          </div>
          <div class="text-5xl opacity-90">🎓</div>
        </div>
        <div class="inline-block mt-3 bg-white/20 rounded-full px-4 py-1.5 text-sm font-bold">${lessonDone ? '▶ もう一度' : '▶ はじめる'}</div>
      </button>

      <!-- AI会話（目玉機能） -->
      <button data-go="freetalk" class="w-full text-left rounded-3xl p-5 shadow-md mb-4 relative overflow-hidden" style="background:linear-gradient(135deg,#0ea5e9,#6366f1)">
        <div class="text-white">
          <div class="text-[11px] font-semibold opacity-80">AIと英会話 · Speak的フリートーク</div>
          <div class="text-xl font-bold mt-1">AIと自由に話そう 🤖</div>
          <div class="text-xs opacity-90 mt-1">6つの場面・声で会話・その場で添削とヒント</div>
          <div class="inline-block mt-3 bg-white/20 rounded-full px-4 py-1.5 text-sm font-bold">▶ 会話をはじめる</div>
        </div>
        <div class="absolute -right-3 -bottom-3 text-7xl opacity-20">💬</div>
      </button>

      <!-- おすすめ（今日の続き） -->
      <button data-go="cards" class="brand-grad text-white rounded-3xl p-5 w-full text-left shadow-md mb-5 relative overflow-hidden">
        <div class="text-[11px] font-semibold opacity-80">今日の復習</div>
        <div class="text-xl font-bold mt-1">${srs.dueNow > 0 ? srs.dueNow + '枚のカードが復習待ち' : '新しいカードに挑戦'}</div>
        <div class="text-xs opacity-90 mt-1">習得済み ${srs.learned} / ${srs.total} 枚 ・ SRSで記憶に定着</div>
        <div class="inline-block mt-3 bg-white/20 rounded-full px-4 py-1.5 text-sm font-bold">▶ 今すぐ復習</div>
        <div class="absolute -right-4 -bottom-4 text-7xl opacity-20">🧠</div>
      </button>

      <div class="text-xs font-bold text-gray-400 mb-2 px-1">トレーニング</div>
      <div class="space-y-2.5">
        ${tile('listen', '🎧', '聞き流し', `${C.phrases.length} フレーズを場面別に・長文も自動で進む`, '#fef3c7')}
        ${tile('speaking', '🗣️', '発音・スピーキング', `${sentences} 文 ＋ 単語練習・AIが発音を採点`, '#ede9fe')}
        ${tile('roleplay', '💬', 'ロールプレイ会話', `${C.dialogues.length} 場面・相手役と実践会話`, '#fce7f3')}
        ${tile('cards', '🎴', 'フラッシュカード', `${C.phrases.length + C.notes.length} 枚・間隔反復で暗記`, '#dbeafe')}
        ${tile('shadow', '📖', '長文・シャドーイング', `東北旅行エッセイ ＋ スピーチ${C.speeches.length ? '練習' : ''}`, '#dcfce7')}
      </div>

      <div class="text-xs font-bold text-gray-400 mb-2 px-1 mt-5">その他</div>
      <div class="grid grid-cols-4 gap-2.5">
        ${miniTile('review', '⭐', '復習')}
        ${miniTile('quiz', '🧩', 'クイズ')}
        ${miniTile('stats', '📊', '統計')}
        ${miniTile('dict', '📚', '辞書')}
      </div>

      <div class="mt-5 text-center">
        <button id="home-settings" class="text-xs text-gray-400 underline">設定・進捗リセット</button>
      </div>
    `;

    container.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => window.App.navigate(b.dataset.go));
    });
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
          <label class="block text-sm font-semibold text-gray-600 mb-1">テーマ</label>
          <div id="set-theme" class="flex gap-2 mb-4">
            ${[['light', '☀️ ライト'], ['dark', '🌙 ダーク'], ['auto', '⚙️ 自動']].map(([v, l]) => `
              <button data-theme="${v}" class="flex-1 rounded-xl py-2 text-sm font-semibold border ${window.App.getTheme() === v ? 'brand-grad text-white border-transparent' : 'bg-gray-100 text-gray-600 border-transparent'}">${l}</button>`).join('')}
          </div>
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
    div.querySelectorAll('#set-theme [data-theme]').forEach((b) => {
      b.onclick = () => {
        window.App.setTheme(b.dataset.theme);
        div.querySelectorAll('#set-theme [data-theme]').forEach((x) => {
          const on = x.dataset.theme === b.dataset.theme;
          x.className = `flex-1 rounded-xl py-2 text-sm font-semibold border ${on ? 'brand-grad text-white border-transparent' : 'bg-gray-100 text-gray-600 border-transparent'}`;
        });
      };
    });
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
