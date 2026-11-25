// core/tests/client_js.test.mjs
// Persistent zero-dependency Node test suite for ClientJS.matrix and wasmhost.template.html (A-22).
// Run with: node --test core/tests/client_js.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

function extractClientJs() {
  const src = fs.readFileSync(path.join(ROOT, 'frameworks/studio/ClientJS.matrix'), 'utf8');
  const startMarker = 'return r#"';
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, 'ClientJS.matrix must contain return r#"..."#');
  const end = src.lastIndexOf('"#');
  assert.ok(end > start + startMarker.length, 'ClientJS.matrix must close raw string');
  return src.slice(start + startMarker.length, end);
}

function extractWasmHostJs(clientJs) {
  const html = fs.readFileSync(path.join(ROOT, 'frameworks/targets/wasmhost.template.html'), 'utf8');
  const openTag = '<script>\n// ===== AppStudio wasm host';
  const start = html.indexOf(openTag);
  assert.ok(start >= 0, 'wasmhost.template.html must contain host script block');
  const end = html.indexOf('</script>', start);
  assert.ok(end > start, 'wasmhost.template.html must close script block');
  return html
    .slice(start + '<script>\n'.length, end)
    .replace('{{APP_BUNDLE_ID_JSON}}', JSON.stringify('sh.test.app'))
    .replace('{{APP_THEME_JSON}}', JSON.stringify({ mode: 'light' }))
    .replace('{{CLIENT_JS}}', clientJs);
}

// ---------- Lightweight faithful DOM harness for Node vm ----------

const VOID_TAGS = new Set(['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK']);

function decodeEntities(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

class MiniNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }
  get firstChild() {
    return this.childNodes[0] || null;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]
      : null;
  }
  appendChild(child) {
    return this.insertBefore(child, null);
  }
  insertBefore(child, ref) {
    if (child.nodeType === 11) {
      const kids = child.childNodes.slice();
      for (const k of kids) this.insertBefore(k, ref);
      return child;
    }
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    if (!ref) {
      this.childNodes.push(child);
    } else {
      const idx = this.childNodes.indexOf(ref);
      if (idx < 0) this.childNodes.push(child);
      else this.childNodes.splice(idx, 0, child);
    }
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  replaceChild(rep, old) {
    if (rep.parentNode) rep.parentNode.removeChild(rep);
    const idx = this.childNodes.indexOf(old);
    if (idx >= 0) {
      this.childNodes[idx] = rep;
      rep.parentNode = this;
      old.parentNode = null;
    }
    return old;
  }
  contains(target) {
    let cur = target;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }
}

class MiniText extends MiniNode {
  constructor(text, doc) {
    super(3, doc);
    this.nodeValue = String(text);
  }
  get textContent() {
    return this.nodeValue;
  }
  set textContent(v) {
    this.nodeValue = String(v);
  }
  cloneNode() {
    return new MiniText(this.nodeValue, this.ownerDocument);
  }
}

class MiniFragment extends MiniNode {
  constructor(doc) {
    super(11, doc);
  }
  querySelector(sel) {
    return queryInSubtree(this, sel, false);
  }
  querySelectorAll(sel) {
    return queryInSubtree(this, sel, true);
  }
}

class MiniClassList {
  constructor(el) {
    this._el = el;
  }
  _list() {
    return String(this._el.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean);
  }
  add(c) {
    const s = new Set(this._list());
    s.add(c);
    this._el.setAttribute('class', Array.from(s).join(' '));
  }
  remove(c) {
    const next = this._list().filter((x) => x !== c);
    this._el.setAttribute('class', next.join(' '));
  }
  contains(c) {
    return this._list().includes(c);
  }
}

class MiniElement extends MiniNode {
  constructor(tag, doc) {
    super(1, doc);
    this.tagName = String(tag).toUpperCase();
    this._attrs = new Map();
    this.style = {};
    this.classList = new MiniClassList(this);
    this.scrollTop = 0;
    this._value = '';
    this._valueSet = false;
    this.checked = false;
    this.selectionStart = null;
    this.selectionEnd = null;
    if (this.tagName === 'TEMPLATE') {
      this.content = new MiniFragment(doc);
    }
  }
  get type() {
    return (this.getAttribute('type') || 'text').toLowerCase();
  }
  get defaultValue() {
    return this.tagName === 'TEXTAREA' ? this.textContent : this.getAttribute('value') || '';
  }
  get value() {
    if (this._valueSet) return this._value;
    if (this.tagName === 'TEXTAREA') return this.textContent;
    if (this.tagName === 'SELECT') {
      for (const c of this.childNodes) {
        if (c.nodeType === 1 && c.hasAttribute('selected')) return c.getAttribute('value') || '';
      }
      const firstOpt = this.childNodes.find((c) => c.nodeType === 1 && c.tagName === 'OPTION');
      return firstOpt ? firstOpt.getAttribute('value') || '' : '';
    }
    return this.getAttribute('value') || '';
  }
  set value(v) {
    this._value = String(v);
    this._valueSet = true;
  }
  get attributes() {
    const out = [];
    for (const [name, value] of this._attrs.entries()) {
      out.push({ name, value });
    }
    return out;
  }
  getAttribute(name) {
    const k = String(name).toLowerCase();
    return this._attrs.has(k) ? this._attrs.get(k) : null;
  }
  hasAttribute(name) {
    return this._attrs.has(String(name).toLowerCase());
  }
  setAttribute(name, value) {
    const k = String(name).toLowerCase();
    const v = String(value);
    this._attrs.set(k, v);
    if (k === 'checked' && this.tagName === 'INPUT') {
      this.checked = true;
    }
  }
  removeAttribute(name) {
    const k = String(name).toLowerCase();
    this._attrs.delete(k);
    if (k === 'checked' && this.tagName === 'INPUT') {
      this.checked = false;
    }
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) {
      this.appendChild(new MiniText(String(v), this.ownerDocument));
    }
  }
  set innerHTML(html) {
    const target = this.tagName === 'TEMPLATE' ? this.content : this;
    target.childNodes = [];
    parseHtmlInto(String(html || ''), target, this.ownerDocument);
  }
  focus() {
    this.ownerDocument.activeElement = this;
  }
  select() {
    this.selectionStart = 0;
    this.selectionEnd = String(this.value || '').length;
  }
  setSelectionRange(s, e) {
    this.selectionStart = s;
    this.selectionEnd = e;
  }
  querySelector(sel) {
    return queryInSubtree(this, sel, false);
  }
  querySelectorAll(sel) {
    return queryInSubtree(this, sel, true);
  }
  cloneNode(deep = true) {
    const cl = new MiniElement(this.tagName, this.ownerDocument);
    for (const [k, v] of this._attrs.entries()) {
      cl.setAttribute(k, v);
    }
    if (this._valueSet) {
      cl._value = this._value;
      cl._valueSet = true;
    }
    cl.checked = this.checked;
    if (deep) {
      for (const c of this.childNodes) {
        cl.appendChild(c.cloneNode(true));
      }
    }
    return cl;
  }
}

function parseHtmlInto(html, root, doc) {
  const stack = [root];
  const tokenRe = /<(\/)?([a-zA-Z0-9-]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[4] !== undefined) {
      const txt = decodeEntities(m[4]);
      if (txt.length > 0) {
        stack[stack.length - 1].appendChild(new MiniText(txt, doc));
      }
      continue;
    }
    const isClose = !!m[1];
    const tag = m[2].toUpperCase();
    const attrStr = m[3] || '';
    if (isClose) {
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].tagName === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const el = new MiniElement(tag, doc);
    const attrRe = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let am;
    while ((am = attrRe.exec(attrStr)) !== null) {
      if (am[1] === '/') continue;
      const val = am[2] !== undefined ? am[2] : am[3] !== undefined ? am[3] : am[4] !== undefined ? am[4] : '';
      el.setAttribute(am[1], decodeEntities(val));
    }
    if (el.tagName === 'INPUT') {
      if (el.hasAttribute('checked')) el.checked = true;
    }
    stack[stack.length - 1].appendChild(el);
    const selfClosing = VOID_TAGS.has(tag) || attrStr.trim().endsWith('/');
    if (!selfClosing) {
      stack.push(el);
    }
  }
}

function matchesSingleSelector(el, sel) {
  if (!el || el.nodeType !== 1) return false;
  const s = sel.trim();
  if (s.startsWith('#')) {
    const id = s.slice(1).replace(/\\/g, '');
    return el.getAttribute('id') === id;
  }
  const parts = [];
  let rest = s;
  const tagMatch = rest.match(/^([a-zA-Z0-9-]+)/);
  if (tagMatch) {
    parts.push({ type: 'tag', val: tagMatch[1].toUpperCase() });
    rest = rest.slice(tagMatch[0].length);
  }
  while (rest.length > 0) {
    const clsM = rest.match(/^\.([a-zA-Z0-9_-]+)/);
    if (clsM) {
      parts.push({ type: 'class', val: clsM[1] });
      rest = rest.slice(clsM[0].length);
      continue;
    }
    const attrM = rest.match(/^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
    if (attrM) {
      parts.push({
        type: 'attr',
        name: attrM[1],
        val: attrM[2] !== undefined ? attrM[2].replace(/\\/g, '') : null,
      });
      rest = rest.slice(attrM[0].length);
      continue;
    }
    break;
  }
  if (parts.length === 0) return false;
  for (const p of parts) {
    if (p.type === 'tag' && el.tagName !== p.val) return false;
    if (p.type === 'class' && !el.classList.contains(p.val)) return false;
    if (p.type === 'attr') {
      if (!el.hasAttribute(p.name)) return false;
      if (p.val !== null && el.getAttribute(p.name) !== p.val) return false;
    }
  }
  return true;
}

function matchesSelector(el, selector) {
  return selector.split(',').some((part) => matchesSingleSelector(el, part));
}

function queryInSubtree(root, selector, all) {
  const results = [];
  function walk(node) {
    for (const c of node.childNodes) {
      if (c.nodeType === 1) {
        if (matchesSelector(c, selector)) {
          results.push(c);
          if (!all) return true;
        }
        if (walk(c) && !all) return true;
      }
    }
    return false;
  }
  walk(root);
  return all ? results : results[0] || null;
}

function createDomEnv(opts = {}) {
  const docListeners = new Map();
  const winListeners = new Map();
  const ipcMessages = [];
  const clipboardWrites = [];
  const openedUrls = [];
  const vibrations = [];
  const storageMap = new Map();
  let storageWrites = 0;

  const document = {
    title: '',
    activeElement: null,
    head: null,
    body: null,
    createElement(tag) {
      return new MiniElement(tag, document);
    },
    importNode(node, deep) {
      return node.cloneNode(deep);
    },
    getElementById(id) {
      return queryInSubtree(document.body, '#' + id, false);
    },
    querySelector(sel) {
      return queryInSubtree(document.head, sel, false) || queryInSubtree(document.body, sel, false);
    },
    querySelectorAll(sel) {
      return [
        ...queryInSubtree(document.head, sel, true),
        ...queryInSubtree(document.body, sel, true),
      ];
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(type, ev) {
      const fns = docListeners.get(type) || [];
      for (const fn of fns) fn(ev);
    },
    execCommand() {
      return true;
    },
  };
  document.head = new MiniElement('head', document);
  document.body = new MiniElement('body', document);

  const rootEl = document.createElement('div');
  rootEl.setAttribute('id', 'spid3r-root');
  document.body.appendChild(rootEl);

  const busyEl = document.createElement('div');
  busyEl.setAttribute('id', 'studio-busy');
  document.body.appendChild(busyEl);

  const offlineEl = document.createElement('div');
  offlineEl.setAttribute('id', 'studio-offline');
  offlineEl.style.display = 'none';
  document.body.appendChild(offlineEl);

  const bootEl = document.createElement('div');
  bootEl.setAttribute('id', 'studio-boot');
  document.body.appendChild(bootEl);

  const localStorage = {
    getItem(k) {
      return storageMap.has(k) ? storageMap.get(k) : null;
    },
    setItem(k, v) {
      storageWrites += 1;
      storageMap.set(k, String(v));
    },
    removeItem(k) {
      storageMap.delete(k);
    },
    get _writeCount() {
      return storageWrites;
    },
    _resetWrites() {
      storageWrites = 0;
    },
  };

  const navigator = {
    onLine: opts.onLine !== undefined ? opts.onLine : true,
    clipboard: {
      writeText(t) {
        clipboardWrites.push(t);
        return Promise.resolve();
      },
    },
    vibrate(ms) {
      vibrations.push(ms);
      return true;
    },
  };

  const window = {
    document,
    navigator,
    localStorage,
    innerWidth: 412,
    location: { protocol: 'https:', hostname: 'app.example.test' },
    ipc: {
      postMessage(msg) {
        ipcMessages.push(JSON.parse(msg));
      },
    },
    open(url, target, features) {
      openedUrls.push({ url, target, features });
    },
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    dispatchEvent(type, ev = {}) {
      const fns = winListeners.get(type) || [];
      for (const fn of fns) fn(ev);
    },
  };

  const sandbox = {
    window,
    document,
    navigator,
    localStorage,
    location: window.location,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    fetch: opts.fetch || undefined,
    Spid3r: opts.Spid3r || undefined,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    Buffer,
  };
  if (opts.location) {
    Object.assign(window.location, opts.location);
  }
  if (opts.webkit) {
    window.webkit = opts.webkit;
  }
  if (opts.StudioAndroid) {
    window.StudioAndroid = opts.StudioAndroid;
  }
  vm.createContext(sandbox);

  return {
    window,
    document,
    rootEl,
    offlineEl,
    bootEl,
    navigator,
    localStorage,
    sandbox,
    ipcMessages,
    clipboardWrites,
    openedUrls,
    vibrations,
  };
}

// =========================================================================
// 1. ClientJS Runtime Tests
// =========================================================================

test('ClientJS DOM morph: keyed patching preserves element identity across reorder/insert/delete', () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  env.window.__studio.patch(
    '<div class="page" data-pagekey="Home">' +
      '<div class="card" data-key="a"><span>Alpha</span></div>' +
      '<div class="card" data-key="b"><span>Beta</span></div>' +
      '<div class="card" data-key="c"><span>Gamma</span></div>' +
      '</div>',
    env.rootEl
  );

  const page = env.rootEl.firstChild;
  const nodeA = page.childNodes[0];
  const nodeB = page.childNodes[1];
  const nodeC = page.childNodes[2];
  assert.equal(nodeA.getAttribute('data-key'), 'a');
  assert.equal(nodeB.getAttribute('data-key'), 'b');
  assert.equal(nodeC.getAttribute('data-key'), 'c');

  // Reorder C before A, remove B, insert D at end, update A text
  env.window.__studio.patch(
    '<div class="page" data-pagekey="Home">' +
      '<div class="card" data-key="c"><span>Gamma</span></div>' +
      '<div class="card updated" data-key="a"><span>Alpha-2</span></div>' +
      '<div class="card" data-key="d"><span>Delta</span></div>' +
      '</div>',
    env.rootEl
  );

  const pageAfter = env.rootEl.firstChild;
  assert.equal(pageAfter, page, 'page container reused in place');
  assert.equal(pageAfter.childNodes.length, 3);
  assert.equal(pageAfter.childNodes[0], nodeC, 'keyed node C preserved identity on move');
  assert.equal(pageAfter.childNodes[1], nodeA, 'keyed node A preserved identity on move');
  assert.equal(nodeA.classList.contains('updated'), true, 'keyed node A updated class');
  assert.equal(nodeA.textContent, 'Alpha-2', 'keyed node A updated text in place');
  assert.equal(pageAfter.childNodes[2].getAttribute('data-key'), 'd');
  assert.equal(nodeB.parentNode, null, 'removed node B detached');
});

test('ClientJS DOM morph: preserves focused input caret & selection and syncs checkbox/select', () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  env.window.__studio.patch(
    '<div class="page" data-pagekey="Form">' +
      '<input id="q" type="text" data-input="on_q" value="hello">' +
      '<input id="chk" type="checkbox" data-change="on_chk">' +
      '<select id="sel" data-change="on_sel"><option value="a" selected>A</option><option value="b">B</option></select>' +
      '</div>',
    env.rootEl
  );

  const inp = env.document.getElementById('q');
  inp.focus();
  inp.value = 'hello world';
  inp.setSelectionRange(5, 8);

  // Patch with same server value "hello" (user is still typing) + checkbox checked + select="b"
  env.window.__studio.patch(
    '<div class="page" data-pagekey="Form">' +
      '<input id="q" type="text" data-input="on_q" value="hello">' +
      '<input id="chk" type="checkbox" data-change="on_chk" checked>' +
      '<select id="sel" data-change="on_sel"><option value="a">A</option><option value="b" selected>B</option></select>' +
      '</div>',
    env.rootEl
  );

  assert.equal(env.document.activeElement, inp, 'focus preserved on input');
  assert.equal(inp.value, 'hello world', 'in-progress user typing not clobbered when server value unchanged');
  assert.equal(inp.selectionStart, 5, 'caret start preserved');
  assert.equal(inp.selectionEnd, 8, 'caret end preserved');
  assert.equal(env.document.getElementById('chk').checked, true, 'checkbox synced to checked');
  assert.equal(env.document.getElementById('sel').value, 'b', 'select synced to new selected option');
});

test('ClientJS events: debounced input flushes atomically inside postUiWithFlush on tap and submit', async () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  env.window.__studio.patch(
    '<div class="page" data-pagekey="Home">' +
      '<form id="f" data-submit="add_task">' +
      '<input id="draft" type="text" data-input="on_draft" value="">' +
      '<button id="btn" data-tap="save_btn" data-arg="42">Save</button>' +
      '</form>' +
      '</div>',
    env.rootEl
  );

  const draft = env.document.getElementById('draft');
  const btn = env.document.getElementById('btn');
  draft.focus();
  draft.value = 'Buy milk';
  env.document.dispatchEvent('input', { target: draft });
  assert.equal(env.window.__studio._pendingCount(), 1, 'input is debounced and queued');
  assert.equal(env.ipcMessages.length, 0, 'no immediate IPC message during debounce window');

  // Tap button before debounce timer fires -> must flush pending input atomically in payload.flushed
  env.document.dispatchEvent('click', { target: btn });
  assert.equal(env.window.__studio._pendingCount(), 0, 'pending input drained on tap');
  assert.equal(env.ipcMessages.length, 1, 'single atomic IPC message emitted');
  const payload = JSON.parse(env.ipcMessages[0].payload);
  assert.equal(payload.sid, 'save_btn');
  assert.equal(payload.arg, '42');
  assert.ok(Array.isArray(payload.flushed) && payload.flushed.length === 1, 'flushed array carries pending input');
  assert.equal(payload.flushed[0].sid, 'on_draft');
  assert.equal(payload.flushed[0].value, 'Buy milk');

  // Verify debounce timer fires normally when no tap intervenes
  draft.value = 'Walk dog';
  env.document.dispatchEvent('input', { target: draft });
  await new Promise((r) => setTimeout(r, 130));
  assert.equal(env.ipcMessages.length, 2, 'debounced input delivers after timer');
  assert.equal(JSON.parse(env.ipcMessages[1].payload).value, 'Walk dog');
});

test('ClientJS runEffects: clipboard, open_url safety, haptic, and async http callback', async () => {
  const fetchCalls = [];
  const env = createDomEnv({
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        status: 200,
        async text() {
          return JSON.stringify({ pong: true });
        },
      };
    },
  });
  vm.runInContext(extractClientJs(), env.sandbox);

  env.window.__studio.runEffects([
    { kind: 'clipboard.copy', text: 'copied-secret-free' },
    { kind: 'open_url', url: 'https://example.org/docs' },
    { kind: 'open_url', url: 'javascript:alert(1)' },
    { kind: 'haptic', style: 'medium' },
    { kind: 'http', req_id: 'http7', method: 'GET', url: 'https://api.example.org/ping', cb: 'on_ping' },
  ]);

  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(env.clipboardWrites, ['copied-secret-free']);
  assert.equal(env.openedUrls.length, 1, 'blocks javascript: open_url');
  assert.equal(env.openedUrls[0].url, 'https://example.org/docs');
  assert.deepEqual(env.vibrations, [20]);
  assert.equal(fetchCalls.length, 1);
  assert.equal(env.ipcMessages.length, 1);
  const httpEv = JSON.parse(env.ipcMessages[0].payload);
  assert.equal(httpEv.sid, 'on_ping');
  assert.equal(httpEv.req_id, 'http7');
  assert.equal(httpEv.ok, true);
  assert.equal(httpEv.status, 200);
  assert.deepEqual(httpEv.json, { pong: true });
});

// =========================================================================
// 2. wasmhost.template.html Tests (__studioBack, offline banner, html_hash, storage_version)
// =========================================================================

test('wasmhost: __studioBack checks router.active stack depth, offline banner toggles, html_hash skips patch, storage_version diffs writes', async () => {
  const clientJs = extractClientJs();
  const hostJs = extractWasmHostJs(clientJs);

  let evalCallCount = 0;
  let lastEnvelopeIn = null;
  let nextFrame = null;

  const env = createDomEnv({
    onLine: false,
    fetch: async (url) => {
      assert.equal(url, 'app.matrix');
      return {
        ok: true,
        async text() {
          return 'let STUDIO_EVENT_JSON = "";\nfn main() -> int { return 0; }\n';
        },
      };
    },
    Spid3r: {
      async init() {
        return {
          eval(src) {
            evalCallCount += 1;
            const m = src.match(/let STUDIO_EVENT_JSON = ("(?:\\.|[^"])*");/);
            if (m) {
              const rawStr = JSON.parse(m[1].replace(/\\\{/g, '{').replace(/\\\}/g, '}'));
              lastEnvelopeIn = JSON.parse(rawStr);
            }
            return {
              ok: true,
              stdout: '@@STUDIO_FRAME@@\n' + JSON.stringify(nextFrame) + '\n',
            };
          },
        };
      },
    },
  });

  // Frame 1 (initial boot): tab 0 depth 1, tab 1 depth 2 (active = 1), storage_version = 1
  nextFrame = {
    css: 'body{color:#111;}',
    theme_version: 1,
    storage_version: 1,
    html: '<div class="page" data-pagekey="Detail"><p>Depth 2</p></div>',
    html_hash: 'h_frame_1',
    slot_nonce: 'nonce_abc',
    frame_epoch: 1,
    title: 'Demo',
    router: {
      active: 1,
      stacks: [[{ name: 'Home', params: {} }], [{ name: 'Stats', params: {} }, { name: 'Detail', params: {} }]],
    },
    state: { count: 1 },
    storage: { saved: 'v1' },
    theme: { mode: 'light' },
    effects: [],
  };

  vm.runInContext(hostJs, env.sandbox);
  await new Promise((r) => setTimeout(r, 30));

  // Verify offline banner shown when navigator.onLine === false, then hidden on 'online'
  assert.equal(env.offlineEl.style.display, 'block', 'offline banner visible when navigator.onLine is false');
  env.navigator.onLine = true;
  env.window.dispatchEvent('online');
  assert.equal(env.offlineEl.style.display, 'none', 'offline banner hides on online event');
  env.navigator.onLine = false;
  env.window.dispatchEvent('offline');
  assert.equal(env.offlineEl.style.display, 'block', 'offline banner reappears on offline event');

  assert.equal(evalCallCount, 1, 'initial boot evaluated once');
  assert.equal(env.rootEl.textContent, 'Depth 2', 'initial HTML patched into root');
  const writesAfterBoot = env.localStorage._writeCount;
  assert.ok(writesAfterBoot >= 1, 'storage persisted on initial frame');

  // Verify A-01: __studioBack reads router.active (1 -> depth 2), returns true and queues __studio_back__
  env.localStorage._resetWrites();
  let patchCalls = 0;
  const origPatch = env.window.__studio.patch;
  env.window.__studio.patch = function (...args) {
    patchCalls += 1;
    return origPatch.apply(this, args);
  };

  // Frame 2 (after back): unchanged storage_version (1) and html: null (matching html_hash) -> skip patch & skip localStorage write!
  nextFrame = {
    css: '',
    theme_version: 1,
    storage_version: 1,
    html: null,
    html_hash: 'h_frame_1',
    slot_nonce: 'nonce_abc',
    frame_epoch: 2,
    title: 'Demo',
    router: {
      active: 1,
      stacks: [[{ name: 'Home', params: {} }], [{ name: 'Stats', params: {} }]],
    },
    state: { count: 1 },
    storage: { saved: 'v1' },
    theme: { mode: 'light' },
    effects: [],
  };

  const handledBack = env.window.__studioBack();
  assert.equal(handledBack, true, '__studioBack returns true when active tab stack depth > 1');
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(evalCallCount, 2);
  assert.equal(lastEnvelopeIn.event.sid, '__studio_back__', '__studioBack dispatched __studio_back__ event');
  assert.equal(lastEnvelopeIn.html_hash, 'h_frame_1', 'envelope carried previous html_hash');
  assert.equal(patchCalls, 0, 'html: null frame skipped DOM patch');
  assert.equal(env.localStorage._writeCount, 0, 'unchanged storage_version skipped localStorage write');

  // Now active stack depth is 1 -> __studioBack must return false so Android exits cleanly
  const handledAtRoot = env.window.__studioBack();
  assert.equal(handledAtRoot, false, '__studioBack returns false when active tab stack depth <= 1');

  // Frame 3: storage_version increments to 2 and html changes -> triggers both patch and localStorage write
  nextFrame = {
    css: '',
    theme_version: 1,
    storage_version: 2,
    html: '<div class="page" data-pagekey="Stats"><p>Updated</p></div>',
    html_hash: 'h_frame_3',
    slot_nonce: 'nonce_abc',
    frame_epoch: 3,
    title: 'Demo',
    router: { active: 1, stacks: [[{ name: 'Home', params: {} }], [{ name: 'Stats', params: {} }]] },
    state: { count: 2 },
    storage: { saved: 'v2' },
    theme: { mode: 'light' },
    effects: [],
  };
  env.window.ipc.postMessage(JSON.stringify({ event: 'ui', payload: { sid: 'inc', kind: 'tap' } }));
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(patchCalls, 1, 'new html triggers DOM patch');
  assert.equal(env.rootEl.textContent, 'Updated');
  assert.equal(env.localStorage._writeCount, 1, 'incremented storage_version persists to localStorage');
  assert.deepEqual(JSON.parse(env.localStorage.getItem('studio:storage:sh.test.app')), { saved: 'v2' });
});

// =========================================================================
// 3. A-30 Accessibility (Modal Focus Trap / Restore & Tablist Roving Tabindex)
// =========================================================================

test('ClientJS A-30: dialog focus trap (Tab/Shift+Tab/Escape) and focus restore on close', () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  const baseHtml =
    '<div class="page" data-pagekey="Home"><button id="openBtn" data-tap="open_dlg">Open</button></div>';
  env.window.__studio.patch(baseHtml);
  const trigger = env.document.getElementById('openBtn');
  trigger.focus();
  assert.equal(env.document.activeElement, trigger, 'trigger button starts focused');

  const withDialog =
    baseHtml +
    '<div class="dialog-wrap" data-tap="dismiss_dlg">' +
    '<div class="dialog" role="dialog" aria-modal="true" tabindex="-1" data-stop-tap="1">' +
    '<button id="btnCancel" data-tap="cancel">Cancel</button>' +
    '<button id="btnOk" data-tap="confirm">Confirm</button>' +
    '</div></div>';

  env.window.__studio.patch(withDialog);
  const btnCancel = env.document.getElementById('btnCancel');
  const btnOk = env.document.getElementById('btnOk');
  assert.equal(env.document.activeElement, btnCancel, 'opening dialog moves focus to first focusable element');

  // Tab advances to second button
  let prevented = false;
  env.document.dispatchEvent('keydown', {
    key: 'Tab',
    shiftKey: false,
    target: btnCancel,
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(env.document.activeElement, btnOk, 'Tab moves focus inside modal');

  // Tab on last button wraps back to first button
  env.document.dispatchEvent('keydown', {
    key: 'Tab',
    shiftKey: false,
    target: btnOk,
    preventDefault() {},
  });
  assert.equal(env.document.activeElement, btnCancel, 'Tab wraps from last to first focusable');

  // Shift+Tab on first button wraps to last button
  env.document.dispatchEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    target: btnCancel,
    preventDefault() {},
  });
  assert.equal(env.document.activeElement, btnOk, 'Shift+Tab wraps from first to last focusable');

  // Escape triggers backdrop onDismiss
  env.document.dispatchEvent('keydown', {
    key: 'Escape',
    target: btnOk,
    preventDefault() {},
  });
  assert.equal(env.ipcMessages.length, 1);
  assert.equal(JSON.parse(env.ipcMessages[0].payload).sid, 'dismiss_dlg', 'Escape dispatches onDismiss');

  // Closing dialog restores focus to original trigger button
  env.window.__studio.patch(baseHtml);
  assert.equal(env.document.activeElement, trigger, 'closing dialog restores focus to trigger element');
});

test('ClientJS A-30: role="tablist" roving tabindex supports ArrowRight/ArrowLeft/Home/End and RTL', () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  env.window.__studio.patch(
    '<div class="segmented" role="tablist">' +
      '<button id="t0" role="tab" aria-selected="true" tabindex="0" data-tap="tab_0">One</button>' +
      '<button id="t1" role="tab" aria-selected="false" tabindex="-1" data-tap="tab_1">Two</button>' +
      '<button id="t2" role="tab" aria-selected="false" tabindex="-1" data-tap="tab_2">Three</button>' +
    '</div>'
  );
  const t0 = env.document.getElementById('t0');
  const t1 = env.document.getElementById('t1');
  const t2 = env.document.getElementById('t2');
  t0.focus();

  env.document.dispatchEvent('keydown', { key: 'ArrowRight', target: t0, preventDefault() {} });
  assert.equal(env.document.activeElement, t1, 'ArrowRight moves to second tab');
  assert.equal(t0.getAttribute('tabindex'), '-1');
  assert.equal(t1.getAttribute('tabindex'), '0');

  env.document.dispatchEvent('keydown', { key: 'End', target: t1, preventDefault() {} });
  assert.equal(env.document.activeElement, t2, 'End jumps to last tab');
  assert.equal(t2.getAttribute('tabindex'), '0');

  env.document.dispatchEvent('keydown', { key: 'ArrowRight', target: t2, preventDefault() {} });
  assert.equal(env.document.activeElement, t0, 'ArrowRight wraps from last to first tab');

  env.document.dispatchEvent('keydown', { key: 'ArrowLeft', target: t0, preventDefault() {} });
  assert.equal(env.document.activeElement, t2, 'ArrowLeft wraps from first to last tab');

  env.document.dispatchEvent('keydown', { key: 'Home', target: t2, preventDefault() {} });
  assert.equal(env.document.activeElement, t0, 'Home jumps to first tab');

  // Enter activates focused tab
  env.document.dispatchEvent('keydown', { key: 'Enter', target: t0, preventDefault() {} });
  assert.equal(env.ipcMessages.length, 1);
  assert.equal(JSON.parse(env.ipcMessages[0].payload).sid, 'tab_0');

  // RTL tablist reverses ArrowLeft/ArrowRight
  env.window.__studio.patch(
    '<div class="segmented" dir="rtl" role="tablist">' +
      '<button id="r0" role="tab" aria-selected="true" tabindex="0">A</button>' +
      '<button id="r1" role="tab" aria-selected="false" tabindex="-1">B</button>' +
    '</div>'
  );
  const r0 = env.document.getElementById('r0');
  const r1 = env.document.getElementById('r1');
  r0.focus();
  env.document.dispatchEvent('keydown', { key: 'ArrowLeft', target: r0, preventDefault() {} });
  assert.equal(env.document.activeElement, r1, 'RTL ArrowLeft advances to next logical tab');
});

// =========================================================================
// 4. A-04 Encrypted Storage (WebCrypto AES-GCM) & A-53 Deep-Link/Auth Bridge
// =========================================================================

test('ClientJS A-04 & A-53: WebCrypto AES-GCM secure storage encrypts at rest and deep-link dispatches auth callback', async () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  env.window.__studio.runEffects([
    { kind: 'secure_store.set', key: 'session_jwt', value: 'super-secret-value-42', cb: 'on_sec_set' },
  ]);
  await new Promise((r) => setTimeout(r, 40));

  const rawCipher = env.localStorage.getItem('studio:sec:session_jwt');
  assert.ok(rawCipher && !rawCipher.includes('super-secret-value-42'), 'stored payload is encrypted ciphertext, not plaintext');
  const parsedCipher = JSON.parse(rawCipher);
  assert.equal(parsedCipher.v, 1);
  assert.ok(parsedCipher.iv && parsedCipher.ct, 'stores AES-GCM iv + ciphertext');

  env.window.__studio.runEffects([
    { kind: 'secure_store.get', key: 'session_jwt', cb: 'on_sec_get' },
  ]);
  await new Promise((r) => setTimeout(r, 40));

  const getMsg = env.ipcMessages.map((m) => JSON.parse(m.payload)).find((p) => p.sid === 'on_sec_get');
  assert.ok(getMsg && getMsg.ok === true && getMsg.found === true);
  assert.equal(getMsg.value, 'super-secret-value-42', 'WebCrypto AES-GCM decrypts original secret');

  env.window.__studio.runEffects([
    { kind: 'secure_store.remove', key: 'session_jwt', cb: 'on_sec_rm' },
  ]);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(env.localStorage.getItem('studio:sec:session_jwt'), null, 'secure_remove deletes encrypted entry');

  // A-53: OAuth auth.open + deep-link callback dispatch + unsafe scheme rejection
  env.window.__studio.runEffects([
    { kind: 'auth.open', url: 'https://auth.example.org/login', redirect_scheme: 'myapp', cb: 'on_oauth' },
  ]);
  assert.equal(env.openedUrls.length, 1);
  assert.equal(env.window.__studioDeepLink('javascript:alert(1)'), false, 'rejects unsafe javascript: deep link');
  assert.equal(env.window.__studioDeepLink('myapp://callback?code=ok77'), true, 'accepts custom scheme deep link');

  const payloads = env.ipcMessages.map((m) => JSON.parse(m.payload));
  assert.ok(payloads.some((p) => p.sid === '__studio_deep_link__' && p.value === 'myapp://callback?code=ok77'), 'dispatches __studio_deep_link__');
  assert.ok(payloads.some((p) => p.sid === 'on_oauth' && p.kind === 'auth' && p.value === 'myapp://callback?code=ok77'), 'dispatches matching pending auth callback');
});

test('wasmhost A-46: iOS native bridge hydrates durable storage on boot and mirrors writes', async () => {
  const clientJs = extractClientJs();
  const hostJs = extractWasmHostJs(clientJs);
  const nativeCalls = [];
  let capturedEnvelope = null;

  let envRef = null;
  const env = createDomEnv({
    location: { protocol: 'appstudio:', hostname: 'app' },
    webkit: {
      messageHandlers: {
        studioNative: {
          postMessage(msg) {
            nativeCalls.push(msg);
            if (msg.action === 'storage_read') {
              setTimeout(() => {
                envRef.window.__studioNativeCallback(msg.id, {
                  ok: true,
                  value: JSON.stringify({ durable_key: 'from_ios_app_support' }),
                });
              }, 5);
            }
          },
        },
      },
    },
    fetch: async () => ({
      ok: true,
      async text() {
        return 'let STUDIO_EVENT_JSON = "";\nfn main() -> int { return 0; }\n';
      },
    }),
    Spid3r: {
      async init() {
        return {
          eval(src) {
            const m = src.match(/let STUDIO_EVENT_JSON = ("(?:\\.|[^"])*");/);
            if (m) {
              capturedEnvelope = JSON.parse(JSON.parse(m[1].replace(/\\\{/g, '{').replace(/\\\}/g, '}')));
            }
            return {
              ok: true,
              stdout:
                '@@STUDIO_FRAME@@\n' +
                JSON.stringify({
                  css: '',
                  theme_version: 1,
                  storage_version: 2,
                  html: '<div class="page" data-pagekey="Home">OK</div>',
                  html_hash: 'h1',
                  slot_nonce: 'n1',
                  frame_epoch: 1,
                  title: 'iOSDemo',
                  router: { active: 0, stacks: [[{ name: 'Home', params: {} }]] },
                  state: {},
                  storage: { durable_key: 'updated_on_ios' },
                  theme: { mode: 'light' },
                  effects: [],
                }) +
                '\n',
            };
          },
        };
      },
    },
  });
  envRef = env;

  vm.runInContext(hostJs, env.sandbox);
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(capturedEnvelope.caps.platform, 'ios', 'detects ios platform from appstudio: scheme');
  assert.equal(capturedEnvelope.caps.capabilities.secure_store, true, 'reports secure_store capability');
  assert.deepEqual(
    capturedEnvelope.storage,
    { durable_key: 'from_ios_app_support' },
    'hydrates durable storage from iOS native Application Support on boot'
  );
  assert.ok(
    nativeCalls.some((c) => c.action === 'storage_write' && c.payload.value.includes('updated_on_ios')),
    'mirrors updated storage back to iOS native Application Support'
  );
});

test('ClientJS A-30: empty-focusable modal traps Tab and open-modal patch preserves focused input caret', () => {
  const env = createDomEnv();
  vm.runInContext(extractClientJs(), env.sandbox);

  // Modal with zero focusable children must still prevent Tab from escaping
  env.window.__studio.patch(
    '<div class="page" data-pagekey="Home">' +
      '<div class="dialog-wrap">' +
        '<div id="empty-dlg" class="dialog" role="dialog" aria-modal="true" tabindex="-1">' +
          '<div class="dialog-body">Loading...</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
  const emptyDlg = env.document.getElementById('empty-dlg');
  assert.equal(env.document.activeElement, emptyDlg, 'focuses modal container when no focusable children exist');
  let tabPrevented = false;
  env.document.dispatchEvent('keydown', {
    key: 'Tab',
    shiftKey: false,
    target: emptyDlg,
    preventDefault() { tabPrevented = true; },
  });
  assert.equal(tabPrevented, true, 'Tab inside zero-focusable modal calls preventDefault to trap focus');
  assert.equal(env.document.activeElement, emptyDlg, 'focus stays on empty modal container');

  // Re-rendering while a modal with an input stays open must restore input caret/focus
  env.window.__studio.patch(
    '<div class="page" data-pagekey="Home">' +
      '<div class="dialog-wrap">' +
        '<div class="dialog" role="dialog" aria-modal="true" tabindex="-1">' +
          '<input id="modal-in" data-input="m_in" value="abc">' +
        '</div>' +
      '</div>' +
    '</div>'
  );
  const modalIn = env.document.getElementById('modal-in');
  modalIn.focus();
  modalIn.setSelectionRange(2, 2);
  env.document.dispatchEvent('focusin', { target: modalIn });
  // Simulate patch while modal remains open
  env.window.__studio.patch(
    '<div class="page" data-pagekey="Home">' +
      '<div class="dialog-wrap">' +
        '<div class="dialog" role="dialog" aria-modal="true" tabindex="-1">' +
          '<input id="modal-in" data-input="m_in" value="abc">' +
          '<span>status</span>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
  const modalInAfter = env.document.getElementById('modal-in');
  assert.equal(env.document.activeElement, modalInAfter, 'focused input inside open modal keeps focus across patch');
  assert.equal(modalInAfter.selectionStart, 2, 'focused input inside open modal preserves caret position');
});

test('ClientJS A-05 & A-53: open_url and auth.open route through iOS and Android native bridges', () => {
  // iOS WKWebView bridge
  const iosCalls = [];
  const iosEnv = createDomEnv({
    webkit: {
      messageHandlers: {
        studioNative: {
          postMessage(msg) { iosCalls.push(msg); },
        },
      },
    },
  });
  vm.runInContext(extractClientJs(), iosEnv.sandbox);
  iosEnv.window.__studio.runEffects([
    { kind: 'open_url', url: 'https://docs.example.org' },
    { kind: 'auth.open', url: 'https://sso.example.org/authorize', redirect_scheme: 'myapp', cb: 'on_sso' },
  ]);
  assert.equal(iosCalls.length, 2, 'iOS routes both open_url and auth.open to studioNative bridge');
  assert.equal(iosCalls[0].action, 'open_url');
  assert.equal(iosCalls[0].payload.url, 'https://docs.example.org');
  assert.equal(iosCalls[1].action, 'open_url');
  assert.equal(iosCalls[1].payload.url, 'https://sso.example.org/authorize');
  assert.equal(iosEnv.openedUrls.length, 0, 'does not fall back to no-op window.open on iOS');

  // Android WebView bridge
  const androidUrls = [];
  const andEnv = createDomEnv();
  andEnv.window.StudioAndroid = {
    openUrl(u) { androidUrls.push(u); return true; },
  };
  vm.runInContext(extractClientJs(), andEnv.sandbox);
  andEnv.window.__studio.runEffects([
    { kind: 'open_url', url: 'https://android.example.org' },
    { kind: 'auth.open', url: 'https://sso.example.org/login', redirect_scheme: 'myapp', cb: 'on_sso' },
  ]);
  assert.deepEqual(androidUrls, ['https://android.example.org', 'https://sso.example.org/login']);
  assert.equal(andEnv.openedUrls.length, 0, 'does not fall back to window.open when StudioAndroid.openUrl exists');
});

test('wasmhost A-53: cold-launch deep link arriving mid-boot executes AFTER initial boot frame', async () => {
  const clientJs = extractClientJs();
  const hostJs = extractWasmHostJs(clientJs);
  const seenEvents = [];
  let resolveFetch = null;

  const env = createDomEnv({
    fetch: () => new Promise((resolve) => {
      resolveFetch = () => resolve({
        ok: true,
        async text() {
          return 'let STUDIO_EVENT_JSON = "";\nfn main() -> int { return 0; }\n';
        },
      });
    }),
    Spid3r: {
      async init() {
        return {
          eval(src) {
            const m = src.match(/let STUDIO_EVENT_JSON = ("(?:\\.|[^"])*");/);
            if (m) {
              const ev = JSON.parse(JSON.parse(m[1].replace(/\\\{/g, '{').replace(/\\\}/g, '}')));
              seenEvents.push(ev.event);
            }
            return {
              ok: true,
              stdout:
                '@@STUDIO_FRAME@@\n' +
                JSON.stringify({
                  css: '',
                  theme_version: 1,
                  storage_version: 1,
                  html: '<div class="page" data-pagekey="Home">OK</div>',
                  html_hash: 'h1',
                  slot_nonce: 'n1',
                  frame_epoch: seenEvents.length,
                  title: 'ColdLaunchDemo',
                  router: { active: 0, stacks: [[{ name: 'Home', params: {} }]] },
                  state: {},
                  storage: {},
                  theme: { mode: 'light' },
                  effects: [],
                }) +
                '\n',
            };
          },
        };
      },
    },
  });

  vm.runInContext(hostJs, env.sandbox);
  await new Promise((r) => setTimeout(r, 15));
  // Native host delivers cold-launch deep link BEFORE app.matrix fetch completes
  assert.equal(env.window.__studioDeepLink('myapp://auth/callback?code=cold42'), true);
  // Now complete app.matrix fetch
  resolveFetch();
  await new Promise((r) => setTimeout(r, 80));

  assert.equal(seenEvents.length, 2, 'processes both initial boot frame and queued cold-launch deep link');
  assert.equal(seenEvents[0], null, 'initial boot frame (null) runs FIRST so boot_fn initializes state');
  assert.equal(seenEvents[1].sid, '__studio_deep_link__', 'cold-launch deep link runs SECOND after boot');
  assert.equal(seenEvents[1].value, 'myapp://auth/callback?code=cold42');
});

test('wasmworker.js A-03: uses persistent evalSession when available and falls back to eval', async () => {
  const workerSrc = fs.readFileSync(path.join(ROOT, 'frameworks/targets/wasmworker.js'), 'utf8');
  const bundleSrc = [
    'let STUDIO_EVENT_JSON = "";',
    'public fn __studio_dispatch(ev_json: string) -> int { return 0; }',
    '// @@STUDIO_MAIN_START@@',
    'fn main() -> int { return __studio_dispatch(string(STUDIO_EVENT_JSON)); }',
  ].join('\n');

  // 1. Persistent session mode
  const sessionCalls = [];
  const evalCalls = [];
  const messages = [];
  const ctx1 = vm.createContext({
    importScripts() {},
    postMessage(m) { messages.push(m); },
    Spid3r: {
      async init() {
        return {
          evalSession(src, eng) {
            sessionCalls.push({ src, eng });
            return { ok: true, stdout: '@@STUDIO_FRAME@@\n{}\n' };
          },
          resetSession() {},
          eval(src, eng) {
            evalCalls.push({ src, eng });
            return { ok: true, stdout: '' };
          },
        };
      },
    },
  });
  ctx1.self = ctx1;
  vm.runInContext(workerSrc, ctx1);

  ctx1.onmessage({ data: { id: 1, type: 'init', src: bundleSrc } });
  await new Promise((r) => setTimeout(r, 20));
  ctx1.onmessage({ data: { id: 2, type: 'eval', evJson: '{"event":null}' } });
  await new Promise((r) => setTimeout(r, 20));
  ctx1.onmessage({ data: { id: 3, type: 'eval', evJson: '{"event":{"sid":"s1","kind":"tap"}}' } });
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(evalCalls.length, 0, 'does not fall back to stateless eval when evalSession succeeds');
  assert.equal(sessionCalls.length, 3, 'loads module definitions once + dispatches 2 events');
  assert.ok(!sessionCalls[0].src.includes('fn main()'), 'initial evalSession strips main() marker');
  assert.ok(sessionCalls[1].src.startsWith('__studio_dispatch('), 'event 1 uses __studio_dispatch');
  assert.ok(sessionCalls[2].src.startsWith('__studio_dispatch('), 'event 2 uses __studio_dispatch');
  assert.equal(messages[0].type, 'ready');
  assert.equal(messages[1].ok, true);
  assert.equal(messages[2].ok, true);

  // 2. Stateless fallback mode when evalSession is absent
  const fbEvalCalls = [];
  const ctx2 = vm.createContext({
    importScripts() {},
    postMessage() {},
    Spid3r: {
      async init() {
        return {
          eval(src, eng) {
            fbEvalCalls.push({ src, eng });
            return { ok: true, stdout: '@@STUDIO_FRAME@@\n{}\n' };
          },
        };
      },
    },
  });
  ctx2.self = ctx2;
  vm.runInContext(workerSrc, ctx2);
  ctx2.onmessage({ data: { id: 1, type: 'init', src: bundleSrc } });
  await new Promise((r) => setTimeout(r, 20));
  ctx2.onmessage({ data: { id: 2, type: 'eval', evJson: '{"event":null}' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(fbEvalCalls.length, 1, 'falls back cleanly to stateless eval when evalSession is missing');
  assert.ok(
    fbEvalCalls[0].src.includes('let STUDIO_EVENT_JSON = "\\{\\"event\\":null\\}";'),
    'substitutes spid3r-escaped STUDIO_EVENT_JSON on fallback'
  );
});

test('spid3r.wasm A-03 & BUG-12: persistent evalSession runs demo bundle without unix_time trap', () => {
  const rtDir = path.join(ROOT, 'downloads/wasm-runtime/1.1.1');
  const jsPath = path.join(rtDir, 'spid3r.js');
  const wasmPath = path.join(rtDir, 'spid3r.wasm');
  if (!fs.existsSync(jsPath) || !fs.existsSync(wasmPath)) {
    return;
  }
  const req = createRequire(import.meta.url);
  const Spid3r = req(jsPath);
  const sp = Spid3r.initSync(fs.readFileSync(wasmPath));
  assert.equal(typeof sp.evalSession, 'function', 'cached spid3r.js exposes evalSession');

  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'appstudio_wasm_sess_'));
  try {
    const cleanEnv = { ...process.env };
    delete cleanEnv.SPID3R_PATH;
    execFileSync('spid3r', ['run', 'studio.matrix', 'build', 'workspace/demo', '--target', 'web', '-o', tmpOut], {
      cwd: ROOT,
      env: cleanEnv,
      stdio: 'pipe',
    });
    const flat = fs.readFileSync(path.join(tmpOut, 'web/app.matrix'), 'utf8');
    const cut = flat.lastIndexOf('// @@STUDIO_MAIN_START@@');
    assert.ok(cut > 0, 'bundled demo app.matrix contains @@STUDIO_MAIN_START@@ marker');

    const initRes = sp.evalSession(flat.slice(0, cut), 'vm');
    assert.equal(initRes.ok, true, 'persistent session init succeeds: ' + (initRes.error || ''));

    const env1 = JSON.stringify({
      event: null,
      slot_nonce: 'testnonce1',
      frame_epoch: 1,
      caps: { platform: 'web', prefers_dark: false, viewport_width: 1280 },
    });
    const r1 = sp.evalSession('__studio_dispatch(' + JSON.stringify(env1) + ');', 'vm');
    assert.equal(r1.ok, true, 'frame 1 dispatch succeeds without WASM panic: ' + (r1.error || ''));
    const f1Lines = String(r1.stdout || '').split(/\r?\n/);
    const idx1 = f1Lines.indexOf('@@STUDIO_FRAME@@');
    assert.ok(idx1 >= 0, 'frame 1 emits @@STUDIO_FRAME@@');
    const frame1 = JSON.parse(f1Lines[idx1 + 1]);
    assert.ok(String(frame1.html || '').includes('Welcome to AppStudio'), 'frame 1 renders demo tasks');
    assert.equal(frame1.frame_epoch, 1);

    // Dispatch a second event inside the SAME persistent VM session (switching to Stats tab)
    const tapMatch = String(frame1.html).match(/data-tap="([^"]+)"[^>]*><span class="icon">[^<]*<\/span><span>Stats<\/span>/);
    assert.ok(tapMatch, 'frame 1 exposes Stats tab tap slot');
    const env2 = JSON.stringify({
      event: { sid: tapMatch[1], kind: 'tap', value: null, arg: null },
      router: frame1.router,
      state: frame1.state,
      storage: frame1.storage,
      storage_version: frame1.storage_version,
      theme: frame1.theme,
      theme_version: frame1.theme_version,
      i18n: frame1.i18n,
      html_hash: frame1.html_hash,
      slot_nonce: frame1.slot_nonce,
      frame_epoch: frame1.frame_epoch,
      caps: { platform: 'web', prefers_dark: false, viewport_width: 1280 },
    });
    const r2 = sp.evalSession('__studio_dispatch(' + JSON.stringify(env2) + ');', 'vm');
    assert.equal(r2.ok, true, 'frame 2 persistent dispatch succeeds: ' + (r2.error || ''));
    const f2Lines = String(r2.stdout || '').split(/\r?\n/);
    const idx2 = f2Lines.indexOf('@@STUDIO_FRAME@@');
    assert.ok(idx2 >= 0, 'frame 2 emits @@STUDIO_FRAME@@');
    const frame2 = JSON.parse(f2Lines[idx2 + 1]);
    assert.equal(frame2.frame_epoch, 2, 'frame 2 advances epoch');
    assert.equal(frame2.router.active, 1, 'persistent session switched active tab to Stats');
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});
