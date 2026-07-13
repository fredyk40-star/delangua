const CACHE_NAME = 'delangua-model-cache-v1';

// Model file extensions to cache
const MODEL_FILE_EXTENSIONS = [
  '.onnx',
  '.json',
  '.safetensors',
  '.bin',
  '.txt',
  '.wasm',
  '.data'
];

// Check if a URL is a Hugging Face model request
function isModelRequest(url) {
  return url.hostname === 'huggingface.co' &&
    MODEL_FILE_EXTENSIONS.some(ext => url.pathname.endsWith(ext));
}

// Install — skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Activate — claim clients and clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for model files, pass-through for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!isModelRequest(url)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[SW] Cache hit:', url.pathname);
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const clonedResponse = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clonedResponse);
          console.log('[SW] Cached:', url.pathname);
        });

        return networkResponse;
      }).catch((error) => {
        console.error('[SW] Fetch failed:', error);
        throw error;
      });
    })
  );
});

// Listen for messages from the main thread (e.g. clear cache)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
