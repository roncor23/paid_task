// Builds the real app from environment variables. Used by Vercel (api/index.js) and local runs (server.js).
const { createApp } = require('./app');
const { createDb } = require('./db');
const { makeSorter } = require('./sort');
const { makeWebhook } = require('./webhook');

function makeQuery(env) {
  if (env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 });
    pool.on('error', (err) => console.error('pg pool error', err.message));
    return (sql, params) => pool.query(sql, params);
  }
  if (env.VERCEL) throw new Error('DATABASE_URL is not set');
  // Local fallback: embedded Postgres persisted to ./.pglite (dev dependency).
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite(env.PGLITE_DIR || './.pglite');
  console.log('No DATABASE_URL: using local embedded Postgres in ./.pglite');
  return (sql, params) => pg.query(sql, params);
}

// Pasted dashboard values often carry stray whitespace or wrapping quotes; strip them.
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/^(["'])(.*)\1$/, '$2').trim() : v);
const SECRETS = ['API_TOKEN', 'OWNER_USERNAME', 'OWNER_PASSWORD', 'SESSION_SECRET', 'WEBHOOK_URL', 'DATABASE_URL', 'ANTHROPIC_API_KEY'];

function buildApp(rawEnv = process.env) {
  const env = { ...rawEnv };
  for (const k of SECRETS) if (env[k] !== undefined) env[k] = clean(env[k]);
  if (!env.API_TOKEN) console.warn('API_TOKEN is not set: every protected API call will return 401');
  return createApp({
    db: createDb(makeQuery(env)),
    sortLead: makeSorter({ apiKey: env.ANTHROPIC_API_KEY }),
    sendWebhook: makeWebhook({ url: env.WEBHOOK_URL }),
    env,
  });
}

module.exports = { buildApp };
