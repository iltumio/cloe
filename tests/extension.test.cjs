const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function content({ firefox = true, standalone = false, settings = {}, failure = false } = {}) {
  const listeners = {}, sent = [], navigated = [];
  let storageChanged;
  class Element {
    constructor(href) { this.href = href; }
    closest() { return this; }
    hasAttribute() { return false; }
  }
  const window = {
    location: { href: 'https://source.test/', assign: url => navigated.push(url) },
    matchMedia: () => ({ matches: standalone }),
    postMessage() {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const chrome = {
    storage: {
      sync: { get: (defaults, cb) => cb({ ...defaults, ...settings }) },
      onChanged: { addListener: fn => { storageChanged = fn; } },
    },
    runtime: {
      getURL: () => firefox ? 'moz-extension://test/' : 'chrome-extension://test/',
      sendMessage: (msg, cb) => { sent.push(msg); cb({ ok: !failure }); },
    },
  };
  const context = vm.createContext({
    chrome, window, Element, URL, console,
    document: { addEventListener: (type, fn) => { listeners[type] = fn; } },
  });
  vm.runInContext(fs.readFileSync('extension/rules.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('extension/content.js', 'utf8'), context);
  return {
    sent, navigated,
    click(url, extra = {}) {
      const event = { target: new Element(url), button: 0, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...extra };
      listeners.click(event);
      return event;
    },
    bridge(url) { listeners.message({ source: window, data: { type: '__cloe__open_external', url } }); },
    update(values) { Object.assign(settings, values); storageChanged(Object.fromEntries(Object.keys(values).map(k => [k, {}])), 'sync'); },
  };
}

test('Firefox tabs route matching links, leaving other links and modified clicks alone', () => {
  const app = content({ settings: { urlPatterns: ['^https://meet\\.google\\.com/'] } });
  assert.equal(app.click('https://meet.google.com/abc').prevented, true);
  assert.equal(app.sent.length, 1);
  app.click('https://other.test/');
  app.click('https://meet.google.com/abc', { ctrlKey: true });
  assert.equal(app.sent.length, 1);
});

test('Chromium stays PWA-only by default, with opt-in for browser tabs', () => {
  const app = content({ firefox: false, settings: { interceptAll: true } });
  app.click('https://target.test/');
  assert.equal(app.sent.length, 0);
  app.update({ interceptBrowserTabs: true });
  app.click('https://target.test/');
  assert.equal(app.sent.length, 1);
  const pwa = content({ firefox: false, standalone: true, settings: { interceptAll: true } });
  pwa.click('https://target.test/');
  assert.equal(pwa.sent.length, 1);
});

test('Firefox can disable tab interception; settings apply immediately', () => {
  const app = content({ settings: { interceptAll: true } });
  app.update({ interceptBrowserTabs: false });
  app.click('https://target.test/');
  app.bridge('https://target.test/');
  assert.equal(app.sent.length, 0);
});

test('failed native messaging falls back, non-HTTP and unmatched bridge requests are ignored', () => {
  const app = content({ failure: true, settings: { urlPatterns: ['^https://target\\.test/'] } });
  app.click('https://target.test/');
  assert.deepEqual(app.navigated, ['https://target.test/']);
  app.bridge('file:///etc/passwd');
  app.bridge('https://other.test/');
  assert.equal(app.sent.length, 1);
});

test('MAIN world window.open obeys browser-tab setting and preserves nonmatches', () => {
  const messages = [], opened = [];
  let receive;
  function Location() {}
  Location.prototype.assign = function() {};
  Location.prototype.replace = function() {};
  const window = {
    location: { href: 'https://source.test/' },
    matchMedia: () => ({ matches: false }),
    addEventListener: (_, fn) => { receive = fn; },
    postMessage: msg => messages.push(msg),
    open: url => { opened.push(url); return 'original'; },
  };
  vm.runInNewContext(fs.readFileSync('extension/content-main.js', 'utf8'), { window, Location, URL, console });
  assert.equal(messages[0].type, '__cloe__ready');
  receive({ source: window, data: { type: '__cloe__settings', patterns: ['^https://target\\.test/'], interceptBrowserTabs: true } });
  assert.equal(window.open('https://target.test/'), null);
  assert.equal(messages.at(-1).url, 'https://target.test/');
  assert.equal(window.open('https://other.test/'), 'original');
  receive({ source: window, data: { type: '__cloe__settings', interceptAll: true, interceptBrowserTabs: false } });
  assert.equal(window.open('https://target.test/'), 'original');
  assert.equal(opened.length, 2);
});


test('content scripts match structured routing rules as well as legacy patterns', () => {
  const app = content({ settings: { urlPatterns: [{ pattern: '^https://linear\\.app/', action: { type: 'deep_link', template: 'linear://{host}{path}' } }] } });
  app.click('https://linear.app/team/issue/ABC-1');
  assert.equal(app.sent.length, 1);
  assert.deepEqual(app.sent[0].url, 'https://linear.app/team/issue/ABC-1');
  assert.equal(app.sent[0].action, undefined);
});
