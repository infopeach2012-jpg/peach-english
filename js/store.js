/* store.js — データ読み込み + 進捗/SRS/ゲーミフィケーション永続化レイヤ
 * window.Store としてグローバル公開。localStorage に永続化。
 */
(function () {
  'use strict';

  const PROGRESS_KEY = 'speak.progress.v1';
  const DATA_FILES = {
    phrases: 'data/phrases.json',
    dialogues: 'data/dialogues.json',
    notes: 'data/notes.json',
    noteBatches: 'data/note_batches.json',
    reading: 'data/reading.json',
    speeches: 'data/speeches.json',
    situations: 'data/situations.json', // { "p12": "food", "d3": "shop", ... } 聞き流し用の場面分け
  };

  // ---- 学習コンテンツ（読み取り専用・メモリ内） ----
  const content = {
    phrases: [],
    dialogues: [],
    notes: [],
    noteBatches: [],
    reading: [],
    speeches: [],
  };

  // ---- 進捗（localStorage 永続化） ----
  const defaultProgress = () => ({
    xp: 0,
    streak: { count: 0, lastDate: '' },
    daily: {}, // 'YYYY-MM-DD': { count }
    speaking: [], // { key, score, date } 直近200件
    srs: {}, // cardKey -> { ease, interval, due, reps, lapses, lastScore, lastReview }
    done: { speaking: {}, roleplay: {}, shadow: {} },
    favorites: {},
    goal: 15,
  });

  let progress = defaultProgress();

  function load() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (raw) progress = Object.assign(defaultProgress(), JSON.parse(raw));
    } catch (e) {
      progress = defaultProgress();
    }
  }
  function save() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (e) {
      /* quota 超過などは黙って無視 */
    }
  }

  // ---- 日付ユーティリティ ----
  function todayStr(d) {
    d = d || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function daysBetween(a, b) {
    const ms = new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00');
    return Math.round(ms / 86400000);
  }

  // ---- ストリーク ----
  function touchStreak() {
    const t = todayStr();
    const last = progress.streak.lastDate;
    if (last === t) return;
    if (!last) {
      progress.streak = { count: 1, lastDate: t };
    } else {
      const gap = daysBetween(last, t);
      if (gap === 1) progress.streak.count += 1;
      else if (gap > 1) progress.streak.count = 1;
      progress.streak.lastDate = t;
    }
  }

  // ---- 今日のカウント ----
  function bumpDaily(n) {
    const t = todayStr();
    if (!progress.daily[t]) progress.daily[t] = { count: 0 };
    progress.daily[t].count += (n || 1);
  }
  function todayCount() {
    return (progress.daily[todayStr()] || {}).count || 0;
  }

  // ---- XP / レベル ----
  // レベルは累積XPの平方根ベース。level n には n*n*40 XP 必要。
  function levelFromXp(xp) {
    return Math.max(1, Math.floor(Math.sqrt(xp / 40)) + 1);
  }
  function xpForLevel(lv) {
    return (lv - 1) * (lv - 1) * 40;
  }
  function addXp(n) {
    progress.xp += n;
  }
  function levelInfo() {
    const lv = levelFromXp(progress.xp);
    const cur = xpForLevel(lv);
    const next = xpForLevel(lv + 1);
    return {
      level: lv,
      xp: progress.xp,
      into: progress.xp - cur,
      span: next - cur,
      pct: Math.min(100, Math.round(((progress.xp - cur) / (next - cur)) * 100)),
    };
  }

  // 学習1アクション完了時の共通記録。points はXP加算量。
  function recordActivity(points) {
    touchStreak();
    bumpDaily(1);
    addXp(points || 0);
    save();
  }

  // ---- スピーキングのスコア記録 ----
  function recordSpeaking(key, score) {
    progress.speaking.push({ key, score, date: todayStr() });
    if (progress.speaking.length > 200) progress.speaking = progress.speaking.slice(-200);
    // スコアに応じてXP（0〜15）
    recordActivity(Math.round((score / 100) * 15) + 3);
  }
  function speakingStats() {
    const arr = progress.speaking;
    if (!arr.length) return { attempts: 0, avg: 0 };
    const sum = arr.reduce((s, x) => s + x.score, 0);
    return { attempts: arr.length, avg: Math.round(sum / arr.length) };
  }

  function markDone(mode, id) {
    if (!progress.done[mode]) progress.done[mode] = {};
    progress.done[mode][id] = true;
  }
  function isDone(mode, id) {
    return !!(progress.done[mode] && progress.done[mode][id]);
  }
  function doneCount(mode) {
    return Object.keys(progress.done[mode] || {}).length;
  }

  // ---- SRS（簡易SM-2） ----
  // grade: 0=もう一度, 3=難しい, 4=普通, 5=簡単
  function srsReview(cardKey, grade) {
    const t = todayStr();
    let c = progress.srs[cardKey] || { ease: 2.5, interval: 0, due: t, reps: 0, lapses: 0 };
    if (grade < 3) {
      c.reps = 0;
      c.interval = 0; // 今日中に再出題
      c.lapses += 1;
      c.due = t;
    } else {
      c.ease = Math.max(1.3, c.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
      c.reps += 1;
      if (c.reps === 1) c.interval = 1;
      else if (c.reps === 2) c.interval = 3;
      else c.interval = Math.round(c.interval * c.ease);
      const d = new Date();
      d.setDate(d.getDate() + c.interval);
      c.due = todayStr(d);
    }
    c.lastScore = grade;
    c.lastReview = t;
    progress.srs[cardKey] = c;
    recordActivity(grade < 3 ? 2 : 6);
  }
  function srsState(cardKey) {
    return progress.srs[cardKey] || null;
  }
  // 出題対象: 期限到来 or 未学習。deck=[{key,...}]
  function srsDue(deck) {
    const t = todayStr();
    const due = [];
    const fresh = [];
    for (const card of deck) {
      const s = progress.srs[card.key];
      if (!s) fresh.push(card);
      else if (s.due <= t) due.push(card);
    }
    return { due, fresh, total: deck.length };
  }
  function srsSummary(deck) {
    const t = todayStr();
    let learned = 0, dueNow = 0;
    for (const card of deck) {
      const s = progress.srs[card.key];
      if (s) {
        learned++;
        if (s.due <= t) dueNow++;
      }
    }
    return { learned, dueNow, total: deck.length };
  }

  // ---- データ読み込み ----
  async function init() {
    load();
    if (window.__DATA__) {
      // 単一ファイル版：埋め込みデータを使用（fetch不要）
      Object.keys(DATA_FILES).forEach((key) => { content[key] = window.__DATA__[key] || []; });
    } else {
      const entries = Object.entries(DATA_FILES);
      await Promise.all(
        entries.map(async ([key, url]) => {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            content[key] = await res.json();
          } catch (e) {
            console.error('load failed', url, e);
            content[key] = [];
          }
        })
      );
    }
    // フレーズを「単語」と「文」に分類（語数で判定）＋ 場面（situation）を付ける
    const sit = (content.situations && !Array.isArray(content.situations)) ? content.situations : {};
    content.situations = sit;
    content.phrases.forEach((p) => {
      const words = (p.en || '').trim().split(/\s+/).length;
      p.kind = words <= 2 ? 'word' : 'sentence';
      p.sit = sit['p' + p.id] || 'grammar';
    });
    content.dialogues.forEach((d) => { d.sit = sit['d' + d.id] || 'greet'; });
    buildKeyIndex();
    // 事前生成の音声（あれば）を読み込み、本文→キーの対応を登録する
    if (window.Speech && window.Speech.loadClips) {
      const base = window.__AUDIO_BASE__ || 'audio/';
      await window.Speech.loadClips(base);
      content.phrases.forEach((p) => window.Speech.registerText(p.en, 'p' + p.id));
      content.notes.forEach((n) => { if (n.en) window.Speech.registerText(n.en, 'n' + n.id); });
      content.dialogues.forEach((d) => { window.Speech.registerText(d.a, 'd' + d.id + 'a'); window.Speech.registerText(d.b, 'd' + d.id + 'b'); });
      // 長文は文ごと（r1_0 / s1_0）。スピーチは同じセクションを1章にまとめる（listen.js と同じ）
      const split = (t) => ((t || '').match(/[^.!?]+[.!?]*/g) || [t]).map((x) => x.trim()).filter(Boolean);
      content.reading.forEach((r) => split(r.en).forEach((x, i) => window.Speech.registerText(x, 'r' + r.id + '_' + i)));
      const secs = {};
      content.speeches.forEach((sp) => { const g = sp.section || 'スピーチ'; if (!secs[g]) secs[g] = { key: 's' + sp.id, en: '' }; secs[g].en += (secs[g].en ? ' ' : '') + sp.en; });
      Object.values(secs).forEach((g) => split(g.en).forEach((x, i) => window.Speech.registerText(x, g.key + '_' + i)));
    }
    return content;
  }

  // ---- キー→コンテンツ解決（p123/n45/d3） ----
  const keyIndex = {};
  function buildKeyIndex() {
    content.phrases.forEach((p) => { keyIndex['p' + p.id] = { key: 'p' + p.id, en: p.en, ja: p.ja, note: p.note, src: 'フレーズ' }; });
    content.notes.forEach((n) => { keyIndex['n' + n.id] = { key: 'n' + n.id, en: n.en, ja: n.ja, note: n.note, src: 'ノート' }; });
    content.dialogues.forEach((d) => { keyIndex['d' + d.id] = { key: 'd' + d.id, en: d.b, ja: d.bJa, note: d.note, src: '会話' }; });
  }
  function resolveKey(key) { return keyIndex[key] || null; }

  // ---- お気に入り ----
  function toggleFavorite(key) {
    if (!progress.favorites) progress.favorites = {};
    if (progress.favorites[key]) delete progress.favorites[key];
    else progress.favorites[key] = todayStr();
    save();
    return !!progress.favorites[key];
  }
  function isFavorite(key) { return !!(progress.favorites && progress.favorites[key]); }
  function favoriteItems() {
    return Object.keys(progress.favorites || {}).map(resolveKey).filter(Boolean);
  }

  // ---- 苦手フレーズ（直近スコアが低い / SRSでつまずいた） ----
  function weakItems() {
    // 発音履歴からキーごとの最新スコアを取る
    const latest = {};
    (progress.speaking || []).forEach((r) => {
      if (r.key && resolveKey(r.key)) latest[r.key] = r.score;
    });
    const weak = new Map();
    Object.entries(latest).forEach(([key, score]) => {
      if (score < 60) { const it = resolveKey(key); if (it) weak.set(key, { ...it, score }); }
    });
    // SRSでlapsesの多いカードも苦手扱い
    Object.entries(progress.srs || {}).forEach(([key, s]) => {
      if (s.lapses >= 2 && resolveKey(key) && !weak.has(key)) weak.set(key, { ...resolveKey(key), score: null });
    });
    return Array.from(weak.values());
  }

  function resetProgress() {
    progress = defaultProgress();
    save();
  }

  window.Store = {
    init,
    content,
    // progress accessors
    get progress() { return progress; },
    save,
    todayStr,
    recordActivity,
    recordSpeaking,
    speakingStats,
    markDone,
    isDone,
    doneCount,
    // streak / xp
    touchStreak,
    todayCount,
    levelInfo,
    // srs
    srsReview,
    srsState,
    srsDue,
    srsSummary,
    resetProgress,
    // 解決 / お気に入り / 苦手
    resolveKey,
    toggleFavorite,
    isFavorite,
    favoriteItems,
    weakItems,
  };
})();
