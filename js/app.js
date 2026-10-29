/* app.js — ルーター + 共通UIヘルパー。window.App として公開。 */
(function () {
  'use strict';

  const VIEWS = {
    home: { el: 'view-home', title: 'ホーム', mod: () => window.HomeView },
    speaking: { el: 'view-speaking', title: '発音・スピーキング', mod: () => window.SpeakingView },
    roleplay: { el: 'view-roleplay', title: 'ロールプレイ会話', mod: () => window.RoleplayView },
    cards: { el: 'view-cards', title: 'フラッシュカード', mod: () => window.CardsView },
    shadow: { el: 'view-shadow', title: '長文・シャドーイング', mod: () => window.ShadowView },
    listen: { el: 'view-listen', title: '聞き流し', mod: () => window.ListenView },
    lesson: { el: 'view-lesson', title: '今日のレッスン', mod: () => window.LessonView },
    freetalk: { el: 'view-freetalk', title: 'AI会話', mod: () => window.FreetalkView },
    quiz: { el: 'view-quiz', title: 'クイズ', mod: () => window.QuizView },
    stats: { el: 'view-stats', title: '統計・進捗', mod: () => window.StatsView },
    dict: { el: 'view-dict', title: 'フレーズ辞書', mod: () => window.DictView },
    review: { el: 'view-review', title: '復習ボックス', mod: () => window.ReviewView },
  };

  // ボトムナビに載っている主要ビュー
  const NAV_VIEWS = ['home', 'speaking', 'listen', 'cards', 'shadow'];

  let current = null;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.querySelector('div').textContent = msg;
    t.classList.remove('hidden-x');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden-x'), 1800);
  }

  function refreshHeader() {
    const li = window.Store.levelInfo();
    document.getElementById('hdr-level').textContent = li.level;
    document.getElementById('hdr-streak').textContent = window.Store.progress.streak.count;
    document.getElementById('hdr-xp').textContent = li.xp + ' XP';
    document.getElementById('hdr-xpnext').textContent = 'Lv' + (li.level + 1) + 'まで ' + (li.span - li.into) + ' XP';
    document.getElementById('hdr-xpbar').style.width = li.pct + '%';
  }

  function navigate(name, options) {
    options = options || {};
    if (!VIEWS[name]) name = 'home';
    if (!options.fromHistory && location.hash !== '#' + name) history.pushState({ view: name }, '', '#' + name);
    // 前のビューの後始末
    if (current && current !== name) {
      const prevMod = VIEWS[current].mod();
      if (prevMod && prevMod.onLeave) prevMod.onLeave();
    }
    window.Speech.stopSpeaking();

    // 表示切替
    Object.values(VIEWS).forEach((v) => document.getElementById(v.el).classList.remove('active'));
    document.getElementById(VIEWS[name].el).classList.add('active');
    document.getElementById('hdr-title').textContent = VIEWS[name].title;

    // ナビ状態（非ナビビューではホームを弱く点灯）
    document.querySelectorAll('#bottom-nav button').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === name);
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    // レンダリング
    const mod = VIEWS[name].mod();
    const container = document.getElementById(VIEWS[name].el);
    if (mod && mod.render) mod.render(container);
    current = name;
    refreshHeader();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  // レベルアップ検知（学習後に呼ぶ）
  let lastLevel = 1;
  function checkLevelUp() {
    const lv = window.Store.levelInfo().level;
    if (lv > lastLevel) {
      toast('🎉 レベル' + lv + 'に上がりました！');
      lastLevel = lv;
    }
    if (window.Achievements) window.Achievements.check();
    refreshHeader();
  }

  // ---- メニューシート（AI会話・クイズ・統計・辞書など） ----
  const MENU = [
    { view: 'home', emoji: '⌂', title: 'ホームに戻る', desc: '学習メニューと今日の進捗' },
    { view: 'lesson', emoji: '🎓', title: '今日のレッスン', desc: '4ステップの総合トレーニング' },
    { view: 'freetalk', emoji: '🤖', title: 'AI会話（フリートーク）', desc: 'AIと自由に英会話' },
    { view: 'listen', emoji: '🎧', title: '聞き流し', desc: '場面別に音声で連続再生' },
    { view: 'roleplay', emoji: '💬', title: 'ロールプレイ会話', desc: '43場面の実践会話' },
    { view: 'shadow', emoji: '📖', title: '長文・シャドーイング', desc: '東北旅行エッセイ他' },
    { view: 'quiz', emoji: '🧩', title: 'クイズ', desc: '4択で力だめし' },
    { view: 'review', emoji: '⭐', title: '復習ボックス', desc: 'お気に入りと苦手を克服' },
    { view: 'stats', emoji: '📊', title: '統計・進捗', desc: '学習の記録を見る' },
    { view: 'dict', emoji: '📚', title: 'フレーズ辞書', desc: '全フレーズを検索' },
  ];
  function openMenu() {
    if (document.getElementById('menu-ov')) return;
    const opener = document.getElementById('hdr-menu');
    opener.setAttribute('aria-expanded', 'true');
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" id="menu-ov" role="dialog" aria-modal="true" aria-label="メニュー">
        <div class="bg-white w-full max-w-[560px] rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-lg">メニュー</h3>
            <button id="menu-close" class="text-gray-400 text-2xl leading-none">&times;</button>
          </div>
          <div class="space-y-2">
            ${MENU.map((m) => `
              <button data-mv="${m.view}" class="row w-full text-left bg-gray-50 rounded-2xl p-3.5 flex items-center gap-3">
                <div class="text-2xl">${m.emoji}</div>
                <div class="flex-1"><div class="font-bold text-gray-800 text-sm">${m.title}</div><div class="text-xs text-gray-500">${m.desc}</div></div>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c4b5fd" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg>
              </button>`).join('')}
          </div>
        </div>
      </div>`;
    document.body.appendChild(div);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { div.remove(); opener.setAttribute('aria-expanded', 'false'); document.removeEventListener('keydown', onKey); opener.focus(); };
    document.addEventListener('keydown', onKey);
    div.querySelector('#menu-close').focus();
    div.querySelector('#menu-close').onclick = close;
    div.querySelector('#menu-ov').onclick = (e) => { if (e.target.id === 'menu-ov') close(); };
    div.querySelectorAll('[data-mv]').forEach((b) => {
      b.onclick = () => { close(); navigate(b.dataset.mv); };
    });
  }

  // ---- テーマ（ライト/ダーク/自動） ----
  const THEME_KEY = 'speak.theme';
  function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme(t) {
    // 2026-10-29〜 Apple 風の黒い見た目に固定（ライト/ダークの設定より優先）
    const dark = true;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.add('apple');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#000000');
  }
  function setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    applyTheme(t);
  }

  window.App = {
    escapeHtml,
    toast,
    navigate,
    openMenu,
    getTheme,
    setTheme,
    refreshHeader,
    checkLevelUp,
    // 発音スコアの色
    scoreColor(s) {
      if (s >= 80) return 'var(--ok)';
      if (s >= 50) return 'var(--warn)';
      return 'var(--bad)';
    },
    scoreLabel(s) {
      if (s >= 90) return 'Perfect!';
      if (s >= 80) return 'Great!';
      if (s >= 60) return 'Good';
      if (s >= 40) return 'もう少し';
      return 'Try again';
    },
  };

  // 起動
  document.addEventListener('DOMContentLoaded', async () => {
    await window.Store.init();
    applyTheme(getTheme());
    // 「自動」時はOSのテーマ変更に追従
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getTheme() === 'auto') applyTheme('auto');
      });
    }
    if (window.Achievements) window.Achievements.sync();
    lastLevel = window.Store.levelInfo().level;
    document.querySelectorAll('#bottom-nav button').forEach((b) => {
      b.addEventListener('click', () => navigate(b.dataset.view));
    });
    document.getElementById('hdr-menu').addEventListener('click', openMenu);
    document.getElementById('hdr-home').addEventListener('click', () => navigate('home'));
    const restoreRoute = () => {
      const name = location.hash.slice(1);
      if (name !== current) navigate(name, { fromHistory: true });
    };
    window.addEventListener('popstate', restoreRoute);
    window.addEventListener('hashchange', restoreRoute);
    // 非対応ブラウザの案内
    if (!window.Speech.asrSupported) {
      setTimeout(() => toast('音声認識はChrome/Edge/Safari推奨です'), 800);
    }
    refreshHeader();
    // ショートカットから直接開く: index.html#quiz → クイズの形式選び
    const start = (location.hash || '').replace('#', '');
    navigate(VIEWS[start] ? start : 'home', { fromHistory: true });
  });
})();
