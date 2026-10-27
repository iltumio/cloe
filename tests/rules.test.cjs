const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ URL, console });
vm.runInContext(fs.readFileSync('extension/rules.js', 'utf8'), context);
const rules = context.CloeRules;
const plain = value => JSON.parse(JSON.stringify(value));

test('legacy rules keep their default-browser behavior', () => {
  assert.deepEqual(plain(rules.selectAction(['^https://example\\.com/'], 'https://example.com/a')), { type: 'default' });
  assert.throws(() => rules.selectAction([], 'https://example.com/'), /No matching rule/);
});

test('first rule wins, captures and URL components build deep links', () => {
  const url = 'https://linear.app/team/issue/ABC-1?q=one#two';
  const action = rules.selectAction([
    { pattern: '^https://linear\\.app/(.*)$', action: { type: 'deep_link', template: 'linear://{1}' } },
    { pattern: '.*', action: { type: 'default' } },
  ], url, true);
  assert.equal(action.url, 'linear://team/issue/ABC-1?q=one#two');
  assert.equal(rules.expand('linear://{host}{path}{query}{hash}', url, []), 'linear://linear.app/team/issue/ABC-1?q=one#two');
  assert.equal(rules.expand('custom://open?url={encodedUrl}', url, []), 'custom://open?url=' + encodeURIComponent(url));
  assert.deepEqual(plain(rules.selectAction([], url, true)), { type: 'default' });
});

test('command URLs remain one argument, without shell quoting or splitting', () => {
  const url = 'https://example.com/?q=a&cmd=$(touch%20/tmp/nope)';
  const action = rules.selectAction([{ pattern: '.*', action: {
    type: 'command', program: 'omarchy', args: ['launch', 'webapp', '{url}', 'literal argument with spaces'],
  } }], url);
  assert.deepEqual(plain(action), { type: 'command', program: 'omarchy', args: ['launch', 'webapp', url, 'literal argument with spaces'] });
});

test('invalid regexes are skipped; unsupported destinations and source schemes fail closed', () => {
  assert.deepEqual(plain(rules.selectAction(['[', 'example'], 'https://example.com/')), { type: 'default' });
  assert.throws(() => rules.selectAction(['.*'], 'file:///tmp/a'), /HTTP/);
  for (const type of ['file', 'javascript', 'https', 'data']) {
    assert.throws(() => rules.validateAction({ type: 'deep_link', template: type + '://test' }), /application protocol/);
  }
  assert.throws(() => rules.validateAction({ type: 'command', program: '{url}', args: [] }), /executable/);
  assert.throws(() => rules.validateAction({ type: 'command', program: 'omarchy', args: [null] }), /arguments/);
});

test('background chooses stored actions, ignoring a page-supplied executable', async () => {
  let receive;
  const sent = [];
  const chrome = {
    storage: {
      sync: { get(defaults, callback) {
        const data = { ...defaults, urlPatterns: [{ pattern: '^https://linear\\.app/', action: { type: 'deep_link', template: 'linear://{host}{path}' } }] };
        if (callback) callback(data);
        return Promise.resolve(data);
      } },
      onChanged: { addListener() {} },
    },
    runtime: {
      onMessage: { addListener(fn) { receive = fn; } },
      sendNativeMessage(host, message, callback) { sent.push(message); callback({ ok: true }); },
    },
  };
  const background = vm.createContext({ chrome, URL, console });
  vm.runInContext(fs.readFileSync('extension/rules.js', 'utf8'), background);
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), background);
  const reply = await new Promise(resolve => receive({ type: 'OPEN_EXTERNAL', url: 'https://linear.app/team/issue/ABC-1', action: { type: 'command', program: 'evil' } }, {}, resolve));
  assert.equal(reply.ok, true);
  assert.equal(sent[0].action.type, 'deep_link');
  assert.equal(sent[0].action.url, 'linear://linear.app/team/issue/ABC-1');
  const rejected = await new Promise(resolve => receive({ type: 'OPEN_EXTERNAL', url: 'https://other.test/', action: { type: 'command', program: 'evil' } }, {}, resolve));
  assert.equal(rejected.ok, false);
  assert.equal(sent.length, 1);
});
