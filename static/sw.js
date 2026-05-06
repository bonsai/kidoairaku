const CACHE_NAME = 'kidoairaku-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/static/style.css',
    '/static/game.css',
    '/static/game.js',
    '/static/script.js',
    '/static/moheji.js',
    '/static/moheji.css',
    '/static/onboarding.css',
    '/static/test.js',
    '/static/test.css',
    '/static/cache.js',
    '/game',
    '/onboarding',
    '/moheji',
    '/test'
];

// インストール時にアセットをキャッシュ
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// リクエスト時にキャッシュを優先、なければネットワークへ（静的ファイル）
self.addEventListener('fetch', event => {
    const url = event.request.url;
    
    // 静的ファイルはキャッシュから返す
    if (url.includes('/static/')) {
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request);
            })
        );
        return;
    }
    
    // API リクエストはネットワーク優先（常に最新データ）
    if (url.includes('/detect') || url.includes('/game/score')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(event.request);
            })
        );
        return;
    }
    
    // ページはキャッシュ優先、フォールバック
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
