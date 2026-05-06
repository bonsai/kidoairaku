// Service Worker 登録（キャッシュによるオフライン対応と高速化）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful:', registration.scope);
        }).catch(err => {
            console.log('ServiceWorker registration failed:', err);
        });
    });
}
