/* Marwaazpn offline worker: app shell cache, per-session data cache, and survey sync queue. */
const VERSION = 'marwaazpn-offline-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE_PREFIX = `${VERSION}-data-`;
const DB_NAME = 'marwaazpn-offline';
const DB_VERSION = 1;
const QUEUE_STORE = 'requests';
const APP_ROUTES = [
  '/', '/login', '/dashboard', '/records', '/records/new', '/customers',
  '/references', '/transfers', '/financials', '/reports', '/settings',
  '/document-archive', '/drive-files', '/explorer', '/manifest.webmanifest',
];
let latestAccessToken = null;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await warmAppShell(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('marwaazpn-offline-') && !name.startsWith(VERSION)).map((name) => caches.delete(name)));
    await self.clients.claim();
    await broadcastQueueStatus();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method === 'GET') {
    if (request.mode === 'navigate') {
      event.respondWith(navigationResponse(request));
      return;
    }
    const url = new URL(request.url);
    if (url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/api/') || url.pathname === '/favicon.ico')) {
      event.respondWith(cacheWithNetworkRefresh(request));
      return;
    }
    if (url.hostname.endsWith('.supabase.co') && url.pathname.includes('/rest/v1/')) {
      event.respondWith(cacheWithNetworkRefresh(request));
    }
    return;
  }

  const url = new URL(request.url);
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname === '/api/surveys') {
    event.respondWith(networkOrQueueSurvey(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_OFFLINE_QUEUE') {
    latestAccessToken = event.data.accessToken || latestAccessToken;
    event.waitUntil(replayQueue());
  }
  if (event.data?.type === 'GET_OFFLINE_QUEUE_STATUS') event.waitUntil(broadcastQueueStatus());
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'marwaazpn-sync') event.waitUntil(replayQueue());
});

async function navigationResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('/dashboard')) || (await cache.match('/login')) || offlineDocument();
  }
}

async function cacheWithNetworkRefresh(request) {
  const cache = await caches.open(dataCacheName(request));
  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    void network;
    return cached;
  }
  return (await network) || new Response(JSON.stringify({ error: 'Offline; xogtan hore looma kaydin.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dataCacheName(request) {
  const authorization = request.headers.get('authorization') || 'public';
  let hash = 5381;
  for (let index = 0; index < authorization.length; index += 1) hash = ((hash << 5) + hash) ^ authorization.charCodeAt(index);
  return `${DATA_CACHE_PREFIX}${(hash >>> 0).toString(36)}`;
}

async function warmAppShell(cache) {
  const assetUrls = new Set(['/favicon.ico', '/manifest.webmanifest']);
  await Promise.allSettled(APP_ROUTES.map(async (url) => {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (!response.ok) return;
    await cache.put(request, response.clone());
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return;
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      const assetUrl = match[1];
      if (assetUrl.startsWith('/_next/static/') || assetUrl === '/favicon.ico') assetUrls.add(assetUrl);
    }
  }));
  await Promise.allSettled(Array.from(assetUrls, async (url) => {
    const request = new Request(url, { cache: 'reload' });
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response);
  }));
}

async function networkOrQueueSurvey(request) {
  try {
    return await fetch(request.clone());
  } catch {
    const body = await request.clone().arrayBuffer();
    await enqueueRequest({
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      body,
      createdAt: Date.now(),
    });
    try {
      const registration = await self.registration;
      if ('sync' in registration) await registration.sync.register('marwaazpn-sync');
    } catch {}
    await broadcastQueueStatus();
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function replayQueue() {
  const items = await getQueuedRequests();
  for (const item of items) {
    try {
      const headers = new Headers(item.headers);
      if (latestAccessToken) headers.set('Authorization', `Bearer ${latestAccessToken}`);
      const response = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body,
      });
      if (response.ok || (response.status >= 400 && response.status < 500 && ![401, 403, 408, 429].includes(response.status))) {
        await deleteQueuedRequest(item.id);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  await broadcastQueueStatus();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(QUEUE_STORE)) request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, mode);
    const request = action(transaction.objectStore(QUEUE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

const enqueueRequest = (value) => withStore('readwrite', (store) => store.add(value));
const getQueuedRequests = () => withStore('readonly', (store) => store.getAll());
const deleteQueuedRequest = (id) => withStore('readwrite', (store) => store.delete(id));

async function broadcastQueueStatus() {
  const pending = (await getQueuedRequests()).length;
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: 'OFFLINE_QUEUE_STATUS', pending }));
}

function offlineDocument() {
  return new Response('<!doctype html><html lang="so"><meta name="viewport" content="width=device-width"><title>Marwaazpn App</title><body style="font-family:sans-serif;background:#f8fafc;color:#0f172a;display:grid;place-items:center;height:100vh;margin:0"><main style="text-align:center;padding:24px"><h1>Marwaazpn App</h1><p>Internet ma jiro, bogganna weli qalabka laguma kaydin.</p><p>Marka internet-ku soo noqdo hal mar fur boggan.</p></main></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
