# Chain of Custody API

The backend for the Chain of Custody check-up. It serves the check-up's content (questions, fixes, risks, and standards), verifies email domains from public DNS, stores share links for partners, and runs the two AI features: result rewording and the chat assistant.

Scoring does **not** happen here. The browser scores the answers so it can show the math; this service only stores and serves.

Stack: FastAPI, psycopg 3 with a connection pool, plain SQL (no ORM), Supabase Postgres, and `dnspython`. Deployed on Railway.

## Run it

Needs Python 3.12+ and a Postgres database.

### macOS / Linux

```bash
uv sync
DATABASE_URL=postgresql://... uv run uvicorn app.main:app --reload --port 8000
```

### Windows (PowerShell)

With [uv](https://docs.astral.sh/uv/getting-started/installation/) (`winget install astral-sh.uv`):

```powershell
cd BE
uv sync
$env:DATABASE_URL = "postgresql://..."
uv run uvicorn app.main:app --reload --port 8000
```

Without uv, using a plain virtual environment:

```powershell
cd BE
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e . pytest
$env:DATABASE_URL = "postgresql://..."
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Then, in a second terminal, the frontend:

```powershell
cd FE
npm ci
$env:VITE_API_URL = "http://127.0.0.1:8000"
npm run dev
```

Windows notes:

- `$env:NAME = "..."` only lasts for that terminal window. Set it again in every new terminal, or add the variable under System Properties → Environment Variables to make it permanent.
- If PowerShell refuses to run `Activate.ps1`, you don't need it: call `.\.venv\Scripts\python.exe` directly as above.
- In PowerShell `curl` is an alias for `Invoke-WebRequest`. Use `curl.exe http://127.0.0.1:8000/api/health` to check the server.
- Tests: `.\.venv\Scripts\python.exe -m pytest` (or `uv run pytest`) with `$env:DATABASE_URL` set. A bare `python -m pytest` uses your global Python, not the project's environment.

On startup the service applies `schema.sql` and `catalog.sql`, loads the catalog from `app/catalog/*.json` (only if the files changed), and seeds the demo company. Everything is idempotent, so restarting is always safe.

Point the frontend at it with `VITE_API_URL=http://127.0.0.1:8000` in `FE/`. Any `http://localhost:<port>` origin is allowed by CORS.

## Environment

| Variable | Required | Default | Used for |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | none | Postgres. On Supabase: Connect → Session pooler URI. |
| `FRONTEND_URL` | No | the production frontend | Share-link URLs, and the only non-localhost CORS origin |
| `GEMINI_API_KEY` | For AI | none | Result rewording and chat |
| `GEMINI_MODEL` | No | `gemini-3.5-flash-lite` (rewording), `gemini-3.8-flash` (chat) | Overrides the model for both |
| `ANTHROPIC_API_KEY` | No | none | Chat fallback when Gemini is missing or fails |
| `ANTHROPIC_MODEL` | No | `claude-haiku-4-5-20251001` | Chat fallback model |

Without an AI key everything else still works: rewording answers 503 and the frontend keeps the engine's own wording, and the chat replies that it isn't set up.

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | `{ok, db}`; 503 if the database is unreachable. Railway's health check. |
| GET | `/api/catalog` | All check-up content in one response. Sends an `ETag`; a matching `If-None-Match` gets a 304. |
| GET | `/api/catalog/questions/{id}` | One question, e.g. `Q26`. 404 if unknown. |
| GET | `/api/catalog/actions/{id}` | One fix, e.g. `A19`. 404 if unknown. |
| GET | `/api/dns/{domain}` | SPF, DMARC, and mail-provider check. Cached for 24 hours; falls back to the last good result if a live lookup fails. |
| POST | `/api/assessments` | Saves a results snapshot and returns `{id, shareToken, shareUrl, expiresAt}`. A `password` (8–128 characters) protects a partner link; without one the row is locked. A valid `Authorization` header attaches the row to that account. Links expire after 90 days. The DNS result stored with it is always the server's own lookup. Limited to 10 per IP per minute and 500 per hour overall. |
| GET | `/api/assessments/mine` | The signed-in caller's saved check-ups: company, domain, date, and overall band. 401 without a valid token. |
| GET | `/api/assessments/mine/{id}` | One saved check-up, including answers, for its owner only. 401 signed out, 404 for anyone else. |
| GET | `/api/share/{token}` | The read-only summary behind a share link: 404 if unknown, 410 once expired, 401 if password-protected (with no company details). Only the demo link is open. Raw answers are never returned. Sent with `X-Robots-Tag: noindex`. |
| POST | `/api/share/{token}/unlock` | `{password}` in the body, so it never appears in a URL. Returns the summary, or 401 for a wrong password. Limited to 10 attempts per minute per IP and per link (429). |
| POST | `/api/personalize` | Gemini's rewording of the results. Cached; uncached calls are limited to 6 per IP per minute and 300 per hour overall. |
| POST | `/api/chat` | One chat turn. `sessionId` ties turns together in memory. |

POST bodies must send `Content-Length` and stay under 64 KB. Inputs are validated with Pydantic, so a malformed body gets a 422.

## The catalog

The content the check-up shows and scores with lives in `app/catalog/*.json` (13 files). **Edit those files, not the database rows.**

- On startup the files are hashed. If the hash differs from the one stored in the database, every catalog table is refilled from the files in one transaction.
- Afterwards the tables are read back and compared with the files. Any difference (for example, a new field the tables don't model yet) rolls the whole transaction back, and startup fails loudly instead of dropping data.
- Each process keeps the loaded catalog in memory and only reloads it when the stored version changes.

The tables are typed, one per kind of item (`catalog.sql`), and live in their own `catalog` schema, so Supabase's public REST API can't see them. RLS is on for every table with no policies; the backend connects as the owner, which bypasses RLS.

To add a field to the content, add a column or table in `catalog.sql`, then write it in `_insert` and read it in `load` in `app/catalog.py`. `test_catalog.py` fails until both sides agree.

## AI features

**Rewording** (`app/personalize.py`). Gemini rewrites the engine's top risks and fixes for one business. It doesn't choose, rank, or score. The response is rejected if it changes the order, adds or drops items, includes links, or contains a number that wasn't in the request. A rejection is a 503, and the frontend keeps its own text. Accepted results are cached in `ai_texts` by a hash of the request, prompt version, and model.

**Chat** (`app/chat.py`). Gemini first, Claude as the fallback. Both can call two tools that read from the catalog: `lookup_action` (a fix's steps) and `explain_question`. History is kept in memory per `sessionId` and lost on restart, by design.

## Data

`schema.sql` (public schema, RLS on, no policies):

- `assessments`: shared snapshots, keyed by an unguessable `share_token` (128 random bits). `expires_at` null means the link never expires (demo rows only).
- `dns_checks`: cached DNS results. `pinned` rows (the demo company) are never refreshed.
- `ai_texts`: validated rewording, keyed by request hash.

`catalog.sql`: the content tables described above.

The demo company (`app/demo_peel_valley.json`, share token `demo-peel-valley`) is regenerated from the frontend engine. Its sample suppliers (`app/demo_suppliers.json`) are seeded on every startup so the Supply chain graph has something to show:

```bash
cd FE && npx vite-node ../BE/gen_demo.ts > ../BE/app/demo_peel_valley.json
```

## Tests

```bash
DATABASE_URL=postgresql://... uv run pytest
```

`test_api.py` and `test_catalog.py` need a real Postgres; use a throwaway database, because the catalog tests rewrite the catalog tables. `test_chat.py` needs no database. `conftest.py` shares one app and connection pool across the test files.

## Deploy (Railway)

- Service root directory `BE`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, health check `/api/health`.
- Deploy the backend **before** a frontend that depends on a new endpoint or catalog change. The frontend won't render without `/api/catalog`.
- One replica is assumed: the rate limits and chat history are in-process memory.
