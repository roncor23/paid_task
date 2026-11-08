const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleSort, makeSorter } = require('../src/sort');

const s = (message, service = 'other') => ruleSort({ message, service });

test('booking requests', () => {
  assert.equal(s("I'd like to book a cleaning on Tuesday", 'cleaning').category, 'booking');
  assert.equal(s('Can you come Tuesday?', 'cleaning').category, 'booking');
  assert.equal(s('Please schedule an appointment next week').category, 'booking');
});

test('questions', () => {
  assert.equal(s('How much is a repair?', 'repair').category, 'question');
  assert.equal(s('Do you service the north side?').category, 'question');
});

test('complaints', () => {
  assert.equal(s('Terrible service, I want a refund').category, 'complaint');
  assert.equal(s('Your cleaner broke my vase and never called back').category, 'complaint');
});

test('fallback is other / normal', () => {
  assert.deepEqual(s('hello'), { category: 'other', urgency: 'normal' });
});

test('urgency', () => {
  assert.equal(s('URGENT water leak in the kitchen').urgency, 'high');
  assert.equal(s('Need someone today asap').urgency, 'high');
  assert.equal(s('No rush, whenever you are free next month').urgency, 'low');
  assert.equal(s('Can you come Tuesday?').urgency, 'normal');
});

test('complaints are at least normal urgency', () => {
  assert.notEqual(s('No rush but your team was rude').urgency, 'low');
});

test('sorter without key uses rules', async () => {
  const sort = makeSorter({});
  assert.deepEqual(await sort({ message: 'How much?', service: 'other' }), { category: 'question', urgency: 'normal' });
});

test('sorter falls back to rules when AI call fails', async () => {
  const sort = makeSorter({ apiKey: 'x', fetchImpl: async () => { throw new Error('down'); } });
  assert.deepEqual(await sort({ message: 'How much?', service: 'other' }), { category: 'question', urgency: 'normal' });
});

test('sorter falls back when AI returns junk', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"category":"spam","urgency":"x"}' }] }) });
  const sort = makeSorter({ apiKey: 'x', fetchImpl });
  assert.equal((await sort({ message: 'How much?', service: 'other' })).category, 'question');
});

test('sorter uses valid AI answer', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{"category":"complaint","urgency":"high"}' }] }) });
  const sort = makeSorter({ apiKey: 'x', fetchImpl });
  assert.deepEqual(await sort({ message: 'hmm', service: 'other' }), { category: 'complaint', urgency: 'high' });
});
