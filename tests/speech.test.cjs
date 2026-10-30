const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('js/speech.js', 'utf8');
const tick = () => new Promise(r => setImmediate(r));

function setup({ sessionAPI = true, recording = false } = {}) {
  const state = { contexts: [], media: [], spoken: [], recognizers: [], fetches: [], mode: 'auto' };
  class Audio {
    constructor() { this.events = {}; this.paused = true; this.currentTime = 0; this.readyState = 4; this.dataset = {}; state.media.push(this); }
    set src(v) { this.url = new URL(v, 'https://example.test/').href; this.currentTime = 0; }
    get src() { return this.url || ''; }
    addEventListener(n, f) { (this.events[n] ||= new Set()).add(f); }
    removeEventListener(n, f) { this.events[n]?.delete(f); }
    emit(n) { for (const f of [...(this.events[n] || [])]) f(); }
    load() { queueMicrotask(() => this.emit('canplay')); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  class Context {
    constructor() { this.state = 'running'; state.contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    decodeAudioData(_buf, done) { const b = { duration: 1 }; done(b); return Promise.resolve(b); }
    createBufferSource() { return { playbackRate: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: {}, connect() {} }; }
  }
  class Recognition {
    constructor() { state.recognizers.push(this); this.active = false; }
    start() { this.active = true; }
    stop() { this.active = false; queueMicrotask(() => this.onend?.()); }
    abort() { this.active = false; queueMicrotask(() => this.onend?.()); }
    result(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
  }
  const synth = {
    speaking: false, paused: false,
    getVoices() { return [{ name: 'Samantha', lang: 'en-US' }]; },
    speak(u) { this.speaking = true; state.spoken.push({ u, mode: state.mode, microphoneActive: state.recognizers.some(r => r.active), contextActive: state.contexts.some(c => c.state === 'running') }); },
    cancel() { this.speaking = false; /* iOS may not dispatch an end event on cancel. */ },
    resume() { this.paused = false; },
  };
  const index = { p1: 'clips/p1', 'p1@slow': 'clips/p1_slow', 'p1@fast': 'clips/p1_fast', legacy: ['legacy', 0, 1] };
  const navigator = { userAgent: 'iPad', platform: 'MacIntel', maxTouchPoints: 5 };
  if (sessionAPI) navigator.audioSession = { get type() { return state.mode; }, set type(v) { state.mode = v; } };
  const sandbox = { Audio, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } }, URL,
    navigator, location: { href: 'https://example.test/' }, localStorage: { getItem() { return null; }, setItem() {} },
    fetch: async url => { state.fetches.push(url); return { ok: true, json: async () => index, arrayBuffer: async () => new ArrayBuffer(8) }; },
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return t; }, clearTimeout,
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); t.unref(); return t; }, clearInterval,
  };
  if (recording) {
    state.trackStopped = false;
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() { state.trackStopped = true; } }] }) };
    sandbox.MediaRecorder = class {
      start() {}
      stop() { queueMicrotask(() => this.onstop?.()); }
    };
  }
  sandbox.window = { MediaRecorder: sandbox.MediaRecorder, speechSynthesis: synth, AudioContext: Context, SpeechRecognition: Recognition, dispatchEvent() {} };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  return { state, synth, speech: sandbox.window.Speech, sandbox };
}

test('whole-file playback and prefetch never start a second audio engine', { timeout: 2000 }, async () => {
  const { state, speech } = setup(); await speech.loadClips();
  speech.unlockAudio(); speech.prefetchClip('p1'); speech.speak('Hello', { key: 'p1' }); await tick();
  assert.equal(state.contexts.length, 0);
  assert.equal(state.media[0].paused, false);
  assert.equal(state.mode, 'playback');
  speech.stopSpeaking();
});

test('recorded audio interrupts device TTS instead of mixing with it', { timeout: 2000 }, async () => {
  const { speech, synth, state } = setup(); await speech.loadClips();
  speech.speak('A new AI reply'); await tick(); assert.equal(synth.speaking, true);
  speech.speak('Hello', { key: 'p1' }); await tick();
  assert.equal(synth.speaking, false); assert.equal(state.media[0].paused, false);
  speech.stopSpeaking();
});

test('device TTS stops the old clip before starting', { timeout: 2000 }, async () => {
  const { speech, state } = setup(); await speech.loadClips();
  speech.speak('Hello', { key: 'p1' }); await tick();
  speech.speak('An unrecorded AI reply'); await tick();
  assert.equal(state.media[0].paused, true); assert.equal(state.spoken.length, 1);
  assert.equal(state.spoken[0].contextActive, false);
  speech.stopSpeaking();
});

test('cancel settles TTS even when the browser sends no end event', { timeout: 2000 }, async () => {
  const { speech } = setup(); let resolved = false;
  speech.speak('An AI reply').then(() => { resolved = true; }); await tick();
  speech.stopSpeaking(); await tick(); assert.equal(resolved, true);
});

test('slow AI replay uses the requested rate and a stable pitch', { timeout: 2000 }, async () => {
  const { speech, state } = setup(); speech.speak('An AI reply', { rate: 0.75, slow: true }); await tick();
  assert.equal(state.spoken[0].u.rate, 0.75); assert.equal(state.spoken[0].u.pitch, 1);
  speech.stopSpeaking();
});

test('recognition releases the microphone and restores playback before the reply', { timeout: 2000 }, async () => {
  const { speech, state } = setup(); const ref = {};
  const heard = speech.listenOnce({ ref });
  assert.equal(state.mode, 'play-and-record');
  state.recognizers[0].result('Hello there'); ref.stop();
  assert.equal(await heard, 'Hello there');
  speech.speak('Nice to meet you'); await tick();
  assert.equal(state.spoken[0].microphoneActive, false);
  assert.equal(state.spoken[0].mode, 'playback'); speech.stopSpeaking();
});

test('replay cancels active recognition before any speech output', { timeout: 2000 }, async () => {
  const { speech, state } = setup(); const heard = speech.listenOnce({ ref: {} });
  speech.speak('Replay the reply'); await tick(); await tick();
  assert.equal(await heard, ''); assert.equal(state.spoken.length, 1);
  assert.equal(state.spoken[0].microphoneActive, false); speech.stopSpeaking();
});

test('late legacy fetch failure cannot restart speech after leaving', { timeout: 2000 }, async () => {
  const { speech, state, sandbox } = setup(); await speech.loadClips();
  let reject; sandbox.fetch = () => new Promise((_, no) => { reject = no; });
  speech.speak('Old reply', { key: 'legacy' }); await tick(); speech.stopSpeaking();
  reject(new Error('offline')); await tick(); await tick();
  assert.equal(state.media[0].paused, true); assert.equal(state.spoken.length, 0);
});

test('playback works without the optional Audio Session API', { timeout: 2000 }, async () => {
  const { speech, state } = setup({ sessionAPI: false }); await speech.loadClips();
  speech.speak('Hello', { key: 'p1' }); await tick(); assert.equal(state.media[0].paused, false);
  speech.stopSpeaking();
});


test('voice recording releases its track and restores speaker playback', { timeout: 2000 }, async () => {
  const { speech, state } = setup({ recording: true });
  const rec = await speech.startRecording();
  assert.equal(state.mode, 'play-and-record');
  rec.stop(); await rec.done;
  assert.equal(state.trackStopped, true); assert.equal(state.mode, 'playback');
});

test('microphone permission denial does not leave the audio route in capture mode', { timeout: 2000 }, async () => {
  const { speech, state, sandbox } = setup({ recording: true });
  sandbox.navigator.mediaDevices.getUserMedia = async () => { throw new Error('denied'); };
  await assert.rejects(speech.startRecording(), /denied/);
  assert.equal(state.mode, 'playback');
});
