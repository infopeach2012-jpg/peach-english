/* sw.js — Service Worker（オフライン対応・アプリシェルキャッシュ） */
const CACHE = 'speak-studio-v34';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/studio.css',
  './assets/voice-sculpture.svg',
  './vendor/tailwind.min.css',
  './js/store.js',
  './js/speech.js',
  './js/app.js',
  './js/home.js',
  './js/speaking.js',
  './js/roleplay.js',
  './js/cards.js',
  './js/shadow.js',
  './js/listen.js',
  './js/lesson.js',
  './js/practice.js',
  './js/patterns.js',
  './js/smart.js',
  './js/drill.js',
  './js/achievements.js',
  './js/freetalk.js',
  './js/quiz.js',
  './js/stats.js',
  './js/dict.js',
  './js/review.js',
  './icon.svg',
  './manifest.webmanifest',
  './data/phrases.json',
  './data/patterns.json',
  './data/dialogues.json',
  './data/notes.json',
  './data/reading.json',
  './data/speeches.json',
  './data/situations.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 外部（CDN・API）はネットワークのみ
  if (url.origin !== self.location.origin) return;
  // 音声（audio/clips の mp3）は量が多く変わらないので cache-first。
  // それ以外（画面・プログラム・一覧）は network-first（つながれば必ず新しい版。つながらないときだけ保存した版）。
  const isClip = url.pathname.includes('/audio/clips/');
  if (isClip) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    fetch(new Request(req, { cache: 'no-store' })).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
