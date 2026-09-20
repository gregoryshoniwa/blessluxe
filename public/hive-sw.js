/*
 * Bless Hive — service worker. Deliberately tiny.
 *
 * It exists for two things: so phones offer "Add to Home Screen" (installability
 * needs a worker with a fetch handler), and so opening the app with no signal
 * shows a friendly page instead of the browser's dinosaur.
 *
 * It does NOT cache pages, API responses, or the JS bundle. This shop deploys
 * often and prices change; a stale cached storefront is a worse bug than no
 * offline mode. Everything goes to the network, exactly as without a worker.
 */
const OFFLINE = 'hive-offline-v1';
const PAGE = '/hive-offline.html';

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(OFFLINE).then((c) => c.add(PAGE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
    // Only full-page navigations get the offline fallback; everything else is untouched.
    if (e.request.mode !== 'navigate') return;
    e.respondWith(fetch(e.request).catch(() => caches.match(PAGE)));
});
