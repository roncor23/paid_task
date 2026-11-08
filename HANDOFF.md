# HANDOFF — Lead Inbox

**Live URL:** https://paidtask-eight.vercel.app
**Repo:** https://github.com/roncor23/paid_task

## Logins and tokens
- **Owner dashboard:** `/login.html` → username `owner`, password `paid_task1234`
- **API_TOKEN:** `1e35b50f06054ef365d13bfc75b8c29719cdac1384e3237d`
  e.g. `curl -H "Authorization: Bearer 1e35b50f06054ef365d13bfc75b8c29719cdac1384e3237d" https://paidtask-eight.vercel.app/api/leads`
- **WEBHOOK_URL** is set to the webhook.site URL from your message.

## Pages
- `/` public lead form
- `/login.html` owner login
- `/dashboard` owner dashboard (redirects to login if you're not logged in)

## How to run it
Stack: Node 20+, Express, Postgres (Neon in production), plain HTML/CSS/JS. No build step.

```bash
npm install
cp .env.example .env   # fill in values; leave DATABASE_URL empty to use a local embedded Postgres in ./.pglite
npm start              # http://localhost:3000
npm test               # 29 tests, use an in-memory Postgres (PGlite), no setup needed
```

To deploy on Vercel: import the repo, add the env vars from `.env.example` (DATABASE_URL = Neon connection string), deploy. The table is created automatically on the first request.

## What works
- Form with every rule from the brief, checked in the browser **and** on the server. Bad input always gets a 400 with `{"error": "..."}`, including bad JSON, wrong types and arrays. Never a 500.
- Leads are stored in Postgres (Neon), so they survive refreshes, restarts and redeploys.
- Automatic category and urgency on every new lead. Keyword rules are always available. If `ANTHROPIC_API_KEY` is set, Claude sorts first and the rules take over if the call fails, times out (4s) or returns junk. No key is set right now, so the live app uses rules.
- Webhook `{"event":"lead.created","lead":{...}}` POSTed to `WEBHOOK_URL` after the lead is saved. It has a 3s timeout, and a failure is logged but never blocks the save.
- Full API exactly as specified: 201/200/400/401/404, filters `?status=` and `?category=` (also both together), newest first. CORS is open so other teams can call it from a browser with the Bearer token, and a POST body is read as JSON even if the `Content-Type` header is missing.
- Owner dashboard that works on a phone: newest first, filter by status and category (the filters are kept in the URL), change status, add a note, log out.
- Text is stored and returned exactly as typed (no trimming or escaping). The dashboard shows it safely as plain text.

## Calls I made where the brief was unclear
- **Lengths** are counted in characters (so an emoji is 1), and the limits include the boundary: 100 for name, 2000 for message.
- **Required fields** that are only spaces count as empty. Valid values are still saved exactly as typed, spaces included.
- **Phone:** optional, any text up to 50 characters. Missing or `null` becomes `""`.
- **Service** must match exactly in lowercase (`Cleaning` is rejected).
- **Email:** simple `something@domain.tld` check, max 254 characters.
- **PATCH:** you can send status, note or both. A body with neither returns 400. `note` must be a string (max 5000 characters, `""` clears it). Unknown fields are ignored.
- **Bad filter value** (e.g. `?status=foo`) returns 400 with an error rather than an empty list.
- **Ids** that aren't positive whole numbers (`abc`, `1.5`, `-1`) return 404, the same as a missing id.
- **Auth check comes first:** a request with no token gets 401 even if the id doesn't exist.
- **List size:** returns the newest 500. The brief asked for at least 100.
- **`created_at`** is in UTC ISO format to the second, e.g. `2026-11-08T06:01:05Z`, matching the example.
- **Dashboard login:** a single owner account set by env vars (`OWNER_USERNAME` defaults to `owner`, plus `OWNER_PASSWORD`). Logging in sets an httpOnly signed cookie valid for 7 days. The API accepts that cookie as well as the Bearer token, so the dashboard never has to hold the API token in the browser. Requests with no cookie and no token still get 401 as the brief requires.
- **Webhook timing:** the webhook is sent before the 201 response, because Vercel can freeze the function once it has replied. The 3s timeout caps the delay.
- **Sorting rules:** complaint words win over booking words, and booking words win over question words. Words like "urgent", "asap", "today" or "leak" mean high urgency. "No rush" or "whenever" mean low, except that a complaint is never low.

## What doesn't work / not done
- No rate limiting on the public form or the login, so there's no spam or brute-force protection yet.
- No pagination in the dashboard (it shows the newest 500).
- No webhook retries. A failed delivery is only logged.
- No password reset and no multiple users.

## What I'd do next
1. Add rate limiting plus a honeypot field on the form, and lockout after failed logins.
2. Add webhook retries with a delivery log, and sign webhooks (HMAC header) so the receiver can verify them.
3. Add search and pagination in the dashboard, plus an "unread" count for new leads.
4. Add database migrations (instead of creating the table at startup) and an `updated_at` column.
5. Turn on AI sorting with a key, and log which sorter was used so the rules can be tuned.
