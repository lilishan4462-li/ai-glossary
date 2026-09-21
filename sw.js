/* AI 名词小抄 · Service Worker (v3.0)
 * 策略：cache-first + 后台更新（stale-while-revalidate 的手动版）
 * - 打开永远走缓存 → 秒开、离线可用
 * - 同时后台拉最新 index.html，拉到就和缓存里的换
 * - 换完给页面发消息，页面弹「词库已更新，点这里刷新」
 * - 版本号 CHANGE：每次发新版必须 +1（旧缓存整体作废） */
const CACHE = 'aigc-glossary-v6.3';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 只管自己域，不碰外部

  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode !== 'navigate' }).then(cached => {
      const fetching = fetch(req).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return resp;
      }).catch(() => cached);
      // 导航请求：先回缓存（秒开），后台刷新
      if (req.mode === 'navigate') {
        return cached || fetching;
      }
      // 静态资源：缓存优先，后台更新
      return cached || fetching;
    })
  );

  // 导航请求时，后台预取新版 index.html，拉到就通知页面
  if (req.mode === 'navigate') {
    fetch(req).then(resp => {
      if (!resp || !resp.ok) return;
      resp.text().then(txt => {
        caches.match('./index.html').then(old => {
          if (!old) return;
          old.text().then(oldTxt => {
            if (oldTxt !== txt) {
              self.clients.matchAll().then(cs =>
                cs.forEach(c => c.postMessage({ type: 'UPDATED' })));
            }
          });
        });
      });
    }).catch(() => {});
  }
});
