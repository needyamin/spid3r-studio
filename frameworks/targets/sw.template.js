'use strict';
var CACHE_PREFIX = 'appstudio-{{BUNDLE_ID}}-';
var CACHE_NAME = CACHE_PREFIX + '{{APP_VERSION}}';
var PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './spid3r.js',
  './spid3r.wasm',
  './wasmworker.js',
  './app.matrix'
];

self.addEventListener('install', function(ev) {
  ev.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function() {
      return self.skipWaiting();
    }).catch(function(err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[AppStudio SW] precache failed:', err);
      }
      throw err;
    })
  );
});

self.addEventListener('activate', function(ev) {
  ev.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) {
        if (n.indexOf(CACHE_PREFIX) === 0 && n !== CACHE_NAME) {
          return caches.delete(n);
        }
        return Promise.resolve(false);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(ev) {
  var req = ev.request;
  if (!req || req.method !== 'GET') { return; }
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) { return; }

  var isRuntime = /\/(spid3r\.wasm|spid3r\.js|wasmworker\.js)$/.test(url.pathname);
  if (isRuntime) {
    ev.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) { return cached; }
        return fetch(req).then(function(resp) {
          if (resp && resp.ok) {
            var copy = resp.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
          }
          return resp;
        });
      })
    );
    return;
  }

  ev.respondWith(
    fetch(req).then(function(resp) {
      if (resp && resp.ok) {
        var copy = resp.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
      }
      return resp;
    }).catch(function() {
      return caches.match(req);
    })
  );
});
