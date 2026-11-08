// Deterministic device speech for browser tests. English still uses real MP3s.
// This checks sequencing/cancellation, not the sound of a device's Japanese voice.
module.exports = function installJapaneseTts() {
  const audit = window.japaneseTts = { events: [], pending: null, automatic: true };
  const voices = [{ name: 'Samantha', lang: 'en-US' }, { name: 'Kyoko', lang: 'ja-JP' }];
  const end = (u) => {
    if (!u || audit.pending !== u) return;
    audit.pending = null;
    audit.events.push({ event: 'end', text: u.text });
    u.onend?.();
  };
  audit.finish = () => end(audit.pending);
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { value: {
    paused: false,
    get speaking() { return !!audit.pending; },
    getVoices() { return voices; },
    speak(u) {
      audit.pending = u;
      audit.events.push({ event: 'start', text: u.text, lang: u.lang, voice: u.voice?.name, rate: u.rate });
      if (audit.automatic) setTimeout(() => end(u), 30);
    },
    cancel() {
      if (audit.pending) audit.events.push({ event: 'cancel', text: audit.pending.text });
      audit.pending = null;
      // Safari can cancel without an onend callback.
    },
    resume() { this.paused = false; },
  } });
};
