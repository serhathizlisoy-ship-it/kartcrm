// Service worker devre dışı
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
});
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});