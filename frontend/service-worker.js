const CACHE_NAME = 'rota-pp-pwa-v7';
const APP_SHELL = [
    '/index.html',
    '/empresa/painel.html',
    '/operacao/motorista.html',
    '/css/motorista.css',
    '/css/login.css',
    '/css/painel.css',
    '/css/dashboard.css',
    '/js/api-client.js',
    '/js/login.js',
    '/js/painel.js',
    '/js/footer-rfs.js',
    '/js/pwa-bootstrap.js',
    '/manifest.json',
    '/motorista.manifest.json',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Rotas / JS que sempre devem ir direto à rede (sem cache),
// evitando que atualizações do painel operacional fiquem presas
// em versões antigas do service worker.
const NUNCA_CACHEAR = [
    '/operacao/rotas.html',
    '/js/rotas.js',
    '/js/motorista.js'
];

/** Cache API só permite armazenar GET com esquema http(s). */
function podeArmazenarNoCache(request) {
    if (!request || request.method !== 'GET') return false;
    try {
        const u = new URL(request.url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function respostaOfflineJson() {
    return new Response(JSON.stringify({ erro: 'Sem conexão. Tente novamente.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
    });
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    const isSameOrigin = url.origin === self.location.origin;
    const isStaticAppAsset =
        isSameOrigin &&
        (url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css') ||
            url.pathname.endsWith('.html') ||
            url.pathname === '/' ||
            url.pathname === '/index.html');

    // API: só rede — nunca cache.put (POST/PATCH/DELETE não são suportados).
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(req).catch(() => respostaOfflineJson()));
        return;
    }

    // Assets explicitamente marcados como "sempre rede": nunca são guardados
    // em cache e sempre buscam a versão fresca. Evita que o painel de rotas
    // fique "preso" em uma versão antiga após deploy/atualização.
    if (isSameOrigin && NUNCA_CACHEAR.some((p) => url.pathname === p)) {
        event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => new Response('', { status: 504 })));
        return;
    }

    // Extensões do Chrome e outros esquemas: não interceptar (deixa o navegador tratar).
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
    }

    if (isStaticAppAsset && podeArmazenarNoCache(req)) {
        event.respondWith(
            fetch(req)
                .then((resp) => {
                    if (resp.ok) {
                        const cloned = resp.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(req, cloned).catch(() => {});
                        });
                    }
                    return resp;
                })
                .catch(() => caches.match(req).then((c) => c || new Response('', { status: 504 })))
        );
        return;
    }

    // Demais GET: cache-first só para GET http(s).
    if (!podeArmazenarNoCache(req)) {
        event.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
        return;
    }

    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req)
                .then((resp) => {
                    if (resp.ok) {
                        const cloned = resp.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(req, cloned).catch(() => {});
                        });
                    }
                    return resp;
                })
                .catch(() => new Response('', { status: 504 }));
        })
    );
});
