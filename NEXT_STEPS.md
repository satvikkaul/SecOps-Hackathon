# Next steps

_Ordered. Rewrite at the end of every session: remove done items and re-rank the rest._

## BE (us)

1. **Seed the second demo company** as soon as its profile exists: add it to `FE/src/data`, write a `gen_demo.ts` variant, and add an entry to `DEMOS` in `app/main.py`.
2. After deploying Gemini: open `?demo` at Simple, Standard, and Expert once on the live site, so the demo's wording is cached in Supabase and loads instantly for judges.
3. Delete the unused Railway Postgres service.
4. Decide on Hala's `FE/src/lib/supabaseClient.ts` (nothing imports it yet). A browser Supabase client would get nothing back because RLS denies all access, and it would bypass BE validation and the server-verified DNS check. Recommendation: do all DB access through the BE API and delete the client plus the `@supabase/supabase-js` dependency. Importing it without its env vars throws at load and would crash the app.

## FE (teammate)

1. A second demo persona (on hold at the user's request).
2. Start new work from the latest `main` (`git pull origin main`), not from the old `nima`/`Hala's` branches. Don't commit `node_modules`. Pull before editing: `api.ts`, `engine/snapshot.ts`, `ShareButton`, `SharedSummary`, and small edits to `App.tsx`, `Results.tsx`, and `DomainCheck.tsx` landed on 2026-09-26.

## Before Saturday 6 PM

- Incognito test of the live URL on phone data, not the venue wifi.
- Demo share links open on the live instance.
- Anything unfinished goes on the roadmap slide.
