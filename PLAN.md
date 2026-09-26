# Plan: FE + BE

## Split of responsibilities

| | FE (`FE/`, owned by the FE teammate) | BE (`BE/`, owned by us) |
| --- | --- | --- |
| Runs | Static Vite build on Railway | FastAPI on Railway, Postgres on Supabase |
| Owns | Questionnaire, **all scoring** (TS engine), results UI, share view UI | Persistence, share tokens, server-side DNS check, demo seed data, Gemini wording (phase 2) |
| Stores | Draft answers in `localStorage` | Finished assessments, DNS results, and (phase 2) Gemini plans in Supabase Postgres |

**The BE does not score.** The scoring engine is TypeScript, has 111 tests, and already ships. Porting it to Python would mean keeping two copies in sync by tomorrow morning. The BE stores what the FE computed.

What the BE adds that the browser can't:
1. **Durable, shareable results.** A carrier sends a broker or grocery DC a link, and the link still works on another machine.
2. **A DNS check that the carrier can't fake.** The server looks up SPF/DMARC and stores the result, so a partner sees evidence we fetched ourselves, not a self-report. Results are cached in Postgres, so the demo survives venue wifi blocking DNS.
3. **Seeded demo data** on the live instance, so judges can open a share link immediately.

## Flow

```
Carrier (browser)                          BE (FastAPI)                 Postgres
─────────────────                          ────────────                 ────────
Domain step ── GET /api/dns/{domain} ────► dnspython lookup ──────────► dns_checks (cache)
            ◄── {mx, spf, dmarc} ──────────  (cache hit if < 24h, or on lookup failure)
Questionnaire (local, localStorage)
Results (scored in browser)
"Share with a partner" ── POST /api/assessments ──► validate ─────────► assessments
            ◄── {shareUrl} ────────────────
                                                       
Broker / DC opens  FE /?share=<token>
            ── GET /api/share/{token} ────► read-only snapshot ◄──────── assessments
```

The share URL uses `?share=<token>` (the same pattern as the existing `?demo`), so the static host needs no SPA path fallback.

## API contract (for the FE teammate)

Live BE: `https://imaginative-tenderness-production-be96.up.railway.app`. Base URL comes from `VITE_API_URL`, which **must be set in Railway before the FE build runs** because Vite inlines it at build time.

### `GET /api/health`
`{"ok": true, "db": true}`

### `GET /api/dns/{domain}`
Server-side MX/SPF/DMARC lookup. The response has the same shape as the FE's `DnsResult` (`FE/src/engine/dns.ts`), so the FE can drop it in place of the Cloudflare DoH call:
```json
{
  "domain": "example.ca",
  "mx":    {"status": "ok|missing|error", "records": [], "provider": "m365|google|other|null"},
  "spf":   {"status": "ok|missing|error", "record": "v=spf1 ..." },
  "dmarc": {"status": "ok|missing|error", "record": "v=DMARC1; p=none", "policy": "none"},
  "checkedAt": "2026-09-26T15:00:00Z",
  "cached": false
}
```
`400` if the domain is invalid. If DNS fails but there is a cached row, the cached row is returned with `"cached": true`.

### `POST /api/assessments`
```json
{
  "company": "Peel Valley Fresh Logistics",
  "domain": "peelvalleyfresh.ca",
  "profile": {"sector": "carrier", "employees": "11-50", "...": "..."},
  "answers": {"Q1": "no", "Q2": "partial", "...": "..."},
  "rankingMode": "effort",
  "results": {
    "posture": {"score": 3.2, "band": "High"},
    "scenarios": [{"id": "BEC", "name": "...", "risk": 3.2, "band": "High"}],
    "topActions": [{"id": "A1", "title": "...", "cost": "Free", "time": "Under 1 hour", "effort": 1, "priority": 0.74, "cccs": ["BC.5.1"]}],
    "cccs": [{"control": "BC.5", "status": "Not yet met"}]
  }
}
```
→ `201 {"id": "...", "shareToken": "...", "shareUrl": "https://<fe>/?share=<token>"}`

- `results` is a snapshot. The FE decides its exact shape, and the BE stores it as JSONB and returns it unchanged.
- The BE validates `answers` (keys `Q\d+`, values `yes|partial|no|unsure|na`), `profile` (string values), the domain format, and a 64 KB body cap.
- The BE attaches its own DNS result for `domain` (the verified part). It ignores any DNS result the client sends.
- Assessments can't be changed. Re-assessing creates a new row and a new link, so a partner's link never changes under them.

### `GET /api/share/{token}`
Read-only view for the partner: `company`, `domain`, `createdAt`, `rankingMode`, `results`, `dns` (server-verified). **Raw answers are not returned.** The partner sees the summary, not the full questionnaire.
`404` for an unknown token.

## Database (Supabase Postgres)

Supabase is **only a Postgres host** for us. The BE connects with a plain connection string (`psycopg`). We don't use supabase-js, the Supabase REST API, or Supabase Auth.

- **Connection:** Supabase → Connect → **Session pooler** URI (IPv4), set as `DATABASE_URL` on the Railway BE service. The direct connection is IPv6-only and can fail from Railway. The BE disables prepared statements, so the transaction pooler (port 6543) also works.
- **Schema:** [`BE/schema.sql`](BE/schema.sql), applied idempotently on every BE startup. It can also be pasted into the Supabase SQL editor.
- **Lockdown:** RLS is **enabled with no policies** on every table. Supabase serves the `public` schema over REST with a public anon key, so this is what stops anyone from reading every carrier's weaknesses. The BE connects as the owner role, which bypasses RLS.

### Tables

**`assessments`**: one row per shared assessment. Rows are never changed; re-assessing creates a new row.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `share_token` | text unique | `secrets.token_urlsafe(16)` (128-bit). Demo rows use fixed tokens (`demo-peel-valley`) |
| `company` | text | 1–200 chars |
| `domain` | text null | Normalized and validated by the BE |
| `profile` | jsonb | Business profile: `sector`, `employees`, `payments`, … |
| `answers` | jsonb | `Q1..Qn → yes/partial/no/unsure/na`. **Never returned by the share endpoint** |
| `ranking_mode` | text | `effort` or `cost` (check constraint) |
| `results` | jsonb | FE-computed snapshot: `posture`, `scenarios`, `topActions`, `cccs` |
| `dns` | jsonb null | The **BE's own** DNS result at creation time (the verified input) |
| `created_at` | timestamptz | |

**`dns_checks`**: DNS cache, one row per domain.

| Column | Type | Notes |
| --- | --- | --- |
| `domain` | text PK | |
| `result` | jsonb | Same shape as the FE's `DnsResult` |
| `pinned` | bool | Demo rows. They're never refreshed, so the demo never depends on the network |
| `checked_at` | timestamptz | Rows are refreshed after 24 h. A stale row is served if a live lookup fails |

Why JSONB and not a table per question: the questions, actions and weights live in the FE's JSON files, and the teammate is still changing them. JSONB means adding a question needs no migration. Sector reporting later is still one query: `select profile->>'sector', count(*) from assessments group by 1`.

**`action_plans`** (phase 2, Gemini; not created yet)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `assessment_id` | uuid FK → assessments | |
| `model` | text | e.g. `gemini-2.5-flash` |
| `prompt_version` | text | Bumped whenever the prompt changes |
| `plan` | jsonb | The validated Gemini output |
| `created_at` | timestamptz | |

Stored once per assessment and served from the DB after that. The demo never waits on Gemini, and the share page shows the same text every time.

## Phase 2: Gemini action plan

**Gemini writes the plan's wording. It does not choose or rank the actions.** The engine's formula (Risk ÷ Effort, with "show the math") is the pitch. An LLM that picks the actions can't show its math, can make things up, and gives different answers on reruns.

`POST /api/assessments/{id}/plan`:
1. The BE loads the stored `results.topActions` (already ranked by the engine) and the `profile`.
2. It sends Gemini **only** the sector, size, profile flags, and the top 5 actions with their cost, effort and CCCS IDs. It never sends the company name, the domain, or the raw answers.
3. It asks for structured JSON: for each action, `{id, headline, whyForYou, firstStep, owner}` in plain business language.
4. The BE checks that the ids match the engine's list **in the same order**, with nothing added or removed, and that the fields are within length limits. If the check fails, or Gemini times out after 8 s or isn't configured, it falls back to the engine's own `whatToDo` text.
5. The result is saved in `action_plans` and returned.

Env: `GEMINI_API_KEY`, `GEMINI_MODEL`. SDK: `google-genai`.

Judge answer: *"The ranking is deterministic and you can check it. Gemini only rewrites the top 5 for this business, and it can't change the order."*

## BE stack

- `BE/` with `uv`: `fastapi`, `uvicorn`, `psycopg[binary,pool]`, `dnspython`. Plain SQL, no ORM.
- Railway service: same repo, root dir `BE`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/api/health`.
- Env: `DATABASE_URL` (Supabase session pooler), `FRONTEND_URL` (used to build share URLs, and the only CORS origin besides `localhost:5173`).
- Seed: on startup, upsert the demo assessments (`BE/app/demo_*.json`, generated from the FE engine) and pin their DNS results.

## Judge justification

- **Scoring in the browser:** it's instant, works offline, and the "show the math" panel can trace every number back to an answer.
- **FastAPI:** Python for the DNS evidence (`dnspython`) and the Gemini integration. Validation at the boundary uses Pydantic.
- **Supabase Postgres:** each carrier's assessment is tenant data that gets shared outside the company. It needs durable storage, unguessable read-only links, and RLS so the public API exposes nothing.
- **Railway:** the FE and BE are both deployed from one repo, and judges get a public URL.

## FE changes needed (hand to the FE teammate)

**Done 2026-09-26** in `FE/src/api.ts`, `engine/snapshot.ts`, `components/ShareButton.tsx`, and `screens/SharedSummary.tsx`. `VITE_API_URL` is set in Railway. The list below is kept for reference.

1. The domain step calls `GET /api/dns/{domain}`. Keep the direct Cloudflare DoH call as a fallback.
2. Results screen: a "Share with a partner" button calls `POST /api/assessments` and shows the returned link with a copy button.
3. On startup, `?share=<token>` loads `GET /api/share/{token}` and renders a read-only Summary (no edit, no start over), with a "DNS verified by Chain of Custody on <date>" badge.
4. Set `VITE_API_URL` in the Railway FE service **before** the next build.

## Out of scope (roadmap slide)

Accounts/login, editing a shared assessment, revoking links, server-side re-scoring to verify the snapshot, rate limiting, and a partner dashboard showing many carriers.
