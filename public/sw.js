// Minimal service worker — vite-plugin-pwa handles production PWA
// This file is not registered in dev mode to avoid intercepting model downloads
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());