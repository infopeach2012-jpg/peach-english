/* achievements.js — 達成バッジ（ゲーミフィケーション）。window.Achievements */
(function () {
  'use strict';

  // cond(P, ctx) が真になったら解除。ctx は集計値。
  const DEFS = [
    { id: 'lesson1', emoji: '🎓', title: '第一歩', desc: '今日のレッスンを初完了', cond: (c) => c.lessons >= 1 },
    { id: 'streak3', emoji: '🔥', title: '三日坊主卒業', desc: '3日連続で学習', cond: (c) => c.streak >= 3 },
    { id: 'streak7', emoji: '🔥', title: '一週間ランナー', desc: '7日連続で学習', cond: (c) => c.streak >= 7 },
    { id: 'streak30', emoji: '👑', title: '継続は力なり', desc: '30日連続で学習', cond: (c) => c.streak >= 30 },
    { id: 'talk50', emoji: '🗣️', title: 'おしゃべり', desc: '発話50回を達成', cond: (c) => c.attempts >= 50 },
    { id: 'talk200', emoji: '🎤', title: 'スピーカー', desc: '発話200回を達成', cond: (c) => c.attempts >= 200 },
    { id: 'perfect', emoji: '💯', title: '完璧な発音', desc: '発音100点を獲得', cond: (c) => c.maxScore >= 100 },
    { id: 'cards50', emoji: '🎴', title: '語彙ビルダー', desc: 'カード50枚を習得', cond: (c) => c.learned >= 50 },
    { id: 'cards200', emoji: '📚', title: '単語の達人', desc: 'カード200枚を習得', cond: (c) => c.learned >= 200 },
    { id: 'lv5', emoji: '⭐', title: 'レベル5到達', desc: 'レベル5に到達', cond: (c) => c.level >= 5 },
    { id: 'lv10', emoji: '🌟', title: 'レベル10到達', desc: 'レベル10に到達', cond: (c) => c.level >= 10 },
    { id: 'xp1000', emoji: '🏆', title: 'XPハンター', desc: '累計1000XPを獲得', cond: (c) => c.xp >= 1000 },
  ];

  function ctx() {
    const S = window.Store;
    const P = S.progress;
    const deck = window.CardsView ? window.CardsView.buildDeck() : [];
    const srs = window.CardsView ? S.srsSummary(deck) : { learned: 0 };
    return {
      lessons: Object.keys(P.lessonDone || {}).length,
      streak: P.streak.count,
      attempts: (P.speaking || []).length,
      maxScore: (P.speaking || []).reduce((m, r) => Math.max(m, r.score), 0),
      learned: srs.learned,
      level: S.levelInfo().level,
      xp: P.xp,
    };
  }

  function check(opts) {
    const silent = opts && opts.silent;
    const S = window.Store;
    if (!S.progress.achievements) S.progress.achievements = {};
    const got = S.progress.achievements;
    const c = ctx();
    let unlocked = null;
    let changed = false;
    DEFS.forEach((d) => {
      if (!got[d.id] && d.cond(c)) {
        got[d.id] = window.Store.todayStr();
        unlocked = d;
        changed = true;
      }
    });
    if (changed) S.save();
    if (unlocked && !silent) celebrate(unlocked);
  }

  // 起動時: 既に条件を満たすバッジを演出なしで反映
  function sync() { check({ silent: true }); }

  function celebrate(d) {
    const div = document.createElement('div');
    div.innerHTML = `<div class="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-6" id="ach-ov">
      <div class="bg-white rounded-3xl p-6 text-center max-w-[300px] shadow-2xl" style="animation:fade .3s ease">
        <div class="text-xs font-bold text-brand">バッジ獲得！</div>
        <div class="text-6xl my-3">${d.emoji}</div>
        <div class="text-lg font-extrabold text-gray-800">${d.title}</div>
        <div class="text-sm text-gray-500 mt-1">${d.desc}</div>
        <button id="ach-close" class="w-full mt-5 brand-grad text-white rounded-xl py-2.5 font-bold">やったー！</button>
      </div></div>`;
    document.body.appendChild(div);
    const close = () => div.remove();
    div.querySelector('#ach-close').onclick = close;
    div.querySelector('#ach-ov').onclick = (e) => { if (e.target.id === 'ach-ov') close(); };
  }

  function all() {
    const got = window.Store.progress.achievements || {};
    return DEFS.map((d) => ({ ...d, unlocked: !!got[d.id], at: got[d.id] || null }));
  }

  window.Achievements = { check, sync, all, DEFS };
})();
