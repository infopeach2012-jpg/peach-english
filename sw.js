/* sw.js — Service Worker（オフライン対応・アプリシェルキャッシュ） */
const CACHE = 'speak-studio-v23';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
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
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => {})
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
  // 同一オリジンは cache-first → ネットワークfallback
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});
