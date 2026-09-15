/**
 * sw.js — app-shell cache for offline use.
 *
 * Bump CACHE_NAME whenever any cached file changes so clients pick up the
 * new version instead of serving stale files forever.
 */
const CACHE_NAME = 'dr-pwa-shell-v19';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './fundus-check.js',
  './quality-gate.js',
  './inference.js',
  './pdf-report.js',
  './segmentation.js',
  './referral-engine.js',
  './export.js',
  './i18n.js',
  './strings/en.json',
  './strings/hi.json',
  './manifest.json',
  './tf.min.js',
  './jspdf.umd.min.js',
  './tfjs_model/model.json',
  './tfjs_model/group1-shard1of11.bin',
  './tfjs_model/group1-shard2of11.bin',
  './tfjs_model/group1-shard3of11.bin',
  './tfjs_model/group1-shard4of11.bin',
  './tfjs_model/group1-shard5of11.bin',
  './tfjs_model/group1-shard6of11.bin',
  './tfjs_model/group1-shard7of11.bin',
  './tfjs_model/group1-shard8of11.bin',
  './tfjs_model/group1-shard9of11.bin',
  './tfjs_model/group1-shard10of11.bin',
  './tfjs_model/group1-shard11of11.bin',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './fonts/LeagueSpartan-Regular.woff2',
  './fonts/LeagueSpartan-SemiBold.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// cache-first for app shell, falling back to network; network requests that
// succeed are also stashed into the cache so the app keeps working offline
// even for files fetched after first install.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
