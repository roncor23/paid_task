const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { validateLead, validatePatch, STATUSES } = require('./validate');
const { CATEGORIES } = require('./sort');
const auth = require('./auth');

const ID_RE = /^[1-9]\d{0,9}$/;
const parseId = (raw) => (ID_RE.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null);

function createApp({ db, sortLead, sendWebhook, env = {} }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const sessionSecret = env.SESSION_SECRET || env.API_TOKEN;

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // Make sure the table exists before any DB work (cheap after the first call).
  app.use(async (req, res, next) => {
    try { await db.init(); next(); } catch (err) { next(err); }
  });

  const isAuthed = (req) => {
    const header = req.get('authorization') || '';
    const m = header.match(/^Bearer (.+)$/);
    if (m && env.API_TOKEN && auth.safeEqual(m[1], env.API_TOKEN)) return true;
    return auth.validSession(auth.readCookie(req.headers.cookie, auth.COOKIE), sessionSecret);
  };
  const requireAuth = (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: 'Missing or invalid token' }));

  // ---- API ----
  app.post('/api/leads', async (req, res, next) => {
    try {
      const { value, error } = validateLead(req.body);
      if (error) return res.status(400).json({ error });
      const { category, urgency } = await sortLead(value);
      const lead = await db.insert({ ...value, category, urgency });
      try { await sendWebhook(lead); } catch (err) { console.warn('Webhook error:', err.message); }
      res.status(201).json(lead);
    } catch (err) { next(err); }
  });

  app.get('/api/leads', requireAuth, async (req, res, next) => {
    try {
      const { status, category } = req.query;
      if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
      if (category !== undefined && !CATEGORIES.includes(category)) return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
      res.json({ leads: await db.list({ status, category }) });
    } catch (err) { next(err); }
  });

  app.get('/api/leads/:id', requireAuth, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const lead = id && await db.get(id);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      res.json(lead);
    } catch (err) { next(err); }
  });

  app.patch('/api/leads/:id', requireAuth, async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      if (!id || !(await db.get(id))) return res.status(404).json({ error: 'Lead not found' });
      const { value, error } = validatePatch(req.body);
      if (error) return res.status(400).json({ error });
      res.json(await db.update(id, value));
    } catch (err) { next(err); }
  });

  app.all('/api/*', (req, res) => res.status(404).json({ error: 'Not found' }));

  // ---- Owner login ----
  app.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const userOk = username === undefined || username === (env.OWNER_USERNAME || 'owner');
    if (!env.OWNER_PASSWORD || !userOk || typeof password !== 'string' || !auth.safeEqual(password, env.OWNER_PASSWORD)) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    res.cookie(auth.COOKIE, auth.makeSession(sessionSecret), {
      httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: auth.MAX_AGE_S * 1000, path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/logout', (req, res) => {
    res.clearCookie(auth.COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // Dashboard page is only served to a logged-in owner.
  const dashboardFile = path.join(__dirname, '..', 'views', 'dashboard.html');
  app.get(['/dashboard', '/dashboard.html'], (req, res) => {
    if (!isAuthed(req)) return res.redirect(302, '/login.html');
    res.type('html').send(fs.readFileSync(dashboardFile, 'utf8'));
  });

  // Static files (Vercel serves public/ itself; this is for local runs).
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Errors: bad JSON → 400; anything else → 500 JSON, never a crash page.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) return res.status(400).json({ error: 'Request body must be valid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });

  return app;
}

module.exports = { createApp };
