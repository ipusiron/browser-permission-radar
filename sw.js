/**
 * Browser Permission Radar — Background Sync の体験用の Service Worker
 *
 * 「Background Sync」のボタンを押したときだけ登録される。
 * fetch を横取りしない。sync を受け取っても通信しない（何もしない）。
 * 「後片付け」のボタンで登録を解除できる。
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('sync', event => {
  // 同期の発火を受け取るだけ（外部へは送らない）
  event.waitUntil(Promise.resolve());
});
