const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWebhook } = require('../src/webhook');

const lead = { id: 1, name: 'Ana' };

test('posts lead.created JSON', async () => {
  const calls = [];
  const send = makeWebhook({ url: 'https://example.test/hook', fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; } });
  await send(lead);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.test/hook');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { event: 'lead.created', lead });
});

test('never throws on failure', async () => {
  const send = makeWebhook({ url: 'https://example.test/hook', fetchImpl: async () => { throw new Error('down'); } });
  await send(lead);
});

test('times out a hanging endpoint', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const send = makeWebhook({ url: 'https://example.test/hook', fetchImpl, timeoutMs: 50 });
  const t = Date.now();
  await send(lead);
  assert.ok(Date.now() - t < 1000);
});

test('no URL means no call', async () => {
  let called = false;
  await makeWebhook({ url: '', fetchImpl: async () => { called = true; } })(lead);
  assert.equal(called, false);
});
