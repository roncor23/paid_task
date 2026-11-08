# Lead Inbox — Design

The client brief (paid test) is the source of truth for behaviour. This file records the calls made on top of it.

## Intent
One piece of a small CRM for service businesses: a public lead form, a Postgres store, automatic sorting, an owner dashboard, a webhook, and a JSON API that other teams (and a grading script) build on. API paths, field names and status codes must match the brief exactly.

## Decisions (our calls)
- Stack: Node 20+, Express, `pg`. Plain HTML/CSS/JS front end (no build step).
- Hosting: Vercel (serverless; Express app exported from `api/index.js`), Neon Postgres via `DATABASE_URL`.
- Sorting: keyword rules always available; optional Claude call when `ANTHROPIC_API_KEY` is set, 4s timeout, falls back to rules on any failure or invalid output.
- Webhook: awaited after insert with a 3s timeout (serverless freezes after the response); failures are logged, never fail the request.
- Owner login: password from `OWNER_PASSWORD` (username `owner`), sets an httpOnly signed cookie (HMAC with `SESSION_SECRET`, falls back to `API_TOKEN`). API auth accepts `Authorization: Bearer $API_TOKEN` or that cookie.
- Edge cases: invalid JSON / wrong types → 400; non-integer id → 404; PATCH with neither field → 400; `note` must be a string (max 5000); invalid `?status`/`?category` filter → 400; phone optional string max 50; name ≤100 and message ≤2000 counted in Unicode code points; required fields must be non-blank after trim, but stored exactly as typed; list returns newest 500; `created_at` ISO-8601 UTC with no milliseconds.
- Schema is created on first request (`CREATE TABLE IF NOT EXISTS`).
