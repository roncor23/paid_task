# Lead Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the lead inbox (form, Postgres, sorting, dashboard, webhook, API) on Vercel + Neon, matching the brief's API exactly.

**Architecture:** One Express app (`src/app.js`) built by `createApp({ db, sortLead, sendWebhook, env })` so tests inject PGlite and fakes. `api/index.js` exports it for Vercel; `public/` holds static form, login and dashboard pages.

**Tech Stack:** Node 20+, Express 4, pg, @electric-sql/pglite (tests only), node:test + supertest.

**Spec:** `docs/superpowers/specs/2026-11-08-lead-inbox-design.md` plus the client brief.

## Global Constraints
- Lead JSON keys exactly: id, name, email, phone, service, message, category, urgency, status, note, created_at.
- service ∈ cleaning, repair, consultation, other. category ∈ booking, question, complaint, other. urgency ∈ high, normal, low. status ∈ new, contacted, won, lost.
- POST /api/leads → 201 lead | 400 {"error"}. GET /api/leads → 200 {"leads":[...]} newest first. GET/PATCH /api/leads/:id → 200 | 404. Non-POST routes → 401 without valid `Authorization: Bearer $API_TOKEN`.
- Webhook body: {"event":"lead.created","lead":{...}} to `WEBHOOK_URL`; failure never blocks the save.
- Text returned exactly as typed.

## Review Focus
- Unicode/emoji names at exactly 100 code points → accepted (test in Task 2).
- HTML/script in message → stored verbatim, rendered escaped in dashboard (test in Task 2 for verbatim; dashboard uses textContent).
- Body that is a JSON array / null / string → 400 not 500 (Task 2).
- Webhook URL hanging → request still returns 201 within ~3s (Task 3).
- `?status=new&category=booking` combined filter (Task 4).

---

### Task 1: Sorting rules + optional AI
**Files:** Create `src/sort.js`; Test `test/sort.test.js`
**Produces:** `ruleSort({message, service}) -> {category, urgency}`; `makeSorter({apiKey, fetchImpl}) -> async (lead) -> {category, urgency}` (AI then rules fallback).
- [ ] Tests: "I'd like to book a cleaning Tuesday" → booking; "How much is a repair?" → question; "Terrible service, I want a refund" → complaint; "hello" → other/normal; "URGENT water leak" → high; "no rush, whenever" → low; sorter with failing fetch → rule result; sorter without key → rule result.
- [ ] Implement, run `npm test`, commit.

### Task 2: Validation + DB + API routes
**Files:** Create `src/validate.js`, `src/db.js`, `src/app.js`; Test `test/api.test.js`
**Produces:** `validateLead(body) -> {ok:true, value} | {ok:false, error}`; `createDb(queryFn)` with `init()`, `insert()`, `list({status,category})`, `get(id)`, `update(id, patch)`; `createApp({db, sortLead, sendWebhook, env})`.
- [ ] Tests: every rule in Global Constraints and Review Focus; 401 for missing/wrong token on GET list, GET one, PATCH; 404 unknown/non-numeric id; PATCH bad status 400; PATCH note-only and both.
- [ ] Implement, run, commit.

### Task 3: Webhook
**Files:** Create `src/webhook.js`; extend `test/api.test.js`
**Produces:** `makeWebhook({url, fetchImpl, timeoutMs=3000}) -> async (lead) -> void` (never throws).
- [ ] Tests: payload shape; rejecting fetch → 201 still; no URL → no call.
- [ ] Implement, commit.

### Task 4: Dashboard, login, form, Vercel wiring, HANDOFF
**Files:** `public/index.html` (form), `public/login.html`, `public/dashboard.html`, `public/app.css`, `public/dashboard.js`, `api/index.js`, `vercel.json`, `HANDOFF.md`, `README.md`, `.env.example`.
- [ ] POST /login, POST /logout; cookie auth test; combined filter test.
- [ ] Manual check with local Postgres-less run (PGlite) at phone width.
- [ ] Commit.
