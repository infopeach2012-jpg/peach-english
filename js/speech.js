/* speech.js — 音声合成(TTS) + 音声認識(ASR) + 発音スコアリング
 * window.Speech として公開。Web Speech API を利用（Chrome / Edge / Safari）。
 */
(function () {
  'use strict';

  const synth = window.speechSynthesis || null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // ---- 音声(voice)の選定 ----
  // 端末にある英語音声のうち、自然な声（Premium / Enhanced / Natural / Neural / Google）を優先する。
  // ユーザーが選んだ声は localStorage 'speak.voice' に保存して優先する。
  const VOICE_KEY = 'speak.voice';
  let voices = [];
  let preferredVoice = null;
  function voiceScore(v) {
    const n = (v.name || '') + ' ' + (v.voiceURI || '');
    let s = 0;
    if (/premium/i.test(n)) s += 50;
    if (/enhanced/i.test(n)) s += 40;
    if (/natural|neural|online/i.test(n)) s += 40;   // Edge / Android の高品質音声
    if (/google/i.test(n)) s += 20;
    if (/siri/i.test(n)) s += 30;
    if (/compact/i.test(n)) s -= 30;
    if (/^en-US/i.test(v.lang)) s += 5; else if (/^en-GB/i.test(v.lang)) s += 3;
    if (/Samantha|Ava|Zoe|Allison|Nicky|Aaron|Evan|Tom|Karen|Daniel|Moira/i.test(v.name)) s += 2;
    return s;
  }
  function englishVoices() {
    return (voices || []).filter((v) => /^en(-|_|$)/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
  }
  function pickVoice() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    const en = englishVoices();
    let saved = null;
    try { saved = localStorage.getItem(VOICE_KEY); } catch (e) { /* noop */ }
    preferredVoice = (saved && en.find((v) => v.name === saved)) || en[0] || voices[0] || null;
  }
  if (synth) {
    pickVoice();
    synth.onvoiceschanged = () => { pickVoice(); try { window.dispatchEvent(new Event('speak:voices')); } catch (e) { /* noop */ } };
  }
  function listVoices() { return englishVoices().map((v) => ({ name: v.name, lang: v.lang, score: voiceScore(v), current: preferredVoice && v.name === preferredVoice.name })); }
  function setVoice(name) {
    try { if (name) localStorage.setItem(VOICE_KEY, name); else localStorage.removeItem(VOICE_KEY); } catch (e) { /* noop */ }
    pickVoice();
    return preferredVoice ? preferredVoice.name : '';
  }

  const ttsSupported = !!synth;
  const asrSupported = !!SR;

  // 日本語の音声（聞き流しの和訳読み上げ用）
  function pickJaVoice() {
    const ja = (synth ? synth.getVoices() || [] : []).filter((v) => /^ja(-|_|$)/i.test(v.lang));
    const order = [/Kyoko/i, /O-ren/i, /Google 日本語/i, /Nanami/i, /ja-JP/i];
    for (const rx of order) {
      const hit = ja.find((v) => rx.test(v.name) || rx.test(v.lang));
      if (hit) return hit;
    }
    return ja[0] || null;
  }

  // ---- 事前生成した音声（audio/*.mp3 + audio/audio_index.json） ----
  // index: { key: [file, start, dur] }。key はフレーズ p12・会話 d3a・長文 r1_0 など。
  // 端末の読み上げより自然なので、クリップがあるものはこちらを優先する。
  let clipIndex = null;
  const textToKey = {};
  const audioEl = (typeof Audio !== 'undefined') ? new Audio() : null;
  let clipStop = null;
  let clipEpoch = 0;
  let speechEpoch = 0;
  let ttsStop = null;
  let capture = null;
  function setAudioSession(type) {
    // Safari/iPad: restore the speaker playback route after microphone capture.
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (_) {}
  }
  function stopTts() {
    if (ttsStop) { const finish = ttsStop; ttsStop = null; finish(); }
    if (synth) { try { synth.cancel(); } catch (_) {} }
  }
  function suspendContext() {
    if (ctx && ctx.state === 'running') {
      try { return ctx.suspend().catch(() => {}); } catch (_) {}
    }
    return null;
  }
  function normText(t) { return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  async function loadClips(base) {
    try {
      // 毎回新しい一覧を取る（force-cache だと、iPad が古い一覧を使い続け、新しく作った音声を知らずに端末の声で読んでいた）
      const res = await fetch((base || 'audio/') + 'audio_index.json?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return false;
      clipIndex = await res.json();
      clipBase = base || 'audio/';
      return true;
    } catch (e) { return false; }
  }
  let clipBase = 'audio/';
  function registerText(text, key) { textToKey[normText(text)] = key; }
  function hasClip(key) { return !!(clipIndex && key && clipIndex[key]); }
  function clipKeyFor(text) { return textToKey[normText(text)] || null; }
  function stopClip() {
    clipEpoch++;
    if (clipStop) { const f = clipStop; clipStop = null; f(); }
  }
  // ---- Web Audio で区間を正確に再生（MP3 の seek に頼らない。seek が効かない端末で頭から鳴って途中で切れていた） ----
  const AC = window.AudioContext || window.webkitAudioContext || null;
  let ctx = null;
  const bufferCache = {};   // file -> AudioBuffer（直近3件だけ保持）
  const bufferOrder = [];
  const pending = {};
  function ensureCtx() {
    if (!AC) return null;
    if (!ctx) { try { ctx = new AC(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
    return ctx;
  }
  function decode(ab) {
    return new Promise((resolve, reject) => {
      try {
        const r = ctx.decodeAudioData(ab, resolve, reject);
        if (r && r.then) r.then(resolve, reject);
      } catch (e) { reject(e); }
    });
  }
  function loadBuffer(file) {
    if (bufferCache[file]) return Promise.resolve(bufferCache[file]);
    if (pending[file]) return pending[file];
    pending[file] = fetch(clipBase + file + '.mp3', { cache: 'force-cache' })
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
      .then(decode)
      .then((buf) => {
        bufferCache[file] = buf; bufferOrder.push(file);
        while (bufferOrder.length > 3) delete bufferCache[bufferOrder.shift()];
        delete pending[file];
        return buf;
      })
      .catch((e) => { delete pending[file]; throw e; });
    return pending[file];
  }
  function playClipWebAudio(ent, rate) {
    const [file, start, dur0] = ent;
    const c = ensureCtx();
    const epoch = clipEpoch;
    if (!c) return Promise.resolve(false);
    return loadBuffer(file).then((buf) => new Promise((resolve) => {
      if (epoch !== clipEpoch) { resolve(true); return; }
      const dur = dur0 == null ? Math.max(0, buf.duration - start) : dur0;
      if (c.state === 'suspended') { try { c.resume(); } catch (e) { /* noop */ } }
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      // 少し音量を下げて余裕を持たせる（0 dB まで振れている音声が iPad のスピーカーで割れないように）
      const gain = c.createGain(); gain.gain.value = 0.82;
      src.connect(gain); gain.connect(c.destination);
      let done = false;
      const finish = () => { if (done) return; done = true; clipStop = null; clearTimeout(guard); resolve(true); };
      src.onended = finish;
      clipStop = () => { try { src.stop(); } catch (e) { /* noop */ } finish(); };
      const guard = setTimeout(finish, (dur / rate) * 1000 + 2000);
      try { src.start(0, start, dur); } catch (e) { finish(); }
    })).catch(() => false);
  }
  // Whole MP3 files use the browser's media cache, without opening an AudioContext.
  const prefetching = new Map();
  function prefetchClip(key) {
    const ent = clipIndex && clipIndex[key];
    if (!ent) return;
    const file = typeof ent === 'string' ? ent : ent[0];
    if (prefetching.has(file)) return;
    const task = fetch(clipBase + file + '.mp3', { cache: 'force-cache' })
      .then(r => { if (r.ok) return r.arrayBuffer(); })
      .catch(() => {}).finally(() => prefetching.delete(file));
    prefetching.set(file, task);
  }

  function playClip(key, opts) {
    opts = opts || {};
    let ent = clipIndex && clipIndex[key];
    if (!ent) return Promise.resolve(false);
    stopTts();
    setAudioSession('playback');
    // 索引の値は [ファイル名, 開始秒, 長さ] か、ファイル名だけ（1文1ファイル。Codex などで作った音声向け）
    if (typeof ent === 'string') {
      // Whole clips use the media element to preserve the voice at faster speeds.
      return playClipElement([ent, 0, null], opts);
    }
    stopClip();
    const epoch = clipEpoch;
    if (AC) return playClipWebAudio(ent, opts.rate != null ? opts.rate : 1).then((ok) => epoch !== clipEpoch || ok || playClipElement(ent, opts));
    return playClipElement(ent, opts);
  }
  function playClipElement(ent, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!ent || !audioEl) { resolve(false); return; }
      stopClip();
      const [file, start, dur0] = ent;
      const rate = opts.rate != null ? opts.rate : 1;
      const src = clipBase + file + '.mp3';
      const dur = dur0 == null ? 30 : dur0;            // 1文1ファイルのときは ended で終わる
      const end = dur0 == null ? Infinity : start + dur;
      let finished = false, started = false;
      let seekGuard = null;
      let poll = null, watchdog = null;
      let lastT = -1, stallSince = 0;
      const cleanup = () => {
        clearInterval(poll); clearTimeout(watchdog); clearTimeout(seekGuard);
        audioEl.removeEventListener('ended', onEnd);
        audioEl.removeEventListener('error', onErr);
        audioEl.removeEventListener('canplay', onCanPlay);
        audioEl.removeEventListener('seeked', onSeeked);
      };
      const finish = (ok) => {
        if (finished) return; finished = true;
        cleanup();
        try { audioEl.pause(); } catch (e) { /* noop */ }
        clipStop = null;
        resolve(ok);
      };
      const onEnd = () => finish(true);
      const onErr = () => finish(false);
      clipStop = () => finish(true);

      // 3) 再生。終わりは「実際の再生位置」で判断する（時計で切ると読み込み待ちの分だけ早く切れる）
      const startPlayback = () => {
        if (finished || started) return;
        started = true;
        setAudioSession('playback');
        audioEl.preservesPitch = true;
        audioEl.webkitPreservesPitch = true;
        audioEl.playbackRate = rate;
        audioEl.volume = 0.82;
        const p = audioEl.play();
        if (p && p.catch) p.catch(() => finish(false));
        poll = setInterval(() => {
          if (finished) return;
          const t = audioEl.currentTime;
          if (t >= end - 0.03) { finish(true); return; }
          // 進んでいない（読み込み待ち）時間を数え、長く止まったら諦めて次へ
          if (t === lastT) { stallSince += 40; if (stallSince > 15000) finish(true); }
          else { stallSince = 0; lastT = t; }
        }, 40);
        // 念のための上限（本来の長さの3倍＋20秒）
        watchdog = setTimeout(() => finish(true), (dur / rate) * 3000 + 20000);
      };
      // 2) 頭出し。seeked を待ってから再生する（iPhone は読み込み前の seek が無視されることがある）
      const onSeeked = () => { audioEl.removeEventListener('seeked', onSeeked); startPlayback(); };
      const seekThenPlay = () => {
        if (finished) return;
        if (Math.abs(audioEl.currentTime - start) < 0.05) { startPlayback(); return; }
        audioEl.addEventListener('seeked', onSeeked);
        try { audioEl.currentTime = start; } catch (e) { audioEl.removeEventListener('seeked', onSeeked); startPlayback(); return; }
        // seeked が来ない端末向け
        seekGuard = setTimeout(() => { if (!finished && poll == null) { audioEl.removeEventListener('seeked', onSeeked); startPlayback(); } }, 1500);
      };
      // 1) ファイルの読み込み（別の場面に移ったときだけ）
      const onCanPlay = () => { audioEl.removeEventListener('canplay', onCanPlay); seekThenPlay(); };
      audioEl.addEventListener('ended', onEnd);
      audioEl.addEventListener('error', onErr);
      const changed = audioEl.src !== new URL(src, location.href).href;
      audioEl.preload = 'auto';
      if (dur0 == null) {
        // Call play() in the original tap; do not prime with empty audio or seek waits.
        if (changed) audioEl.src = src;
        else { try { audioEl.currentTime = 0; } catch (_) {} }
        startPlayback();
      } else if (changed || audioEl.readyState < 3) {
        audioEl.addEventListener('canplay', onCanPlay);
        if (changed) { audioEl.src = src; audioEl.load(); }
        watchdog = setTimeout(() => { if (!started) finish(false); }, 15000);
      } else {
        seekThenPlay();
      }
    });
  }
  function unlockAudio() {
    // The actual MP3 play() unlocks media. An unused AudioContext or play/pause of
    // an empty element can change iPad's audio route while TTS/recognition runs.
    if (!capture) setAudioSession('playback');
  }
  function releaseAudio() { suspendContext(); }

  // ---- 読み上げ ----
  // opts.lang = 'ja' で日本語音声。onend が来ない端末向けに見積もり時間で打ち切る。
  const SOURCE_KEY = 'speak.voiceSource';
  function getSource() { try { return localStorage.getItem(SOURCE_KEY) || 'clip'; } catch (e) { return 'clip'; } }
  function setSource(v) { try { localStorage.setItem(SOURCE_KEY, v); } catch (e) { /* noop */ } }
  function speak(text, opts) {
    opts = opts || {};
    stopSpeaking();
    const epoch = speechEpoch;
    const fallback = (ok, options) => {
      if (ok || epoch !== speechEpoch) return;
      return speakTts(text, options || opts);
    };
    const start = () => {
      if (epoch !== speechEpoch) return Promise.resolve();
      setAudioSession('playback');
      if (opts.lang !== 'ja' && getSource() === 'device') {
        return speakTts(text, Object.assign({}, opts, { rate: opts.slow ? 0.75 : (opts.rate ?? 1) }));
      }
      if (opts.lang !== 'ja') {
        const key = opts.key || clipKeyFor(text);
        if (opts.slow) {
          if (hasClip(key + '@slow')) return playClip(key + '@slow', { rate: 1 }).then(ok => fallback(ok, Object.assign({}, opts, { rate: 0.75 })));
          if (hasClip(key)) return playClip(key, { rate: 1 }).then(ok => fallback(ok, Object.assign({}, opts, { rate: 0.75 })));
          return speakTts(text, Object.assign({}, opts, { rate: 0.75 }));
        }
        const want = opts.rate ?? 1;
        const versions = [[1, key], [0.75, key + '@slow'], [1.25, key + '@fast'], [1.5, key + '@faster']].filter(c => hasClip(c[1]));
        if (versions.length) {
          versions.sort((a, b) => Math.abs(a[0] - want) - Math.abs(b[0] - want));
          return playClip(versions[0][1], Object.assign({}, opts, { rate: 1 })).then(ok => fallback(ok));
        }
      }
      return speakTts(text, opts);
    };
    if (capture) {
      const previous = capture;
      previous.cancel();
      return previous.finished.catch(() => {}).then(start);
    }
    return start();
  }
  function speakTts(text, opts) {
    opts = opts || {};
    stopClip();
    return new Promise((resolve) => {
      if (!synth || !text) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const rate = Math.max(0.5, Math.min(2, Number(opts.rate) || 1));
      if (opts.lang === 'ja') {
        const v = pickJaVoice();
        if (v) u.voice = v;
        u.lang = (v && v.lang) || 'ja-JP';
      } else {
        pickVoice();
        if (preferredVoice) u.voice = preferredVoice;
        u.lang = (preferredVoice && preferredVoice.lang) || 'en-US';
      }
      u.rate = rate;
      u.pitch = opts.pitch != null ? opts.pitch : 1;
      u.volume = 0.82;
      let done = false, guard = null;
      const finish = () => {
        if (done) return;
        done = true; clearTimeout(guard);
        u.onend = u.onerror = null;
        if (ttsStop === finish) ttsStop = null;
        resolve();
      };
      ttsStop = finish;
      u.onend = u.onerror = finish;
      const begin = () => {
        if (done) return;
        setAudioSession('playback');
        const perChar = opts.lang === 'ja' ? 150 : 90;
        guard = setTimeout(() => { finish(); try { synth.cancel(); } catch (_) {} }, Math.min(60000, text.length * perChar / rate + 2000) * 2);
        try { if (synth.paused) synth.resume(); synth.speak(u); } catch (_) { finish(); }
      };
      const suspended = suspendContext();
      if (suspended) suspended.then(begin);
      else begin();
    });
  }
  function stopSpeaking() {
    speechEpoch++;
    stopClip();
    stopTts();
    suspendContext();
  }

  // ---- 音声認識（1回分） ----
  // onPartial(text) で暫定結果を通知。resolve で最終transcript。
  function listenOnce(opts) {
    opts = opts || {};
    if (!SR) return Promise.reject(new Error('unsupported'));
    if (capture) capture.cancel();
    stopSpeaking();
    const owner = { finished: null, cancel: null };
    const finished = new Promise((resolve, reject) => {
      const rec = new SR();
      rec.lang = opts.lang || 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let finalText = '', settled = false, cancelled = false, failure = null, guard = null;
      const done = () => {
        if (settled) return;
        settled = true; clearTimeout(guard);
        rec.onresult = rec.onerror = rec.onend = null;
        if (capture === owner) { capture = null; setAudioSession('playback'); }
        if (failure && !cancelled) reject(failure);
        else resolve(cancelled ? '' : finalText.trim());
      };
      const requestStop = (abort) => {
        if (settled) return;
        clearTimeout(guard);
        // Some browsers omit onend after permission/error/cancel. Always release.
        guard = setTimeout(done, 1500);
        try { if (abort) rec.abort(); else rec.stop(); } catch (_) { done(); }
      };
      owner.cancel = () => { cancelled = true; requestStop(true); };
      capture = owner;
      rec.onresult = (ev) => {
        if (cancelled) return;
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalText += r[0].transcript + ' ';
          else interim += r[0].transcript;
        }
        if (opts.onPartial) opts.onPartial((finalText + ' ' + interim).trim());
      };
      rec.onerror = (ev) => { failure = new Error(ev.error || 'asr-error'); requestStop(true); };
      rec.onend = done;
      if (opts.ref) { opts.ref.stop = () => requestStop(false); opts.ref.cancel = owner.cancel; }
      setAudioSession('play-and-record');
      try { rec.start(); } catch (e) { failure = e; done(); }
    });
    owner.finished = finished;
    if (opts.ref) opts.ref.finished = finished;
    return finished;
  }

  // ---- 発音スコアリング ----
  function normalizeWord(w) {
    return (w || '')
      .toLowerCase()
      .replace(/[^a-z0-9']/g, '')
      .replace(/^'+|'+$/g, '');
  }
  // よくある短縮形を複数語に展開（採点の表記ゆれ吸収）
  const CONTRACT = {
    "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'],
    "it's": ['it', 'is'], "that's": ['that', 'is'], "he's": ['he', 'is'], "she's": ['she', 'is'],
    "what's": ['what', 'is'], "who's": ['who', 'is'], "there's": ['there', 'is'], "here's": ['here', 'is'],
    "let's": ['let', 'us'], "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'],
    "can't": ['can', 'not'], "cannot": ['can', 'not'], "won't": ['will', 'not'], "wouldn't": ['would', 'not'],
    "couldn't": ['could', 'not'], "shouldn't": ['should', 'not'], "isn't": ['is', 'not'], "aren't": ['are', 'not'],
    "wasn't": ['was', 'not'], "weren't": ['were', 'not'], "haven't": ['have', 'not'], "hasn't": ['has', 'not'],
    "hadn't": ['had', 'not'], "i'll": ['i', 'will'], "you'll": ['you', 'will'], "we'll": ['we', 'will'],
    "they'll": ['they', 'will'], "i've": ['i', 'have'], "you've": ['you', 'have'], "we've": ['we', 'have'],
    "they've": ['they', 'have'], "i'd": ['i', 'would'], "you'd": ['you', 'would'], "wanna": ['want', 'to'],
    "gonna": ['going', 'to'], "gotta": ['got', 'to'],
  };
  function tokenize(s) {
    const out = [];
    (s || '').split(/\s+/).forEach((raw) => {
      const w = raw.toLowerCase().replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
      if (!w) return;
      if (CONTRACT[w]) out.push(...CONTRACT[w]);
      else out.push(normalizeWord(w));
    });
    return out.filter(Boolean);
  }
  // よくある数字・短縮の表記ゆれを吸収
  const NUM = { '1':'one','2':'two','3':'three','4':'four','5':'five','6':'six','7':'seven','8':'eight','9':'nine','10':'ten','0':'zero' };
  function canon(w) {
    if (NUM[w]) return NUM[w];
    return w
      .replace(/n't$/, 'not')
      .replace(/'re$/, 'are')
      .replace(/'ll$/, 'will')
      .replace(/'ve$/, 'have')
      .replace(/'m$/, 'am');
  }

  // target の各単語について、認識結果に含まれるか判定。
  // 返り値: { score, tokens:[{word,ok}], matched, total }
  function score(target, said) {
    const tgt = tokenize(target);
    const heard = tokenize(said).map(canon);
    const pool = heard.slice(); // 消費式マッチ（重複語対応）
    const tokens = [];
    let matched = 0;
    for (const raw of tgt) {
      const w = canon(raw);
      let ok = false;
      // 完全一致を優先
      let idx = pool.indexOf(w);
      if (idx === -1) {
        // 前方3文字一致の近似（語尾変化の許容）
        idx = pool.findIndex((h) => h.length > 2 && w.length > 2 && (h.startsWith(w.slice(0, 3)) && Math.abs(h.length - w.length) <= 2 && lev(h, w) <= 1));
      }
      if (idx !== -1) { ok = true; matched++; pool.splice(idx, 1); }
      tokens.push({ word: raw, ok });
    }
    const total = tgt.length || 1;
    const s = Math.round((matched / total) * 100);
    return { score: s, tokens, matched, total };
  }

  // レーベンシュタイン距離（短い語の近似判定用）
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 99;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
    return dp[m][n];
  }

  // ---- 録音（自分の声を録って聞き比べ） ----
  const recordSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  async function startRecording() {
    if (!recordSupported) throw new Error('unsupported');
    stopSpeaking();
    setAudioSession('play-and-record');
    let stream, rec;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream);
    } catch (error) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      setAudioSession('playback');
      throw error;
    }
    const chunks = [];
    const done = new Promise((resolve) => {
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioSession('playback');
        resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) : null);
      };
    });
    try { rec.start(); } catch (error) { stream.getTracks().forEach(t => t.stop()); setAudioSession('playback'); throw error; }
    return { stop: () => { try { rec.stop(); } catch (e) {} }, done };
  }

  // 音声認識エラーを日本語の案内に変換
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function errorMessage(err) {
    const c = (err && err.message) || '';
    if (c === 'unsupported' || !asrSupported) {
      return isIOS
        ? 'iPhone/iPadのブラウザは音声認識に非対応です。PCのChromeをご利用ください'
        : 'このブラウザは音声認識に非対応です（Chrome/Edge推奨）';
    }
    if (/not-allowed|service-not-allowed/.test(c)) return 'マイクの使用が許可されていません。ブラウザのマイク許可を確認してください';
    if (/audio-capture/.test(c)) return 'マイクが見つかりません。接続と許可を確認してください';
    if (/no-speech/.test(c)) return '音声が検出されませんでした。もう一度お試しください';
    if (/network/.test(c)) return 'ネットワークエラーです。接続を確認してください';
    return 'もう一度お試しください';
  }

  window.Speech = {
    listVoices, setVoice, getSource, setSource,
    loadClips, registerText, hasClip, clipKeyFor, playClip, unlockAudio, releaseAudio, prefetchClip,
    get clipsLoaded() { return !!clipIndex; },
    ttsSupported,
    asrSupported,
    recordSupported,
    isIOS,
    speak,
    stopSpeaking,
    listenOnce,
    startRecording,
    score,
    errorMessage,
  };
})();
