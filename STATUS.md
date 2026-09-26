# Status

_Last updated: 2026-09-26 (Sat). Overwrite this file at the end of every session._

**Deadline: Sun 2026-09-27, 9:00 AM** (deck, 2-min video, and live URL, all checked in incognito).

## Live

- FE: https://secops-hackathon-production.up.railway.app (static Vite build, auto-deploys from `main`). `?demo` works.
- BE: https://imaginative-tenderness-production-be96.up.railway.app. The Railway service and domain exist (port 8080), but the code isn't deployed until `BE/` is pushed to `main`.
- DB: Supabase chosen. The schema is in `BE/schema.sql` and applies itself on BE startup. The Railway Postgres is unused.

## BE (`BE/`)

| Endpoint | State |
| --- | --- |
| `GET /api/health` | Done, tested |
| `GET /api/dns/{domain}` | Done: dnspython lookup, 24 h Postgres cache, stale fallback, pinned demo row |
| `POST /api/assessments` | Done: Pydantic validation, 64 KB cap, server-side DNS attached, 128-bit share token |
| `GET /api/share/{token}` | Done: read-only, raw answers never returned |
| Demo seed (`demo-peel-valley`) | Done: generated from the FE engine, top 5 = A1, A7, A4, A13, A8, posture High 3.20 |
| Gemini action plan | Designed (PLAN.md → Phase 2), not built |

Tests: `BE/test_api.py`, 2 passing against local Postgres 17. RLS is confirmed on for both tables.

## Priorities

| # | Item | State |
| --- | --- | --- |
| 1 | Questionnaire → score → ranked plan on the live URL | Done (FE, client-side) |
| 1a | "One person can change a destination alone" question + action | Missing (FE teammate) |
| 2 | Two demo profiles with visibly different rankings | One profile only |
| 3 | Shareable read-only link | BE done locally. Needs BE deploy + FE UI |
| 4 | Partner diagram | Exists in FE (`RiskFlow`) |
| 5 | Gemini-worded plan | Designed |

## Ownership

- FE (`FE/`): teammate
- BE (`BE/`): us

## Open decisions

- Name and profile of the second demo company (needed by both the FE persona and the BE seed).
- The pitch says "12 questions / 5 min" and the app says "10 cards / 10 min". Pick one.

## Known risks

- Every push to `main` deploys the FE. Check the build before you push.
- `VITE_API_URL` must be set before the FE build, or share links will call the wrong host.
- The Supabase direct connection is IPv6-only, so use the **session pooler** URI on Railway.
