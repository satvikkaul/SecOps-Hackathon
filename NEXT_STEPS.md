# Next steps

_Ordered. Rewrite at the end of every session: remove done items and re-rank the rest._

## BE (us)

1. **Deploy the BE** (the service and domain exist: https://imaginative-tenderness-production-be96.up.railway.app, port 8080; push `BE/` to `main`, then verify). Create a new Railway service from this repo with root dir `BE` and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (if the deploy log says `uvicorn` isn't found, prefix it with `.venv/bin/`). Set `DATABASE_URL` to the Supabase session pooler URI and `FRONTEND_URL` to the FE URL. Generate a public domain. Confirm `/api/health` → `db: true` and `/api/share/demo-peel-valley` in incognito.
2. Tell the FE teammate the BE URL, so they can set `VITE_API_URL` **before** their next build.
3. **Seed the second demo company** as soon as its profile exists: add it to `FE/src/data`, write a `gen_demo.ts` variant, and add an entry to `DEMOS` in `app/main.py`.
4. **Gemini phase 2** (PLAN.md): `POST /api/assessments/{id}/plan`, the `action_plans` table, id/order validation, fallback to engine text. Only start this once 1–3 are live.
5. Delete the unused Railway Postgres service.

## FE (teammate), from [PLAN.md](PLAN.md#fe-changes-needed-hand-to-the-fe-teammate)

1. Destination-change question + action (the core of the attack path).
2. A second demo persona.
3. Share button, the `?share=` read-only view, and switching the DNS call to the BE.
4. Set `VITE_API_URL` in Railway before building.

## Before Saturday 6 PM

- Incognito test of the live URL on phone data, not the venue wifi.
- Demo share links open on the live instance.
- Anything unfinished goes on the roadmap slide.
