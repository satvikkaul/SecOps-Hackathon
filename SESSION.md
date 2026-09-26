# Session log

_Append one entry per session, newest first. Keep each entry short: what changed, what we decided, and what's blocked._

## 2026-09-26 (Sat) — load-redirect risk, expertise levels, tabbed results

**Done** (FE, pulled on top of Nima's report-template and results-layout work)
- New risk **CARGO "Load redirected to thieves"** (base: carrier/broker 0.7, farm 0.2). New question **Q26** (can one person change a pickup/delivery address alone?) and fix **A19** (call back on a known number plus a second OK). Impact +1 each for carrier/broker, perishable, and customer concentration. New supply-chain impact LOAD. Q26 is reported with the payment safeguards (no CCCS/CIS control covers it).
- **Consequence chains**: `scenarios[].chain` = `default` plus `carrier`/`broker`/`coldstorage` versions, 3–5 plain steps each. `chainFor()` in `engine/explain.ts`.
- **Expertise**: `state.expertise`, default `basic`. Asked on the "Before you start" screen, where Simple users skip the standards choice. Switchable on Results. Simple: plain row wording (`labelBasic`), no framework tags, no numeric scores, chain instead of numbers on risk cards. Expert: a `tech` label under every question. **Scores are identical at every level.**
- **Results in tabs**, with Nima's sidebar kept. The Overview fits on one screen: gauge, the #1 risk's chain, and 3 "Start here" fixes. Cross-links switch tabs and then scroll.
- New demo story: CARGO #1 3.50 High, BEC #2 3.20. Actions A1, A19, A7, A8, A4. Tests updated (139 FE). BE seed regenerated, BE test updated (2 passing).
- Checked in headless Chrome at desktop and phone width: every tab, Simple vs Expert, the questionnaire at both levels, and the onboarding screen.

**Decisions**
- A1 (two-step login on email) is ranked above A19 because it lowers four risks. That's the pitch told honestly: email takeover is the way in, one-person load changes are where the money goes.
- The expertise level changes presentation only. That answers "does saying I'm an expert change my score?"

## 2026-09-26 (Sat) — share link live end to end

**Done**
- Pushed `main` (`dbffc0c..64b6e55`). The Railway FE was switched to `main`, and the live bundle has the BE URL and the share UI.
- Live check in headless Chrome: `?demo` → Share → the link opened the summary for Peel Valley, with the pinned DNS showing DMARC missing. The test row was deleted.
- Priority 3 (shareable read-only link) is done.

**Note**
- Every Share click creates a new row. That's fine for the demo, and there's no cleanup job.

## 2026-09-26 (Sat) — teammate branches integrated into main

**Found**
- The Railway FE deploys from `nima` (based on the first commit), which is why the live FE lacked the share UI.
- `nima` (`c421af6`) adds a risk register CSV export matching the OCI DCC workbook, plus a scenario `category`. `Hala's` (`ff90c8f`) adds provider-specific action steps, and a Supabase browser client that nothing uses.

**Done**
- Cherry-picked both onto `main` with the original authors kept (`0b03c0b` Nima, `3a0c4bf` Hala). Dropped the committed `node_modules` and `tsbuildinfo`. Results shows both the Share and the risk register buttons. `vite-env.d.ts` was merged to include `VITE_API_URL` and the Supabase vars.
- FE 125 tests pass and the build is clean. The BE demo seed is unchanged.

**Open**
- The Railway FE branch needs switching `nima` → `main`.
- Decide what to do with the Supabase browser client (NEXT_STEPS).

## 2026-09-26 (Sat) — pushed FE + BE integration

**Done**
- Pushed `5591a39..dbffc0c` to `main`. Nothing new from the teammate on the remote.
- The BE redeployed: `/api/health` ok, and the demo reseeded with `sector`.

**Open**
- The live FE bundle still served the old code at the last check (no share UI, no BE URL). Either the deploy is still running or it didn't trigger. Verify it in Railway.

## 2026-09-26 (Sat) — FE wired to BE

**Done** (at the user's request, in `FE/`)
- `api.ts` holds the three BE calls. `VITE_API_URL` is set on the Railway FE service.
- The domain check calls the BE first and falls back to the browser DoH check.
- Results has a "Share with a partner" button that shows the link and a copy button. `?share=<token>` renders `SharedSummary` from the stored snapshot, with DNS labelled as independently verified.
- `engine/snapshot.ts` (`buildSnapshot`) is shared by the Share button and `BE/gen_demo.ts`. It has a unit test, and the FE is at 112 tests.
- The footer copy changed from "answers never leave this computer" to "…unless you create a share link".
- Verified: the real payload against the live BE (201, CORS from the FE origin, server DNS attached, answers not exposed), and headless-Chrome screenshots of the share page and results. Test rows were deleted.

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
