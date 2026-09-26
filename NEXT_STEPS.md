# Next steps

_Ordered. Rewrite at the end of every session: remove done items and re-rank the rest._

## BE (us)

1. **Confirm the FE deploy of `dbffc0c` went live.** The live bundle should contain "Share with a partner". If it doesn't, check the Railway FE deploy logs and redeploy. Then test in incognito: `?demo` → Share with a partner → open the link in another browser.
2. **Seed the second demo company** as soon as its profile exists: add it to `FE/src/data`, write a `gen_demo.ts` variant, and add an entry to `DEMOS` in `app/main.py`.
3. **Gemini phase 2** (PLAN.md): `POST /api/assessments/{id}/plan`, the `action_plans` table, id/order validation, fallback to engine text. Only start this once the share link works end to end.
4. Delete the unused Railway Postgres service.

## FE (teammate)

1. Destination-change question + action (the core of the attack path).
2. A second demo persona.
3. Pull before editing: `api.ts`, `engine/snapshot.ts`, `ShareButton`, `SharedSummary`, and small edits to `App.tsx`, `Results.tsx`, and `DomainCheck.tsx` landed on 2026-09-26.

## Before Saturday 6 PM

- Incognito test of the live URL on phone data, not the venue wifi.
- Demo share links open on the live instance.
- Anything unfinished goes on the roadmap slide.
