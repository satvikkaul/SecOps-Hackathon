# Plan: FE + BE

## Split of responsibilities

| | FE (`FE/`, owned by the FE teammate) | BE (`BE/`, owned by us) |
| --- | --- | --- |
| Runs | Static Vite build on Railway | FastAPI on Railway, Postgres on Supabase, Gemini via the Interactions API |
| Owns | Questionnaire, **all scoring** (TS engine), results UI, share view UI | Persistence, share tokens, server-side DNS check, demo seed data, Gemini wording |
| Stores | Draft answers in `localStorage` | Finished assessments, DNS results, and cached Gemini wording in Supabase Postgres |

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

**`ai_texts`**: cached, validated Gemini wording.

| Column | Type | Notes |
| --- | --- | --- |
| `key` | text PK | sha256 of the request + prompt version + model |
| `model` | text | e.g. `gemini-3.5-flash-lite` |
| `result` | jsonb | Validated rewording (profile, risks, actions) |
| `created_at` | timestamptz | |

## Gemini personalization (built)

**Gemini rewords the results for one business. It does not choose, rank, or score.** The engine's formula (Risk ÷ Effort, with "show the math") is the pitch. An LLM that ranked things couldn't show its math and would give different answers on reruns.

`POST /api/personalize` (see `BE/app/personalize.py`):
1. The FE builds the request (`FE/src/personalize.ts`): level (basic/medium/expert), profile labels, gaps, strengths, top 3 risks (with chain and reasons), and top 5 fixes (with the vetted, provider-specific steps and the user's open gaps for each). No company name or domain.
2. Gemini (Interactions API, `gemini-3.5-flash-lite`, JSON-schema output) returns: `profile`, `risks[{id, why}]`, `actions[{id, title, whatToDo, why, steps}]`.
3. `validate()`: ids and order identical to the request, 3–6 steps, length caps, no links, and no numbers that weren't in the request. Failure → 503 → the FE keeps the engine's text.
4. Cached in `ai_texts` (sha256 of request + prompt version + model), with RLS on. Uncached calls are rate-limited.

Env on the BE service: `GEMINI_API_KEY` (required), `GEMINI_MODEL` (optional).

Judge answer: *"The ranking is deterministic and you can check it. Gemini only rewords it for this business, and the server rejects anything that changes the order or invents a number."*

Not built (roadmap): dollar impact (needs load value and downtime cost questions, calculated by the engine and only worded by Gemini), free-text "anything else?" that Gemini maps to our questions for the user to confirm, and links to official vendor docs for each step.

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
