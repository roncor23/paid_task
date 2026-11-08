// Thin data layer over any `query(sql, params) -> { rows }` function (pg Pool in prod, PGlite in tests/dev).
const COLUMNS = 'id, name, email, phone, service, message, category, urgency, status, note, created_at';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  service    TEXT NOT NULL,
  message    TEXT NOT NULL,
  category   TEXT NOT NULL,
  urgency    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('second', now())
);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC, id DESC);
`;

function toLead(row) {
  if (!row) return null;
  const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
  return {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    service: row.service,
    message: row.message,
    category: row.category,
    urgency: row.urgency,
    status: row.status,
    note: row.note,
    created_at: created.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function createDb(query) {
  let ready;
  const init = () => {
    if (!ready) {
      ready = (async () => {
        // Each statement separately: pg's extended protocol rejects multi-statement strings with params.
        for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
          try { await query(stmt); } catch (err) {
            // Two cold starts racing on CREATE ... IF NOT EXISTS can hit a duplicate error; harmless.
            if (!/already exists|duplicate key/i.test(err.message)) throw err;
          }
        }
      })().catch((err) => { ready = null; throw err; });
    }
    return ready;
  };

  return {
    init,
    async insert(l) {
      const { rows } = await query(
        `INSERT INTO leads (name, email, phone, service, message, category, urgency)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
        [l.name, l.email, l.phone, l.service, l.message, l.category, l.urgency],
      );
      return toLead(rows[0]);
    },
    async list({ status, category, limit = 500 } = {}) {
      const where = [];
      const params = [];
      if (status) { params.push(status); where.push(`status = $${params.length}`); }
      if (category) { params.push(category); where.push(`category = $${params.length}`); }
      params.push(limit);
      const { rows } = await query(
        `SELECT ${COLUMNS} FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
        params,
      );
      return rows.map(toLead);
    },
    async get(id) {
      const { rows } = await query(`SELECT ${COLUMNS} FROM leads WHERE id = $1`, [id]);
      return toLead(rows[0]);
    },
    async update(id, patch) {
      const { rows } = await query(
        `UPDATE leads SET status = COALESCE($2, status), note = COALESCE($3, note)
         WHERE id = $1 RETURNING ${COLUMNS}`,
        [id, patch.status ?? null, patch.note ?? null],
      );
      return toLead(rows[0]);
    },
  };
}

module.exports = { createDb };
