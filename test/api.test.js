const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { PGlite } = require('@electric-sql/pglite');
const { createApp } = require('../src/app');
const { createDb } = require('../src/db');
const { makeSorter } = require('../src/sort');

const TOKEN = 'test-token';
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const good = { name: 'Ana Cruz', email: 'ana@example.com', phone: '', service: 'cleaning', message: 'Can you come Tuesday?' };

async function setup() {
  const pg = new PGlite();
  const db = createDb((sql, params) => pg.query(sql, params));
  const hooks = [];
  const app = createApp({
    db,
    sortLead: makeSorter({}),
    sendWebhook: async (lead) => { hooks.push(lead); },
    env: { API_TOKEN: TOKEN, OWNER_PASSWORD: 'pw', SESSION_SECRET: 'secret' },
  });
  return { app, hooks };
}

const post = (app, body) => request(app).post('/api/leads').set('Content-Type', 'application/json').send(body);

test('POST creates a lead with exact shape', async () => {
  const { app, hooks } = await setup();
  const res = await post(app, good);
  assert.equal(res.status, 201);
  const l = res.body;
  assert.deepEqual(Object.keys(l).sort(), ['category', 'created_at', 'email', 'id', 'message', 'name', 'note', 'phone', 'service', 'status', 'urgency'].sort());
  assert.equal(typeof l.id, 'number');
  assert.equal(l.status, 'new');
  assert.equal(l.note, '');
  assert.equal(l.category, 'booking');
  assert.equal(l.urgency, 'normal');
  assert.match(l.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(hooks.length, 1);
  assert.deepEqual(hooks[0], l);
});

test('phone is optional and text is returned exactly as typed', async () => {
  const { app } = await setup();
  const body = { name: '  Ana <b>Cruz</b> ', email: 'ana@example.com', service: 'repair', message: '<script>alert(1)</script>\n  "quotes" & ünïcødé 🎉 ' };
  const res = await post(app, body);
  assert.equal(res.status, 201);
  assert.equal(res.body.name, body.name);
  assert.equal(res.body.message, body.message);
  assert.equal(res.body.phone, '');
});

test('validation errors return 400 with error message', async () => {
  const { app } = await setup();
  const cases = [
    {},
    { ...good, name: undefined },
    { ...good, name: '   ' },
    { ...good, name: 'a'.repeat(101) },
    { ...good, email: 'not-an-email' },
    { ...good, email: '' },
    { ...good, service: 'plumbing' },
    { ...good, service: 'Cleaning' },
    { ...good, message: '' },
    { ...good, message: 'x'.repeat(2001) },
    { ...good, name: 123 },
    { ...good, phone: 5551234 },
    { ...good, phone: '1'.repeat(51) },
  ];
  for (const c of cases) {
    const res = await post(app, c);
    assert.equal(res.status, 400, JSON.stringify(c).slice(0, 80));
    assert.equal(typeof res.body.error, 'string');
    assert.ok(res.body.error.length > 0);
  }
});

test('limits are inclusive and count characters, not bytes', async () => {
  const { app } = await setup();
  const res = await post(app, { ...good, name: '🎉'.repeat(100), message: 'é'.repeat(2000) });
  assert.equal(res.status, 201);
});

test('malformed bodies return 400, not 500', async () => {
  const { app } = await setup();
  for (const raw of ['{bad json', '[]', 'null', '"str"', '']) {
    const res = await request(app).post('/api/leads').set('Content-Type', 'application/json').send(raw);
    assert.equal(res.status, 400, raw);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('auth required on every non-POST route', async () => {
  const { app } = await setup();
  const id = (await post(app, good)).body.id;
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: TOKEN }]) {
    assert.equal((await request(app).get('/api/leads').set(headers)).status, 401);
    assert.equal((await request(app).get(`/api/leads/${id}`).set(headers)).status, 401);
    assert.equal((await request(app).patch(`/api/leads/${id}`).set(headers).send({ status: 'won' })).status, 401);
  }
  const res = await request(app).get('/api/leads');
  assert.equal(typeof res.body.error, 'string');
});

test('GET list newest first with filters', async () => {
  const { app } = await setup();
  const a = (await post(app, { ...good, message: 'Can you come Tuesday?' })).body; // booking
  const b = (await post(app, { ...good, message: 'How much for a deep clean?' })).body; // question
  const c = (await post(app, { ...good, message: 'Please book me Friday' })).body; // booking
  await request(app).patch(`/api/leads/${c.id}`).set(AUTH).send({ status: 'won' });

  let res = await request(app).get('/api/leads').set(AUTH);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.leads.map((l) => l.id), [c.id, b.id, a.id]);

  res = await request(app).get('/api/leads?category=booking').set(AUTH);
  assert.deepEqual(res.body.leads.map((l) => l.id), [c.id, a.id]);

  res = await request(app).get('/api/leads?status=new').set(AUTH);
  assert.deepEqual(res.body.leads.map((l) => l.id), [b.id, a.id]);

  res = await request(app).get('/api/leads?status=new&category=booking').set(AUTH);
  assert.deepEqual(res.body.leads.map((l) => l.id), [a.id]);

  res = await request(app).get('/api/leads?status=bogus').set(AUTH);
  assert.equal(res.status, 400);
});

test('GET list returns at least 100', async () => {
  const { app } = await setup();
  for (let i = 0; i < 105; i++) await post(app, { ...good, message: `msg ${i}` });
  const res = await request(app).get('/api/leads').set(AUTH);
  assert.ok(res.body.leads.length >= 100);
  assert.equal(res.body.leads[0].message, 'msg 104');
});

test('GET one, 404s', async () => {
  const { app } = await setup();
  const l = (await post(app, good)).body;
  const res = await request(app).get(`/api/leads/${l.id}`).set(AUTH);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, l);
  for (const id of ['99999', 'abc', '1.5', '-1']) {
    assert.equal((await request(app).get(`/api/leads/${id}`).set(AUTH)).status, 404, id);
    assert.equal((await request(app).patch(`/api/leads/${id}`).set(AUTH).send({ status: 'won' })).status, 404, id);
  }
});

test('PATCH status, note, both, and invalid', async () => {
  const { app } = await setup();
  const l = (await post(app, good)).body;
  const url = `/api/leads/${l.id}`;

  let res = await request(app).patch(url).set(AUTH).send({ status: 'contacted' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'contacted');

  res = await request(app).patch(url).set(AUTH).send({ note: 'Called back' });
  assert.equal(res.status, 200);
  assert.equal(res.body.note, 'Called back');
  assert.equal(res.body.status, 'contacted');

  res = await request(app).patch(url).set(AUTH).send({ status: 'won', note: '' });
  assert.deepEqual([res.body.status, res.body.note], ['won', '']);

  for (const bad of [{ status: 'closed' }, { status: 'Won' }, { status: null }, { note: 5 }, {}, { foo: 1 }]) {
    res = await request(app).patch(url).set(AUTH).send(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(typeof res.body.error, 'string');
  }
  res = await request(app).get(url).set(AUTH);
  assert.equal(res.body.status, 'won');
});

test('webhook failure does not block saving', async () => {
  const pg = new PGlite();
  const app = createApp({
    db: createDb((s, p) => pg.query(s, p)),
    sortLead: makeSorter({}),
    sendWebhook: async () => { throw new Error('boom'); },
    env: { API_TOKEN: TOKEN },
  });
  const res = await post(app, good);
  assert.equal(res.status, 201);
  assert.equal((await request(app).get('/api/leads').set(AUTH)).body.leads.length, 1);
});

test('owner login cookie grants API access; logout removes it', async () => {
  const { app } = await setup();
  assert.equal((await request(app).post('/login').send({ password: 'nope' })).status, 401);
  const res = await request(app).post('/login').send({ password: 'pw' });
  assert.equal(res.status, 200);
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request(app).get('/api/leads').set('Cookie', cookie)).status, 200);
  assert.equal((await request(app).get('/api/leads').set('Cookie', 'session=forged.value')).status, 401);
});

test('unknown API route returns JSON 404', async () => {
  const { app } = await setup();
  const res = await request(app).get('/api/nope').set(AUTH);
  assert.equal(res.status, 404);
});

test('POST accepts a JSON body even without a JSON content-type', async () => {
  const { app } = await setup();
  const res = await request(app).post('/api/leads').set('Content-Type', 'text/plain').send(JSON.stringify(good));
  assert.equal(res.status, 201);
  assert.equal(res.body.name, good.name);
});

test('CORS: API answers preflight and sets allow-origin', async () => {
  const { app } = await setup();
  const pre = await request(app).options('/api/leads/1').set('Origin', 'https://other.example').set('Access-Control-Request-Method', 'PATCH');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], '*');
  assert.match(pre.headers['access-control-allow-headers'], /authorization/i);
  assert.match(pre.headers['access-control-allow-methods'], /PATCH/);
  const res = await post(app, good).set('Origin', 'https://other.example');
  assert.equal(res.headers['access-control-allow-origin'], '*');
});
