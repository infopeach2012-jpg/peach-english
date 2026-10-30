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
    review: { el: 'view-review', title: '保存した表現・苦手', mod: () => window.ReviewView },
    practice: { el: 'view-practice', title: '練習', mod: () => window.PracticeView },
    patterns: { el: 'view-patterns', title: 'パターン練習', mod: () => window.PatternsView },
    smart: { el: 'view-smart', title: 'スマートレビュー', mod: () => window.SmartView },
    drill: { el: 'view-drill', title: 'レッスン', mod: () => window.DrillView },
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

  // Small line icons keep navigation and lesson controls visually consistent.
  function icon(name) {
    const paths = {
      home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
      practice: '<path d="M4 9v6m4-10v14m4-17v20m4-17v14m4-10v6"/>',
      listen: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 12h4v9H5a2 2 0 0 1-2-2zm18 0h-4v9h2a2 2 0 0 0 2-2z"/>',
      freetalk: '<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z"/><path d="M7 11h.01M12 11h.01M17 11h.01" stroke-width="3"/>',
      speaking: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v4m-4 0h8"/>',
      patterns: '<path d="m8 4 12 8-12 8Z"/>',
      smart: '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6m-2-1v6l4 2"/>',
      lesson: '<path d="m3 8 9-5 9 5-9 5Zm3 2v7c4 3 8 3 12 0v-7m3-2v10"/>',
      cards: '<rect x="3" y="7" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
      sentence: '<path d="M4 6h6v7H4V6Zm10 0h6v7h-6V6ZM10 13c0 4-2 6-5 6m15-6c0 4-2 6-5 6"/>',
      review: '<path d="M6 3h12v19l-6-4-6 4Z"/>',
      weak: '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
      stats: '<path d="M4 21V11m8 10V3m8 18V7" stroke-width="3"/>',
      dict: '<path d="M12 5C8 2 4 2 2 3v17c4-1 7 0 10 2m0-17c4-3 8-3 10-2v17c-4-1-7 0-10 2V5Z"/>',
      quiz: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="m14 18 3 3 5-7"/>',
      cafe: '<path d="M4 7h12v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm12 1h2a3 3 0 0 1 0 6h-2M2 23h18M7 2v2m5-2v2"/>',
      travel: '<path d="m2 14 8-3V3a2 2 0 0 1 4 0v8l8 3v3l-8-2v5l3 2H7l3-2v-5l-8 2Z"/>',
      work: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="M8 7V3h8v4M2 12c6 4 14 4 20 0m-10 1v5"/>',
      shop: '<path d="M5 7h14l2 15H3L5 7Zm3 0V5a4 4 0 0 1 8 0v2"/>',
      meat: '<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20M19 2c-4 3-4 8 0 10v10m0-20v10"/>',
      arrow: '<path d="M5 19 19 5M5 5h14v14"/>',
      pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
      prev: '<path d="M5 5v14m14-14L7 12l12 7Z"/>',
      next: '<path d="M19 5v14M5 5l12 7-12 7Z"/>',
    };
    const aliases = { roleplay:'freetalk', shadow:'dict', word:'cards' };
    return `<svg class="studio-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[aliases[name] || name] || paths.freetalk}</svg>`;
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
    // 上のメニュー（Speak 風）: どの画面がどの見出しに属するか
    const TOP = { home: 'home', freetalk: 'freetalk', quiz: 'practice', stats: 'stats', listen: 'listen' };
    const topKey = TOP[name] || 'practice';
    document.querySelectorAll('.sp-nav [data-top]').forEach((b) => {
      b.classList.toggle('on', b.dataset.top === topKey);
      if (b.dataset.top === topKey) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.documentElement.dataset.view = name;
    document.documentElement.classList.toggle('sp-fullscreen', name === 'drill');
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
    { view: 'practice', emoji: '🏃', title: '練習', desc: 'クイックレッスン・復習・苦手' },
    { view: 'smart', emoji: '⚡', title: 'スマートレビュー', desc: '習熟度と間隔反復で復習' },
    { view: 'patterns', emoji: '▶', title: 'パターン練習', desc: '短いお手本を聞いて、繰り返す' },
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
                <div class="studio-menu-icon">${icon(m.view)}</div>
                <div class="flex-1"><div class="font-bold text-gray-800 text-sm">${m.title}</div><div class="text-xs text-gray-500">${m.desc}</div></div>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg>
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
    document.documentElement.classList.add('apple', 'speak');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#000000');
  }
  function setTheme(t) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    applyTheme(t);
  }

  window.App = {
    escapeHtml,
    icon,
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

  // 画面の左下に版の番号を出す（iPad が新しい版を読んでいるかを、見て確かめられるように）
  window.APP_VERSION = 'v33';
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.id = 'app-version';
    b.textContent = '版 ' + window.APP_VERSION;
    b.style.cssText = 'position:fixed;left:8px;bottom:6px;z-index:60;font-size:11px;color:#6e6e73;pointer-events:none;';
    document.body.appendChild(b);
  });

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
    document.querySelectorAll('.sp-nav [data-top]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.top)));
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
