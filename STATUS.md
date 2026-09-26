# Status

_Last updated: 2026-09-26 (Sat). Overwrite this file at the end of every session._

**Deadline: Sun 2026-09-27, 9:00 AM** (deck, 2-min video, and live URL, all checked in incognito).

## Live

- FE: **live** at https://secops-hackathon-production.up.railway.app, deploying from `main`, with `VITE_API_URL` set. Verified end to end in a fresh headless Chrome profile: `?demo` → Share with a partner → the link opens the read-only summary, which shows the verified DNS section. The risk register button is present.
- BE: **live** at https://imaginative-tenderness-production-be96.up.railway.app (port 8080). Redeployed from `dbffc0c` (demo reseeded with `sector`). All endpoints were verified on the live URL on 2026-09-26: health `db:true`, demo share, live DNS, CORS (FE allowed, other origins rejected), create/share, 422 on bad input, 404 on an unknown token.
- DB: **Supabase live** (session pooler, us-east-1). Schema applied, RLS confirmed on both tables, and `demo-peel-valley` seeded. The Railway Postgres is unused and can be deleted.

## BE (`BE/`)

| Endpoint | State |
| --- | --- |
| `GET /api/health` | Done, tested |
| `GET /api/dns/{domain}` | Done: dnspython lookup, 24 h Postgres cache, stale fallback, pinned demo row |
| `POST /api/assessments` | Done: Pydantic validation, 64 KB cap, server-side DNS attached, 128-bit share token |
| `GET /api/share/{token}` | Done: read-only, raw answers never returned |
| Demo seed (`demo-peel-valley`) | Done: generated from the FE engine (`buildSnapshot`, shared with the Share button), top 5 = A1, A7, A4, A13, A8, posture High 3.20 |
| Gemini action plan | Designed (PLAN.md → Phase 2), not built |

Tests: `BE/test_api.py` 2 passing (local Postgres 17). FE 112 passing (includes `snapshot.test.ts`). RLS is confirmed on for both tables in Supabase.

## Priorities

| # | Item | State |
| --- | --- | --- |
| 1 | Questionnaire → score → ranked plan on the live URL | Done (FE, client-side) |
| 1a | "One person can change a destination alone" question + action | **Done**: Q26, A19, and the new risk "Load redirected to thieves" (CARGO). Now the demo's #1 risk |
| 2 | Two demo profiles with visibly different rankings | One profile only |
| 3 | Shareable read-only link | **Done and live**, verified end to end |
| 4 | Partner diagram | Exists in FE (`RiskFlow`) |
| 5 | Gemini-personalized results | **Built** (`POST /api/personalize`): profile card, per-risk "why it matters to you", fixes and steps reworded per level. Engine still ranks. **Live**, and the demo is cached for all 3 levels (about 5 s on the first call, instant after) |
| 6 | Expertise level (Simple default / Standard / Expert) | **Done**: asked on "Before you start", switchable on Results. Changes wording and detail only, never scores |
| 7 | Consequence chains per risk (carrier/broker/cold storage versions) | **Done**: shown on the Overview, risk cards, risk detail, and each fix |
| 8 | Results in tabs (Overview · Fix first · Your risks · Supply chain · How we scored) | **Done** |

## Branches

- `main`: the integration branch and what should deploy. It contains everything: BE, FE↔BE wiring, nima's risk register (`c421af6` → `0b03c0b`), and Hala's provider steps (`ff90c8f` → `3a0c4bf`). FE tests: 125 passing.
- `nima` and `Hala's` are behind `main`. The teammates should branch off the latest `main` or rebase onto it before continuing.
- `nima`'s commit had `FE/node_modules` (4,132 files) and `tsbuildinfo` committed. Both were left out when it was brought to `main`. The root `.gitignore` already ignores them.

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
