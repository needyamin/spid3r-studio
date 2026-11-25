(function(){
  if (window.__studio && window.__studio._installed) { return; }

  var pendingInputs = Object.create(null);
  var lastPageKey = null;
  var caretState = null;
  var pollTimer = null;
  var modalReturnEl = null;
  var activeModalEl = null;
  var pendingAuth = null;
  var nativeSeq = 0;
  var nativeCallbacks = Object.create(null);
  var webCryptoKeyPromise = null;
  var memSecStore = Object.create(null);

  function cssEsc(s) {
    s = String(s || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(s);
    }
    return s.replace(/([^\w-])/g, '\\$1');
  }

  function postUi(payload) {
    if (window.ipc && typeof window.ipc.postMessage === 'function') {
      var pStr = (typeof payload === 'string') ? payload : JSON.stringify(payload);
      window.ipc.postMessage(JSON.stringify({ event: 'ui', payload: pStr }));
    }
  }

  function setPoll(active, intervalMs) {
    if (active) {
      if (pollTimer) { return; }
      var ms = (typeof intervalMs === 'number' && intervalMs >= 50) ? intervalMs : 140;
      pollTimer = setInterval(function() {
        postUi({ sid: '__studio_tick__', kind: 'tick', value: '', arg: '' });
      }, ms);
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function drainPendingInputs() {
    var flushed = [];
    var sids = Object.keys(pendingInputs);
    for (var i = 0; i < sids.length; i++) {
      var sid = sids[i];
      var entry = pendingInputs[sid];
      if (!entry) { continue; }
      clearTimeout(entry.timer);
      delete pendingInputs[sid];
      flushed.push(entry.payload);
    }
    return flushed;
  }

  function flushInputs() {
    var flushed = drainPendingInputs();
    for (var i = 0; i < flushed.length; i++) {
      postUi(flushed[i]);
    }
  }

  function postUiWithFlush(payload) {
    var flushed = drainPendingInputs();
    if (flushed.length > 0 && payload && typeof payload === 'object') {
      payload.flushed = flushed;
    }
    postUi(payload);
  }

  function isSafeOpenUrl(u) {
    return /^https?:\/\/|^mailto:|^tel:/i.test(String(u || '').trim());
  }

  function isSafeHttpUrl(u) {
    return /^https?:\/\/|^\//i.test(String(u || '').trim());
  }

  function captureActive(root) {
    var ae = document.activeElement;
    if (!ae || (root && !root.contains(ae))) { return null; }
    var rec = {
      el: ae,
      sid: ae.getAttribute('data-input') || ae.getAttribute('data-change') || '',
      id: ae.getAttribute('id') || '',
      tag: ae.tagName,
      selStart: null,
      selEnd: null
    };
    try {
      if (typeof ae.selectionStart === 'number') {
        rec.selStart = ae.selectionStart;
        rec.selEnd = ae.selectionEnd;
      }
    } catch (_e) {}
    caretState = rec;
    return rec;
  }

  function restoreActive(root, rec) {
    if (!rec) { return; }
    var target = null;
    if (rec.el && root.contains(rec.el)) {
      target = rec.el;
    } else if (rec.id) {
      target = root.querySelector('#' + cssEsc(rec.id));
    } else if (rec.sid) {
      target = root.querySelector('[data-input="' + cssEsc(rec.sid) + '"],[data-change="' + cssEsc(rec.sid) + '"]');
    }
    if (!target) { return; }
    try {
      if (document.activeElement !== target && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }
      if (rec.selStart !== null && typeof target.setSelectionRange === 'function') {
        var len = String(target.value || '').length;
        var s = Math.min(rec.selStart, len);
        var e = Math.min(rec.selEnd === null ? s : rec.selEnd, len);
        target.setSelectionRange(s, e);
      }
    } catch (_e2) {}
  }

  function syncAttrs(oldEl, newEl) {
    var oldAttrs = oldEl.attributes;
    for (var i = oldAttrs.length - 1; i >= 0; i--) {
      var an = oldAttrs[i].name;
      if (!newEl.hasAttribute(an)) {
        oldEl.removeAttribute(an);
      }
    }
    var newAttrs = newEl.attributes;
    for (var j = 0; j < newAttrs.length; j++) {
      var na = newAttrs[j];
      if (oldEl.getAttribute(na.name) !== na.value) {
        oldEl.setAttribute(na.name, na.value);
      }
    }
  }

  function nodeKey(n) {
    if (!n || n.nodeType !== 1) { return ''; }
    return n.getAttribute('data-key') || '';
  }

  function sameType(a, b) {
    if (!a || !b || a.nodeType !== b.nodeType) { return false; }
    if (a.nodeType !== 1) { return true; }
    if (a.tagName !== b.tagName) { return false; }
    return nodeKey(a) === nodeKey(b);
  }

  function cloneIntoDoc(n) {
    if (typeof document.importNode === 'function') {
      return document.importNode(n, true);
    }
    return n.cloneNode(true);
  }

  function findLookaheadMatch(startNode, targetNode, newKeys, usedSet) {
    var probe = startNode;
    var steps = 0;
    while (probe && steps < 4) {
      if (!usedSet.has(probe)) {
        var pk = nodeKey(probe);
        if (!pk || !newKeys[pk]) {
          if (sameType(probe, targetNode)) { return probe; }
        }
      }
      probe = probe.nextSibling;
      steps++;
    }
    return null;
  }

  function morphChildren(oldParent, newParent) {
    var oldList = Array.prototype.slice.call(oldParent.childNodes);
    var newList = Array.prototype.slice.call(newParent.childNodes);

    var oldKeyed = Object.create(null);
    for (var i = 0; i < oldList.length; i++) {
      var k = nodeKey(oldList[i]);
      if (k && !oldKeyed[k]) {
        oldKeyed[k] = oldList[i];
      }
    }

    var newKeys = Object.create(null);
    for (var j = 0; j < newList.length; j++) {
      var nk = nodeKey(newList[j]);
      if (nk) { newKeys[nk] = true; }
    }

    var used = new Set();
    var curOld = oldParent.firstChild;

    for (var idx = 0; idx < newList.length; idx++) {
      var nChild = newList[idx];
      var nKey = nodeKey(nChild);
      var match = null;

      while (curOld && used.has(curOld)) {
        curOld = curOld.nextSibling;
      }

      if (nKey) {
        if (oldKeyed[nKey] && !used.has(oldKeyed[nKey]) && sameType(oldKeyed[nKey], nChild)) {
          match = oldKeyed[nKey];
        }
      } else {
        while (curOld && nodeKey(curOld) && newKeys[nodeKey(curOld)]) {
          curOld = curOld.nextSibling;
        }
        if (curOld && !used.has(curOld) && sameType(curOld, nChild)) {
          match = curOld;
        } else if (curOld) {
          match = findLookaheadMatch(curOld.nextSibling, nChild, newKeys, used);
        }
      }

      if (match) {
        used.add(match);
        if (match === curOld) {
          curOld = curOld.nextSibling;
        } else {
          oldParent.insertBefore(match, curOld);
        }
        morphNode(match, nChild);
      } else {
        var created = cloneIntoDoc(nChild);
        used.add(created);
        oldParent.insertBefore(created, curOld);
        if (created.nodeType === 1) {
          if (created.tagName === 'INPUT') {
            created._studioVal = created.getAttribute('value') || '';
          } else if (created.tagName === 'TEXTAREA') {
            created._studioVal = created.textContent || '';
          }
        }
      }
    }

    var child = oldParent.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (!used.has(child)) {
        oldParent.removeChild(child);
      }
      child = next;
    }
  }

  function morphNode(oldNode, newNode) {
    if (oldNode.nodeType === 3 || oldNode.nodeType === 8) {
      if (oldNode.nodeValue !== newNode.nodeValue) {
        oldNode.nodeValue = newNode.nodeValue;
      }
      return oldNode;
    }
    if (!sameType(oldNode, newNode)) {
      var rep = cloneIntoDoc(newNode);
      if (oldNode.parentNode) {
        oldNode.parentNode.replaceChild(rep, oldNode);
      }
      return rep;
    }
    var tag = oldNode.tagName;
    if (tag === 'INPUT') {
      var inType = (newNode.getAttribute('type') || oldNode.getAttribute('type') || '').toLowerCase();
      if (inType === 'checkbox' || inType === 'radio') {
        var shouldChk = newNode.hasAttribute('checked');
        syncAttrs(oldNode, newNode);
        if (oldNode.checked !== shouldChk) {
          oldNode.checked = shouldChk;
        }
        return oldNode;
      }
      var oldServerVal = (oldNode._studioVal !== undefined) ? oldNode._studioVal : (oldNode.getAttribute('value') || '');
      var newVal = newNode.getAttribute('value');
      if (newVal === null) { newVal = ''; }
      var sid = newNode.getAttribute('data-input') || oldNode.getAttribute('data-input') || '';
      syncAttrs(oldNode, newNode);
      oldNode._studioVal = newVal;
      if (!(sid && pendingInputs[sid])) {
        var focused = (document.activeElement === oldNode);
        if (!focused || oldServerVal !== newVal) {
          if (oldNode.value !== newVal) {
            oldNode.value = newVal;
          }
        }
      }
      return oldNode;
    }
    if (tag === 'SELECT') {
      syncAttrs(oldNode, newNode);
      morphChildren(oldNode, newNode);
      var opts = oldNode.childNodes || [];
      var selVal = null;
      for (var oi = 0; oi < opts.length; oi++) {
        var o = opts[oi];
        if (o && o.nodeType === 1 && o.hasAttribute('selected')) {
          selVal = o.getAttribute('value');
          break;
        }
      }
      if (selVal !== null && oldNode.value !== selVal) {
        oldNode.value = selVal;
      }
      return oldNode;
    }
    if (tag === 'TEXTAREA') {
      var oldTaServer = (oldNode._studioVal !== undefined) ? oldNode._studioVal : (oldNode.defaultValue || '');
      var newTaVal = newNode.textContent || '';
      var sidTa = newNode.getAttribute('data-input') || oldNode.getAttribute('data-input') || '';
      syncAttrs(oldNode, newNode);
      oldNode._studioVal = newTaVal;
      if (!(sidTa && pendingInputs[sidTa])) {
        var taFocused = (document.activeElement === oldNode);
        if (!taFocused || oldTaServer !== newTaVal) {
          if (oldNode.value !== newTaVal) {
            oldNode.value = newTaVal;
          }
        }
      }
      return oldNode;
    }
    syncAttrs(oldNode, newNode);
    morphChildren(oldNode, newNode);
    return oldNode;
  }

  function ttHtml(s) {
    var p = (typeof window !== 'undefined') ? window.__studioTT : null;
    if (!p && typeof window !== 'undefined' && window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
      try {
        p = window.trustedTypes.createPolicy('appstudio', {
          createHTML: function(v) { return String(v || ''); },
          createScriptURL: function(v) { return String(v || ''); }
        });
        window.__studioTT = p;
      } catch (_e) {}
    }
    return (p && typeof p.createHTML === 'function') ? p.createHTML(String(s || '')) : String(s || '');
  }

  function parseHtml(html) {
    var tpl = document.createElement('template');
    if (tpl && tpl.content) {
      tpl.innerHTML = ttHtml(html);
      return tpl.content;
    }
    var box = document.createElement('div');
    box.innerHTML = ttHtml(html);
    return box;
  }

  function isFocusable(el) {
    if (!el || el.nodeType !== 1) { return false; }
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') { return false; }
    var ti = el.getAttribute('tabindex');
    if (ti !== null && String(ti) === '-1') { return false; }
    var tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { return true; }
    if (tag === 'A' && el.hasAttribute('href')) { return true; }
    if (ti !== null && String(ti) !== '') { return true; }
    return false;
  }

  function getFocusableElements(container) {
    var out = [];
    if (!container) { return out; }
    function walk(node) {
      var kids = node.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c && c.nodeType === 1) {
          if (isFocusable(c)) { out.push(c); }
          walk(c);
        }
      }
    }
    walk(container);
    return out;
  }

  function findAncestor(node, pred) {
    var cur = node;
    while (cur && cur.nodeType === 1) {
      if (pred(cur)) { return cur; }
      cur = cur.parentNode;
    }
    return null;
  }

  function isRtlElement(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var d = cur.getAttribute('dir');
      if (d) { return String(d).toLowerCase() === 'rtl'; }
      cur = cur.parentNode;
    }
    return false;
  }

  function findOpenDialog(root) {
    if (!root || !root.querySelector) { return null; }
    return root.querySelector('[role="dialog"][aria-modal="true"]');
  }

  function patch(html, targetRoot) {
    var root = targetRoot || document.getElementById('spid3r-root') || document.body;
    if (!root) { return; }
    var prevActive = document.activeElement;
    var hadDialog = !!findOpenDialog(root);
    var activeRec = captureActive(root) || caretState;
    var incoming = parseHtml(html);
    if (!incoming) {
      root.innerHTML = ttHtml(html);
      return;
    }
    var nextPage = incoming.querySelector ? incoming.querySelector('.page[data-pagekey]') : null;
    var nextKey = nextPage ? nextPage.getAttribute('data-pagekey') : null;
    var routeChanged = (lastPageKey !== null && nextKey !== null && nextKey !== lastPageKey);

    morphChildren(root, incoming);

    var curDialog = findOpenDialog(root);
    var curPage = root.querySelector ? root.querySelector('.page[data-pagekey]') : null;
    if (nextKey !== null) {
      lastPageKey = nextKey;
    }

    // A-30: Modal dialog/sheet focus trap entry & focus restore on close
    if (!hadDialog && curDialog) {
      modalReturnEl = (prevActive && root.contains(prevActive)) ? prevActive : (activeRec ? activeRec.el : null);
      activeModalEl = curDialog;
      var focusables = getFocusableElements(curDialog);
      var firstTarget = focusables.length > 0 ? focusables[0] : curDialog;
      try {
        if (firstTarget && typeof firstTarget.focus === 'function') {
          firstTarget.focus({ preventScroll: true });
        }
      } catch (_fe) {}
    } else if (hadDialog && !curDialog) {
      var restoreEl = modalReturnEl;
      modalReturnEl = null;
      activeModalEl = null;
      if (restoreEl && root.contains(restoreEl) && typeof restoreEl.focus === 'function') {
        try { restoreEl.focus({ preventScroll: true }); } catch (_re) {}
      }
    } else if (curDialog) {
      activeModalEl = curDialog;
    }

    if (routeChanged && curPage) {
      curPage.scrollTop = 0;
      curPage.classList.add('page-enter');
      setTimeout(function() {
        if (curPage && curPage.classList) { curPage.classList.remove('page-enter'); }
      }, 280);
    } else if (!routeChanged && activeRec && ((!curDialog && !hadDialog) || (curDialog && hadDialog))) {
      restoreActive(root, activeRec);
    }
  }

  function copyFallback(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_e) {}
  }

  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa === 'function') { return btoa(bin); }
    if (typeof Buffer !== 'undefined') { return Buffer.from(bytes).toString('base64'); }
    return bin;
  }

  function b64ToBytes(b64) {
    if (typeof atob === 'function') {
      var bin = atob(String(b64 || ''));
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) { out[i] = bin.charCodeAt(i); }
      return out;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(String(b64 || ''), 'base64'));
    }
    return new Uint8Array(0);
  }

  function openKeyDb() {
    return new Promise(function(resolve) {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      try {
        var req = indexedDB.open('studio_sec_keys_v1', 1);
        req.onupgradeneeded = function() {
          try { req.result.createObjectStore('keys'); } catch (_e) {}
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { resolve(null); };
      } catch (_e2) {
        resolve(null);
      }
    });
  }

  function getWebCryptoKey() {
    if (webCryptoKeyPromise) { return webCryptoKeyPromise; }
    webCryptoKeyPromise = (async function() {
      if (typeof crypto === 'undefined' || !crypto.subtle) {
        throw new Error('WebCrypto unavailable');
      }
      var db = await openKeyDb();
      if (db) {
        var existing = await new Promise(function(resolve) {
          try {
            var tx = db.transaction('keys', 'readonly');
            var gr = tx.objectStore('keys').get('master');
            gr.onsuccess = function() { resolve(gr.result || null); };
            gr.onerror = function() { resolve(null); };
          } catch (_e) { resolve(null); }
        });
        if (existing) { return existing; }
      }
      var key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      if (db) {
        await new Promise(function(resolve) {
          try {
            var tx2 = db.transaction('keys', 'readwrite');
            tx2.objectStore('keys').put(key, 'master');
            tx2.oncomplete = function() { resolve(true); };
            tx2.onerror = function() { resolve(false); };
          } catch (_e2) { resolve(false); }
        });
      }
      return key;
    })();
    return webCryptoKeyPromise;
  }

  function secSlotKey(k) {
    return 'studio:sec:' + String(k || '');
  }

  function readSecRaw(k) {
    var sk = secSlotKey(k);
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(sk);
      }
    } catch (_e) {}
    return Object.prototype.hasOwnProperty.call(memSecStore, sk) ? memSecStore[sk] : null;
  }

  function writeSecRaw(k, v) {
    var sk = secSlotKey(k);
    try {
      if (typeof localStorage !== 'undefined') {
        if (v === null) { localStorage.removeItem(sk); }
        else { localStorage.setItem(sk, String(v)); }
        return;
      }
    } catch (_e) {}
    if (v === null) { delete memSecStore[sk]; }
    else { memSecStore[sk] = String(v); }
  }

  async function webCryptoSet(k, val) {
    var key = await getWebCryptoKey();
    var iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    var enc = new TextEncoder().encode(String(val));
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc);
    writeSecRaw(k, JSON.stringify({ v: 1, iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) }));
  }

  async function webCryptoGet(k) {
    var raw = readSecRaw(k);
    if (!raw) { return null; }
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.iv || !parsed.ct) { return null; }
    var key = await getWebCryptoKey();
    var pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(parsed.iv) },
      key,
      b64ToBytes(parsed.ct)
    );
    return new TextDecoder().decode(pt);
  }

  function callIosNative(action, payload, cbFn) {
    var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.studioNative;
    if (!handler || typeof handler.postMessage !== 'function') { return false; }
    var reqId = 'nat_' + (++nativeSeq);
    if (typeof cbFn === 'function') {
      nativeCallbacks[reqId] = cbFn;
    }
    handler.postMessage({ id: reqId, action: action, payload: payload || {} });
    return true;
  }

  var prevNativeCallback = window.__studioNativeCallback;
  window.__studioNativeCallback = function(reqId, result) {
    var fn = nativeCallbacks[reqId];
    if (fn) {
      delete nativeCallbacks[reqId];
      try { fn(result); } catch (_e) {}
      return;
    }
    if (typeof prevNativeCallback === 'function') {
      try { prevNativeCallback(reqId, result); } catch (_e2) {}
    }
  };

  function postSecureResult(cb, key, ok, value, err) {
    if (!cb) { return; }
    var res = { ok: !!ok, key: String(key || ''), value: value === null || value === undefined ? '' : String(value), found: value !== null && value !== undefined, error: String(err || '') };
    postUi({
      sid: cb,
      kind: 'secure_store',
      key: res.key,
      value: res.value,
      arg: JSON.stringify(res),
      ok: res.ok,
      found: res.found,
      error: res.error
    });
  }

  function isSafeDeepLinkUrl(u) {
    var s = String(u || '').trim();
    if (!s) { return false; }
    var idx = s.indexOf('://');
    if (idx <= 0) { return false; }
    var sch = s.slice(0, idx).toLowerCase();
    if (sch === 'javascript' || sch === 'data' || sch === 'vbscript' || sch === 'file') { return false; }
    return /^[a-z][a-z0-9+.-]*$/.test(sch);
  }

  function dispatchDeepLink(rawUrl) {
    if (!isSafeDeepLinkUrl(rawUrl)) { return false; }
    var clean = String(rawUrl).trim();
    var sch = clean.slice(0, clean.indexOf('://')).toLowerCase();
    postUi({
      sid: '__studio_deep_link__',
      kind: 'deep_link',
      value: clean,
      arg: clean
    });
    if (pendingAuth && pendingAuth.cb && (!pendingAuth.scheme || pendingAuth.scheme === sch)) {
      var authCb = pendingAuth.cb;
      pendingAuth = null;
      postUi({
        sid: authCb,
        kind: 'auth',
        value: clean,
        arg: clean
      });
    }
    return true;
  }

  window.__studioDeepLink = dispatchDeepLink;

  function runEffects(effects) {
    if (!Array.isArray(effects) || effects.length === 0) { return; }
    for (var i = 0; i < effects.length; i++) {
      var ef = effects[i];
      if (!ef || typeof ef !== 'object') { continue; }
      var kind = String(ef.kind || '');

      if (kind === 'clipboard.copy') {
        var txt = String(ef.text || '');
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(txt).catch(function() { copyFallback(txt); });
        } else {
          copyFallback(txt);
        }
      } else if (kind === 'open_url') {
        var url = String(ef.url || '').trim();
        if (isSafeOpenUrl(url)) {
          if (!callIosNative('open_url', { url: url }, null)) {
            if (window.StudioAndroid && typeof window.StudioAndroid.openUrl === 'function') {
              try { window.StudioAndroid.openUrl(url); } catch (_oe) {}
            } else if (typeof window.open === 'function') {
              try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_e) {}
            }
          }
        }
      } else if (kind === 'haptic') {
        var style = String(ef.style || 'light');
        if (!callIosNative('haptic', { style: style }, null)) {
          var ms = (style === 'heavy') ? 35 : ((style === 'medium') ? 20 : 10);
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(ms); } catch (_e2) {}
          }
        }
      } else if (kind === 'secure_store.set') {
        (function(req) {
          var sk = String(req.key || '');
          var sv = String(req.value || '');
          var cb = String(req.cb || '');
          if (!sk) { return; }
          if (callIosNative('secure_set', { key: sk, value: sv }, function(res) {
            postSecureResult(cb, sk, res && res.ok, sv, res && res.error);
          })) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.secureSet === 'function') {
            try {
              var okA = !!window.StudioAndroid.secureSet(sk, sv);
              postSecureResult(cb, sk, okA, sv, okA ? '' : 'android keystore set failed');
            } catch (ea) {
              postSecureResult(cb, sk, false, '', ea && ea.message ? ea.message : String(ea));
            }
            return;
          }
          webCryptoSet(sk, sv).then(function() {
            postSecureResult(cb, sk, true, sv, '');
          }).catch(function(ew) {
            postSecureResult(cb, sk, false, '', ew && ew.message ? ew.message : String(ew));
          });
        })(ef);
      } else if (kind === 'secure_store.get') {
        (function(req) {
          var sk = String(req.key || '');
          var cb = String(req.cb || '');
          if (!sk || !cb) { return; }
          if (callIosNative('secure_get', { key: sk }, function(res) {
            postSecureResult(cb, sk, res && res.ok, res ? res.value : null, res && res.error);
          })) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.secureGet === 'function') {
            try {
              var valA = window.StudioAndroid.secureGet(sk);
              postSecureResult(cb, sk, true, valA, '');
            } catch (ea) {
              postSecureResult(cb, sk, false, null, ea && ea.message ? ea.message : String(ea));
            }
            return;
          }
          webCryptoGet(sk).then(function(val) {
            postSecureResult(cb, sk, true, val, '');
          }).catch(function(ew) {
            postSecureResult(cb, sk, false, null, ew && ew.message ? ew.message : String(ew));
          });
        })(ef);
      } else if (kind === 'secure_store.remove') {
        (function(req) {
          var sk = String(req.key || '');
          var cb = String(req.cb || '');
          if (!sk) { return; }
          if (callIosNative('secure_remove', { key: sk }, function(res) {
            postSecureResult(cb, sk, res && res.ok, null, res && res.error);
          })) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.secureRemove === 'function') {
            try {
              window.StudioAndroid.secureRemove(sk);
              postSecureResult(cb, sk, true, null, '');
            } catch (ea) {
              postSecureResult(cb, sk, false, null, ea && ea.message ? ea.message : String(ea));
            }
            return;
          }
          writeSecRaw(sk, null);
          postSecureResult(cb, sk, true, null, '');
        })(ef);
      } else if (kind === 'share') {
        var shTitle = String(ef.title || '');
        var shText = String(ef.text || '');
        var shUrl = String(ef.url || '');
        if (shUrl && !isSafeOpenUrl(shUrl)) { continue; }
        if (!callIosNative('share', { title: shTitle, text: shText, url: shUrl }, null)) {
          if (window.StudioAndroid && typeof window.StudioAndroid.share === 'function') {
            try { window.StudioAndroid.share(shTitle, shText, shUrl); } catch (_se) {}
          } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try { navigator.share({ title: shTitle, text: shText, url: shUrl || undefined }).catch(function() {}); } catch (_se2) {}
          }
        }
      } else if (kind === 'files.pick') {
        (function(req) {
          var fcb = String(req.cb || '');
          if (!fcb || typeof document === 'undefined' || !document.createElement) { return; }
          try {
            var inp = document.createElement('input');
            inp.setAttribute('type', 'file');
            inp.setAttribute('accept', String(req.accept || '*/*'));
            inp.style.display = 'none';
            inp.onchange = function() {
              var f = inp.files && inp.files[0];
              if (!f) { return; }
              var sendMeta = function(txt) {
                var meta = { name: String(f.name || ''), size: Number(f.size || 0), type: String(f.type || ''), text: txt };
                postUi({ sid: fcb, kind: 'file', value: meta.name, arg: JSON.stringify(meta), file: meta });
              };
              if (typeof f.text === 'function') {
                f.text().then(sendMeta).catch(function() { sendMeta(''); });
              } else {
                sendMeta('');
              }
            };
            if (document.body && document.body.appendChild) {
              document.body.appendChild(inp);
              if (typeof inp.click === 'function') { inp.click(); }
              document.body.removeChild(inp);
            }
          } catch (_fe) {}
        })(ef);
      } else if (kind === 'auth.open') {
        var authUrl = String(ef.url || '').trim();
        if (/^https:\/\//i.test(authUrl)) {
          pendingAuth = { scheme: String(ef.redirect_scheme || '').toLowerCase(), cb: String(ef.cb || '') };
          if (!callIosNative('open_url', { url: authUrl }, null)) {
            if (window.StudioAndroid && typeof window.StudioAndroid.openUrl === 'function') {
              try { window.StudioAndroid.openUrl(authUrl); } catch (_ae0) {}
            } else if (typeof window.open === 'function') {
              try { window.open(authUrl, '_blank', 'noopener,noreferrer'); } catch (_ae) {}
            }
          }
        }
      } else if (kind === 'geo.get') {
        (function(req) {
          var gcb = String(req.cb || '');
          if (!gcb) { return; }
          var sendGeo = function(res) {
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'geolocation unavailable' };
            postUi({ sid: gcb, kind: 'geo', ok: !!r.ok, value: JSON.stringify(r), arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('geo_get', {}, sendGeo)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.getGeolocation === 'function') {
            try { sendGeo(JSON.parse(String(window.StudioAndroid.getGeolocation() || '{}'))); } catch (eg) { sendGeo({ ok: false, error: String(eg) }); }
            return;
          }
          if (typeof navigator !== 'undefined' && navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === 'function') {
            navigator.geolocation.getCurrentPosition(
              function(pos) {
                var c = pos && pos.coords ? pos.coords : {};
                sendGeo({ ok: true, lat: c.latitude || 0, lon: c.longitude || 0, accuracy: c.accuracy || 0 });
              },
              function(err) { sendGeo({ ok: false, error: err && err.message ? err.message : 'geolocation denied' }); }
            );
          } else {
            sendGeo({ ok: false, error: 'geolocation unavailable' });
          }
        })(ef);
      } else if (kind === 'biometrics.auth') {
        (function(req) {
          var bcb = String(req.cb || '');
          var reason = String(req.reason || 'Verify identity');
          if (!bcb) { return; }
          var sendBio = function(res) {
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'biometrics unavailable' };
            postUi({ sid: bcb, kind: 'biometrics', ok: !!r.ok, value: r.ok ? 'true' : 'false', arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('biometrics_auth', { reason: reason }, sendBio)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.authenticateBiometrics === 'function') {
            try { sendBio(JSON.parse(String(window.StudioAndroid.authenticateBiometrics(reason) || '{}'))); } catch (eb) { sendBio({ ok: false, error: String(eb) }); }
            return;
          }
          if (typeof window !== 'undefined' && window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
            window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function(avail) {
              sendBio({ ok: !!avail, available: !!avail, provider: 'webauthn', error: avail ? '' : 'platform authenticator unavailable' });
            }).catch(function(ew) { sendBio({ ok: false, error: String(ew) }); });
          } else {
            sendBio({ ok: false, error: 'biometrics unavailable' });
          }
        })(ef);
      } else if (kind === 'camera.capture') {
        (function(req) {
          var ccb = String(req.cb || '');
          var facing = String(req.facing || 'environment');
          if (!ccb) { return; }
          var sendCam = function(res) {
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'camera unavailable' };
            postUi({ sid: ccb, kind: 'camera', ok: !!r.ok, value: String(r.name || ''), arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('camera_capture', { facing: facing }, sendCam)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.captureCamera === 'function') {
            try { sendCam(JSON.parse(String(window.StudioAndroid.captureCamera(facing) || '{}'))); } catch (ec) { sendCam({ ok: false, error: String(ec) }); }
            return;
          }
          if (typeof document !== 'undefined' && document.createElement) {
            try {
              var inp = document.createElement('input');
              inp.setAttribute('type', 'file');
              inp.setAttribute('accept', 'image/*');
              inp.setAttribute('capture', facing);
              inp.style.display = 'none';
              inp.onchange = function() {
                var f = inp.files && inp.files[0];
                if (!f) { sendCam({ ok: false, error: 'cancelled' }); return; }
                sendCam({ ok: true, name: String(f.name || ''), size: Number(f.size || 0), type: String(f.type || '') });
              };
              if (document.body && document.body.appendChild) {
                document.body.appendChild(inp);
                if (typeof inp.click === 'function') { inp.click(); }
                document.body.removeChild(inp);
              }
            } catch (ec2) { sendCam({ ok: false, error: String(ec2) }); }
          } else {
            sendCam({ ok: false, error: 'camera unavailable' });
          }
        })(ef);
      } else if (kind === 'notifications.show') {
        (function(req) {
          var ncb = String(req.cb || '');
          var title = String(req.title || '');
          var body = String(req.body || '');
          var sendNotif = function(res) {
            if (!ncb) { return; }
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'notifications unavailable' };
            postUi({ sid: ncb, kind: 'notifications', ok: !!r.ok, value: title, arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('notifications_show', { title: title, body: body }, sendNotif)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.showNotification === 'function') {
            try { sendNotif(JSON.parse(String(window.StudioAndroid.showNotification(title, body) || '{}'))); } catch (en) { sendNotif({ ok: false, error: String(en) }); }
            return;
          }
          if (typeof window !== 'undefined' && typeof window.Notification === 'function') {
            var spawnN = function() {
              try {
                new window.Notification(title, { body: body });
                sendNotif({ ok: true, title: title });
              } catch (en2) { sendNotif({ ok: false, error: String(en2) }); }
            };
            if (window.Notification.permission === 'granted') {
              spawnN();
            } else if (typeof window.Notification.requestPermission === 'function') {
              window.Notification.requestPermission().then(function(perm) {
                if (perm === 'granted') { spawnN(); }
                else { sendNotif({ ok: false, error: 'notification permission ' + String(perm) }); }
              }).catch(function(en3) { sendNotif({ ok: false, error: String(en3) }); });
            } else {
              sendNotif({ ok: false, error: 'notifications permission denied' });
            }
          } else {
            sendNotif({ ok: false, error: 'notifications unavailable' });
          }
        })(ef);
      } else if (kind === 'contacts.pick') {
        (function(req) {
          var kcb = String(req.cb || '');
          if (!kcb) { return; }
          var sendContact = function(res) {
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'contacts unavailable' };
            postUi({ sid: kcb, kind: 'contacts', ok: !!r.ok, value: JSON.stringify(r), arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('contacts_pick', {}, sendContact)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.pickContact === 'function') {
            try { sendContact(JSON.parse(String(window.StudioAndroid.pickContact() || '{}'))); } catch (ek) { sendContact({ ok: false, error: String(ek) }); }
            return;
          }
          if (typeof navigator !== 'undefined' && navigator.contacts && typeof navigator.contacts.select === 'function') {
            navigator.contacts.select(['name', 'email', 'tel'], { multiple: false }).then(function(list) {
              sendContact({ ok: true, contacts: Array.isArray(list) ? list : [] });
            }).catch(function(ek2) { sendContact({ ok: false, error: String(ek2) }); });
          } else {
            sendContact({ ok: false, error: 'contacts picker unavailable' });
          }
        })(ef);
      } else if (kind === 'ble.scan') {
        (function(req) {
          var bcb = String(req.cb || '');
          var suuid = String(req.service_uuid || '');
          if (!bcb) { return; }
          var sendBle = function(res) {
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'bluetooth unavailable' };
            postUi({ sid: bcb, kind: 'ble', ok: !!r.ok, value: JSON.stringify(r), arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('ble_scan', { service_uuid: suuid }, sendBle)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.bleScan === 'function') {
            try { sendBle(JSON.parse(String(window.StudioAndroid.bleScan(suuid) || '{}'))); } catch (ebl) { sendBle({ ok: false, error: String(ebl) }); }
            return;
          }
          if (typeof navigator !== 'undefined' && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function') {
            var opts = suuid ? { filters: [{ services: [suuid] }] } : { acceptAllDevices: true };
            navigator.bluetooth.requestDevice(opts).then(function(dev) {
              sendBle({ ok: true, id: dev ? String(dev.id || '') : '', name: dev ? String(dev.name || '') : '' });
            }).catch(function(ebl2) { sendBle({ ok: false, error: String(ebl2) }); });
          } else {
            sendBle({ ok: false, error: 'bluetooth unavailable' });
          }
        })(ef);
      } else if (kind === 'background.schedule') {
        (function(req) {
          var bgcb = String(req.cb || '');
          var tid = String(req.task_id || '');
          var sec = Number(req.interval_sec || 60);
          var sendBg = function(res) {
            if (!bgcb) { return; }
            var r = (res && typeof res === 'object') ? res : { ok: false, error: 'background scheduling unavailable' };
            postUi({ sid: bgcb, kind: 'background', ok: !!r.ok, value: tid, arg: JSON.stringify(r), data: r });
          };
          if (callIosNative('background_schedule', { task_id: tid, interval_sec: sec }, sendBg)) { return; }
          if (window.StudioAndroid && typeof window.StudioAndroid.scheduleBackgroundTask === 'function') {
            try { sendBg(JSON.parse(String(window.StudioAndroid.scheduleBackgroundTask(tid, sec) || '{}'))); } catch (ebg) { sendBg({ ok: false, error: String(ebg) }); }
            return;
          }
          sendBg({ ok: true, task_id: tid, interval_sec: sec, mode: 'foreground_timer' });
        })(ef);
      } else if (kind === 'http') {
        (function(req) {
          var reqUrl = String(req.url || '');
          var cb = String(req.cb || '');
          if (!isSafeHttpUrl(reqUrl) || !cb || typeof fetch !== 'function') { return; }
          var method = String(req.method || 'GET').toUpperCase();
          var opts = { method: method };
          if (req.headers && typeof req.headers === 'object') {
            opts.headers = req.headers;
          }
          if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined && req.body !== null && req.body !== '') {
            opts.body = String(req.body);
          }
          fetch(reqUrl, opts).then(function(resp) {
            return resp.text().then(function(bodyText) {
              var parsed = null;
              if (bodyText && bodyText.trim() !== '') {
                try { parsed = JSON.parse(bodyText); } catch (_je) { parsed = null; }
              }
              var resObj = {
                ok: resp.status >= 200 && resp.status < 300,
                status: resp.status,
                body: bodyText,
                json: parsed,
                error: ''
              };
              postUi({
                sid: cb,
                kind: 'http',
                req_id: String(req.req_id || ''),
                value: bodyText,
                arg: JSON.stringify(resObj),
                response: resObj,
                ok: resObj.ok,
                status: resObj.status,
                body: resObj.body,
                json: resObj.json,
                error: resObj.error
              });
            });
          }).catch(function(err) {
            var errObj = {
              ok: false,
              status: 0,
              body: '',
              json: null,
              error: (err && err.message) ? err.message : String(err || 'network error')
            };
            postUi({
              sid: cb,
              kind: 'http',
              req_id: String(req.req_id || ''),
              value: '',
              arg: JSON.stringify(errObj),
              response: errObj,
              ok: false,
              status: 0,
              body: '',
              json: null,
              error: errObj.error
            });
          });
        })(ef);
      }
    }
  }

  document.addEventListener('focusin', function(e) {
    if (e.target && e.target.nodeType === 1) {
      captureActive(document.body);
    }
  }, true);

  document.addEventListener('click', function(e) {
    var node = e.target;
    while (node && node.nodeType === 1) {
      if (node.hasAttribute('data-tap')) {
        postUiWithFlush({
          sid: node.getAttribute('data-tap'),
          kind: 'tap',
          value: node.getAttribute('data-val'),
          arg: node.getAttribute('data-arg')
        });
        return;
      }
      if (node.hasAttribute('data-stop-tap')) {
        return;
      }
      node = node.parentNode;
    }
  });

  document.addEventListener('input', function(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1) { return; }
    captureActive(document.body);
    var sid = el.getAttribute('data-input');
    if (!sid) { return; }
    if (pendingInputs[sid]) {
      clearTimeout(pendingInputs[sid].timer);
    }
    var payload = {
      sid: sid,
      kind: 'input',
      value: (el.value !== undefined) ? String(el.value) : '',
      arg: el.getAttribute('data-arg')
    };
    var delay = (el.type === 'range') ? 45 : 90;
    pendingInputs[sid] = {
      payload: payload,
      timer: setTimeout(function() {
        var entry = pendingInputs[sid];
        delete pendingInputs[sid];
        if (entry) { postUi(entry.payload); }
      }, delay)
    };
  });

  document.addEventListener('change', function(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1 || !el.hasAttribute('data-change')) { return; }
    postUiWithFlush({
      sid: el.getAttribute('data-change'),
      kind: 'change',
      value: el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : String(el.value || ''),
      arg: el.getAttribute('data-arg')
    });
  });

  document.addEventListener('submit', function(e) {
    var f = e.target;
    if (!f || f.nodeType !== 1 || !f.hasAttribute('data-submit')) { return; }
    e.preventDefault();
    postUiWithFlush({
      sid: f.getAttribute('data-submit'),
      kind: 'submit',
      value: '',
      arg: f.getAttribute('data-arg')
    });
  });

  document.addEventListener('keydown', function(e) {
    var el = e.target;
    if (!el || el.nodeType !== 1) { return; }

    // A-30: Modal dialog/sheet focus trap & Escape dismiss
    var modal = activeModalEl || findAncestor(el, function(n) {
      return n.getAttribute('role') === 'dialog' && n.getAttribute('aria-modal') === 'true';
    });
    if (modal && document.body && document.body.contains(modal)) {
      if (e.key === 'Escape') {
        var wrap = modal.parentNode;
        if (wrap && wrap.nodeType === 1 && wrap.hasAttribute('data-tap')) {
          if (typeof e.preventDefault === 'function') { e.preventDefault(); }
          postUiWithFlush({
            sid: wrap.getAttribute('data-tap'),
            kind: 'tap',
            value: wrap.getAttribute('data-val'),
            arg: wrap.getAttribute('data-arg')
          });
          return;
        }
      } else if (e.key === 'Tab') {
        var fList = getFocusableElements(modal);
        if (typeof e.preventDefault === 'function') { e.preventDefault(); }
        if (fList.length > 0) {
          var idx = fList.indexOf(document.activeElement);
          if (idx < 0) { idx = fList.indexOf(el); }
          var nextIdx = 0;
          if (e.shiftKey) {
            nextIdx = (idx <= 0) ? (fList.length - 1) : (idx - 1);
          } else {
            nextIdx = (idx < 0 || idx >= fList.length - 1) ? 0 : (idx + 1);
          }
          try { fList[nextIdx].focus({ preventScroll: true }); } catch (_te) {}
          return;
        } else {
          try { if (typeof modal.focus === 'function') { modal.focus({ preventScroll: true }); } } catch (_te2) {}
          return;
        }
      }
    }

    // A-30: Keyboard-navigable roving tabindex on role="tablist"
    if (el.getAttribute('role') === 'tab') {
      var tablist = findAncestor(el, function(n) { return n.getAttribute('role') === 'tablist'; });
      if (tablist) {
        var k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Home' || k === 'End') {
          var tabs = [];
          var tKids = tablist.childNodes || [];
          for (var ti = 0; ti < tKids.length; ti++) {
            var tc = tKids[ti];
            if (tc && tc.nodeType === 1 && tc.getAttribute('role') === 'tab' && !tc.hasAttribute('disabled')) {
              tabs.push(tc);
            }
          }
          if (tabs.length > 0) {
            var curIdx = tabs.indexOf(el);
            if (curIdx < 0) { curIdx = 0; }
            var rtl = isRtlElement(tablist);
            var targetIdx = curIdx;
            if (k === 'Home') {
              targetIdx = 0;
            } else if (k === 'End') {
              targetIdx = tabs.length - 1;
            } else if ((k === 'ArrowRight' && !rtl) || (k === 'ArrowLeft' && rtl)) {
              targetIdx = (curIdx + 1) % tabs.length;
            } else {
              targetIdx = (curIdx - 1 + tabs.length) % tabs.length;
            }
            if (typeof e.preventDefault === 'function') { e.preventDefault(); }
            for (var uj = 0; uj < tabs.length; uj++) {
              tabs[uj].setAttribute('tabindex', uj === targetIdx ? '0' : '-1');
            }
            try { tabs[targetIdx].focus({ preventScroll: true }); } catch (_ke) {}
            return;
          }
        }
        if ((k === 'Enter' || k === ' ') && el.hasAttribute('data-tap')) {
          if (typeof e.preventDefault === 'function') { e.preventDefault(); }
          postUiWithFlush({
            sid: el.getAttribute('data-tap'),
            kind: 'tap',
            value: el.getAttribute('data-val'),
            arg: el.getAttribute('data-arg')
          });
          return;
        }
      }
    }

    if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute('role') === 'switch' && el.hasAttribute('data-tap')) {
      e.preventDefault();
      postUiWithFlush({
        sid: el.getAttribute('data-tap'),
        kind: 'tap',
        value: el.getAttribute('data-val'),
        arg: el.getAttribute('data-arg')
      });
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey) { return; }
    if (el.hasAttribute('data-submit')) {
      e.preventDefault();
      postUiWithFlush({
        sid: el.getAttribute('data-submit'),
        kind: 'submit',
        value: String(el.value || ''),
        arg: el.getAttribute('data-arg')
      });
      return;
    }
    if (el.tagName === 'INPUT') {
      var cur = el.parentNode;
      while (cur && cur.nodeType === 1) {
        if (cur.tagName === 'FORM' && cur.hasAttribute('data-submit')) {
          e.preventDefault();
          postUiWithFlush({
            sid: cur.getAttribute('data-submit'),
            kind: 'submit',
            value: String(el.value || ''),
            arg: cur.getAttribute('data-arg')
          });
          return;
        }
        cur = cur.parentNode;
      }
    }
  });

  window.__studio = {
    _installed: true,
    patch: patch,
    morph: patch,
    runEffects: runEffects,
    flushInputs: flushInputs,
    setPoll: setPoll,
    dispatchDeepLink: dispatchDeepLink,
    _pendingCount: function() { return Object.keys(pendingInputs).length; }
  };
})();