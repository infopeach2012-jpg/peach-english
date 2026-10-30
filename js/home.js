/* home.js — ホーム（声を主役にしたプロダクトデザイン）。window.HomeView */
(function () {
  'use strict';

  function render(container) {
    const S = window.Store;
    const goal = S.progress.goal, cnt = S.todayCount();
    const pct = goal ? Math.min(100, Math.round(cnt / goal * 100)) : 0;
    const lessonDone = window.LessonView && window.LessonView.isDoneToday();
    const groups = window.SmartView ? window.SmartView.groups() : [];
    const score = window.SmartView ? window.SmartView.overall(groups) : 0;
    const arrow = '<span aria-hidden="true">' + window.App.icon('arrow') + '</span>';
    container.innerHTML = `
      <section class="launch-hero" aria-labelledby="launch-title">
        <p class="launch-kicker">A LITTLE PRACTICE. A NEW POSSIBILITY.</p>
        <h1 id="launch-title">英語に、<br><span>あなたの声を。</span></h1>
        <p class="launch-lead">聞く。まねる。話せるようになる。</p>
        <img class="voice-sculpture" src="assets/voice-sculpture.svg" width="960" height="340" alt="" fetchpriority="high" />
        <div class="launch-actions">
          <button data-go="patterns" class="studio-primary">練習をはじめる <span aria-hidden="true">→</span></button>
          <button data-go="listen" class="studio-text-link">聞き流しを開く <span aria-hidden="true">›</span></button>
        </div>
        <p class="launch-caption">1レッスン8文。自然なアメリカ英語で。</p>
      </section>

      <section class="studio-progress" aria-label="学習の記録">
        <div><span class="studio-stat-label">今日の学習</span><p><strong>${cnt}</strong><span> / ${goal} 項目</span></p><div class="studio-mini-track" role="progressbar" aria-label="今日の目標" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></div>
        <div><span class="studio-stat-label">続けた日数</span><p><strong>${S.progress.streak.count}</strong><span> 日</span></p></div>
        <button data-go="smart"><span class="studio-stat-label">習熟度</span><p><strong>${score}</strong><span> %</span></p><span class="studio-stat-more">復習する →</span></button>
      </section>

      <section class="studio-discover" aria-labelledby="discover-title">
        <div class="studio-section-title"><div><p class="studio-eyebrow">MAKE IT YOURS</p><h2 id="discover-title">毎日に、話すきっかけを。</h2></div><button data-go="practice" class="studio-text-link">すべての練習 <span aria-hidden="true">${window.App.icon('arrow')}</span></button></div>
        <button data-go="lesson" class="studio-lesson">
          <div><span class="studio-eyebrow">TODAY’S LESSON</span><h3>5分から、<br>新しい自分へ。</h3><p>単語、発音、会話。今日のひとつを身につけよう。</p><span class="studio-card-link">${lessonDone ? 'もう一度レッスン' : '今日のレッスン'} ${arrow}</span></div>
          <div class="lesson-art" aria-hidden="true"><span>05</span><small>MINUTES. EVERY DAY.</small></div>
        </button>
        <div class="studio-feature-grid">
          <button data-go="listen" class="studio-feature studio-listen">
            <span class="studio-eyebrow">LISTEN & FEEL</span><h3>耳から、<br>英語がなじむ。</h3><p>場面を選んで、連続再生。<br>速さも、文の間も、あなたのペースで。</p>
            <div class="mini-wave" aria-hidden="true">${[15,25,43,68,94,62,38,72,108,82,51,32,54,74,44,25,14].map(h=>`<i style="--bar:${h}px"></i>`).join('')}</div><span class="studio-card-link">聞き流し ${arrow}</span>
          </button>
          <button data-go="freetalk" class="studio-feature studio-conversation">
            <span class="studio-eyebrow">SAY IT YOUR WAY</span><h3>言いたいことを、<br>言葉に。</h3><p>カフェでも、旅先でも。<br>身近な場面から、AIと会話の練習。</p>
            <div class="conversation-art" aria-hidden="true"><span>How’s your day?</span><span>Better already.</span></div><span class="studio-card-link">会話をはじめる ${arrow}</span>
          </button>
        </div>
        <button data-go="smart" class="studio-review"><span class="review-symbol" aria-hidden="true">↺</span><span><strong>覚えた英語を、使える英語に。</strong><small>スマートレビューで、今日の復習。</small></span><span class="studio-review-arrow" aria-hidden="true">${window.App.icon('arrow')}</span></button>
      </section>
      <footer class="studio-footer"><span>Speak Studio <span class="footer-dot">·</span> Every word opens a door.</span><div><button data-go="stats">学習の記録</button><button id="home-settings">設定</button></div></footer>`;
    container.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => window.App.navigate(b.dataset.go)));
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
