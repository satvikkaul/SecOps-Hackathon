# Session log

_Append one entry per session, newest first. Keep each entry short: what changed, what we decided, and what's blocked._

## 2026-09-26 (Sat) — BE deployed

**Done**
- BE live on Railway at https://imaginative-tenderness-production-be96.up.railway.app with Supabase (session pooler). All endpoints were smoke-tested on the live URL, and the test row was deleted afterwards.
- The BE now fails fast with a clear error when `DATABASE_URL` is missing.

**Gotchas hit**
- An empty `DATABASE_URL` made psycopg try a local socket, which crashed startup and caused 502s.
- Pasting log lines into the Railway Raw Editor created junk variables, which broke the build with `secret psycopg_pool not found`. Keep the BE variables to exactly `DATABASE_URL`, `FRONTEND_URL`, and `PORT=8080`.

**Open**
- The Supabase DB password was shared in chat. Rotate it after judging.

## 2026-09-26 (Sat) — BE storage built

**Done**
- `BE/` built with FastAPI, psycopg pool, and dnspython: health, DNS check, create assessment, and the read-only share endpoint. Schema in `BE/schema.sql`, applied on startup.
- The demo snapshot is generated from the FE engine with `BE/gen_demo.ts` and seeded with the fixed token `demo-peel-valley`.
- Tested against local Postgres 17 in Docker: pytest 2/2 passing. The live DNS check was verified (google.com → google/reject, torontomu.ca → quarantine). CORS rejects unknown origins, and RLS is on for both tables.
- PLAN.md: added the Supabase DB design (tables, lockdown, pooler) and the Gemini phase 2 design.

**Decisions**
- Storage is **Supabase Postgres over a plain connection string**, not supabase-js or REST. RLS is on with no policies on every table.
- Supabase's **session pooler** is used because the direct connection is IPv6-only. Prepared statements are off, so the transaction pooler also works.
- **Gemini writes the wording and doesn't rank.** The engine still picks and orders the top 5, and Gemini rewrites them for the business. The output is validated (same ids, same order), falls back to engine text, and is stored in `action_plans`. Gemini is never sent the company name, domain, or raw answers.
- Demo DNS rows are `pinned`, so they're never refreshed from the network.

**Blocked / open**
- The BE isn't deployed yet. It needs the Supabase `DATABASE_URL` and a Railway service.
- The second demo persona isn't defined yet.

## 2026-09-26 (Sat) — repo setup + BE plan

**Done**
- Cloned the repo. Added `CLAUDE.md`, `.gitignore`, and the root README. Stopped tracking `.DS_Store` and `tsbuildinfo`.
- Checked the FE: 111 tests pass, the build is clean, and the live Railway URL serves the same build.
- Wrote [PLAN.md](PLAN.md) (FE/BE split, API contract, schema), [STATUS.md](STATUS.md), and [NEXT_STEPS.md](NEXT_STEPS.md).

**Decisions**
- The FE teammate owns `FE/`, and we own `BE/`.
- Scoring stays in the FE (TS). The BE stores inputs plus an FE-computed results snapshot and does **not** re-score.
- The BE runs the DNS check server-side, and that is the "independently verified" input. It's cached in Postgres for flaky wifi.
- Share links use `/?share=<token>`. They can't be changed, and raw answers are not exposed to partners.
- No ORM and no migrations: plain SQL with `create table if not exists`.

**Blocked / open**
- Local commits are not pushed yet (pushing deploys).
- The second demo persona isn't defined yet.
