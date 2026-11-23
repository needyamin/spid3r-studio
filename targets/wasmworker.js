'use strict';
importScripts('spid3r.js');

var sp = null;
var appSrc = '';
var initPromise = null;

function spid3rLiteral(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029') + '"';
}

function ensureRuntime() {
  if (sp) { return Promise.resolve(sp); }
  if (!initPromise) {
    initPromise = self.Spid3r.init('spid3r.wasm').then(function(rt) {
      sp = rt;
      return rt;
    }, function(err) {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

self.onmessage = function(ev) {
  var msg = (ev && ev.data) ? ev.data : {};
  var id = msg.id;

  if (msg.type === 'init') {
    if (typeof msg.src === 'string') {
      appSrc = msg.src;
    }
    ensureRuntime().then(function() {
      self.postMessage({ id: id, type: 'ready', ok: true });
    }, function(err) {
      self.postMessage({
        id: id,
        type: 'ready',
        ok: false,
        error: (err && err.message) ? err.message : String(err)
      });
    });
    return;
  }

  if (msg.type === 'eval') {
    if (typeof msg.src === 'string' && msg.src !== '') {
      appSrc = msg.src;
    }
    var evJson = (typeof msg.evJson === 'string') ? msg.evJson : '';
    ensureRuntime().then(function(rt) {
      var src = appSrc.replace('let STUDIO_EVENT_JSON = "";', function() {
        return 'let STUDIO_EVENT_JSON = ' + spid3rLiteral(evJson) + ';';
      });
      var res = rt.eval(src, 'vm');
      self.postMessage({ id: id, type: 'result', ok: !!(res && res.ok), res: res });
    }, function(err) {
      self.postMessage({
        id: id,
        type: 'result',
        ok: false,
        res: { ok: false, error: (err && err.message) ? err.message : String(err) }
      });
    });
  }
};
