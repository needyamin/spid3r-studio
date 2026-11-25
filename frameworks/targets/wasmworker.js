'use strict';
importScripts('spid3r.js');

var sp = null;
var appSrc = '';
var initPromise = null;
var sessionLoaded = false;

function resetSessionState(rt) {
  sessionLoaded = false;
  if (rt && typeof rt.resetSession === 'function') {
    try { rt.resetSession(); } catch (_e) {}
  }
}

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

function evalBundle(rt, src, evJson) {
  if (rt && typeof rt.evalSession === 'function') {
    if (!sessionLoaded) {
      var cut = src.lastIndexOf('// @@STUDIO_MAIN_START@@');
      if (cut >= 0) {
        var initRes = rt.evalSession(src.slice(0, cut), 'vm');
        if (initRes && initRes.ok) {
          sessionLoaded = true;
        } else {
          resetSessionState(rt);
        }
      }
    }
    if (sessionLoaded) {
      return rt.evalSession('__studio_dispatch(' + spid3rLiteral(evJson) + ');', 'vm');
    }
  }
  var replaced = src.replace('let STUDIO_EVENT_JSON = "";', function() {
    return 'let STUDIO_EVENT_JSON = ' + spid3rLiteral(evJson) + ';';
  });
  return rt.eval(replaced, 'vm');
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
    if (typeof msg.src === 'string' && msg.src !== appSrc) {
      appSrc = msg.src;
      resetSessionState(sp);
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
    if (typeof msg.src === 'string' && msg.src !== '' && msg.src !== appSrc) {
      appSrc = msg.src;
      resetSessionState(sp);
    }
    var evJson = (typeof msg.evJson === 'string') ? msg.evJson : '';
    ensureRuntime().then(function(rt) {
      var res = evalBundle(rt, appSrc, evJson);
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
