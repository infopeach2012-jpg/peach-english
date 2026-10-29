/* home.js — ホーム（ダッシュボード）。window.HomeView */
(function () {
  'use strict';

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

    const goalDone = cnt >= goal;
    const lessonDone = window.LessonView && window.LessonView.isDoneToday();

    const modes = [
      ['listen', '01', '聞く', '聞き流し', '自然な英語を、日常のすきま時間に。', 'headphones'],
      ['speaking', '02', '話す', '発音・スピーキング', '声に出して、一文ずつ自分の英語に。', 'mic'],
      ['roleplay', '03', '使う', 'ロールプレイ', '旅先や仕事の会話を、相手役と練習。', 'chat'],
      ['shadow', '04', '深める', '長文・シャドーイング', '英語のリズムを、聞いて、まねする。', 'book'],
    ];
    const icons = {
      headphones: '<path d="M4 17v-5a8 8 0 0 1 16 0v5M4 13h3v7H5a1 1 0 0 1-1-1zm16 0h-3v7h2a1 1 0 0 0 1-1z"/>',
      mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
      chat: '<path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0zM7 9h8M7 13h5"/>',
      book: '<path d="M12 5v16M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z"/>',
    };
    container.innerHTML = `
      <section class="home-intro"><div><p class="eyebrow">A LITTLE PRACTICE. A BIG DIFFERENCE.</p><h2>英語を、もっと<br>あなたの日常に。</h2><p class="intro-description">聞く。話す。少しずつ、自然に。<br>今日はどんな練習をしましょうか。</p></div>
        <div class="daily-progress"><span class="eyebrow">TODAY'S PROGRESS</span><div class="daily-count">${cnt}<span> / ${goal}</span></div><div class="progress-track"><span style="width:${Math.min(100,pct)}%"></span></div><p>${goalDone ? '今日の目標を達成しました' : '自分のペースで続けましょう'}</p><div class="daily-meta"><span>${S.progress.streak.count} 日連続</span><span>発音平均 ${spk.avg}%</span></div></div>
      </section>
      <button data-go="lesson" class="lesson-feature"><div><span class="eyebrow">YOUR DAILY SESSION · 約5分</span><h3>今日のレッスン</h3><p>${lessonDone ? '今日のレッスンは完了。もう一度練習しますか？' : '単語・発音・会話・クイズを、ひとつの流れで。'}</p></div><span class="feature-action">${lessonDone ? 'もう一度' : 'はじめる'} <span aria-hidden="true">↗</span></span></button>
      <div class="section-heading"><h3>練習を選ぶ</h3><span>MAKE IT YOUR ROUTINE</span></div>
      <div class="practice-grid">${modes.map(([view,num,label,title,desc,icon])=>`<button data-go="${view}" class="practice-card"><div class="practice-top"><span class="practice-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${icons[icon]}</svg></span><span class="practice-number">${num} / ${label}</span></div><h3>${title}</h3><p>${desc}</p><span class="practice-link">練習する <span aria-hidden="true">→</span></span></button>`).join('')}</div>
      <div class="section-heading"><h3>もう一歩、続けよう</h3></div>
      <div class="continue-grid"><button data-go="cards" class="continue-card"><span class="eyebrow">REVIEW</span><h3>${srs.dueNow > 0 ? srs.dueNow + '枚のカードを復習' : 'フラッシュカード'}</h3><p>習得済み ${srs.learned} / ${srs.total} 枚</p><span>カードを開く →</span></button><button data-go="freetalk" class="continue-card"><span class="eyebrow">CONVERSATION</span><h3>AIと自由に話す</h3><p>6つの場面で、英語のやりとりを。</p><span>会話をはじめる →</span></button></div>
      <div class="utility-links"><button data-go="practice">練習</button><button data-go="smart">スマートレビュー</button><button data-go="patterns">パターン練習</button><button data-go="quiz">クイズ</button><button data-go="review">復習ボックス</button><button data-go="dict">フレーズ辞書</button><button data-go="stats">学習の記録</button><button id="home-settings">設定</button></div>
      <footer class="home-footer">SPEAK STUDIO <span>少しの練習を、毎日の習慣に。</span></footer>
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
