# CLAUDE.md

Brampton SecOps Hackathon (TMU Rogers Cybersecure Catalyst), Sept 25–27 2026. Product: **Chain of Custody**, a cyber-risk triage tool for a small (~25 staff, no IT) Brampton refrigerated carrier. Short questionnaire + a DNS check → at most 5 ranked actions mapped to CCCS Baseline Controls.

## Session context files: read these first

- [STATUS.md](STATUS.md) is the current state. [NEXT_STEPS.md](NEXT_STEPS.md) is the ranked to-do list. [SESSION.md](SESSION.md) is the session log. [PLAN.md](PLAN.md) holds the FE/BE architecture and the API contract.
- **At the end of every session:** add a new entry at the top of SESSION.md, overwrite STATUS.md, and rewrite NEXT_STEPS.md. Update PLAN.md only if the contract changed, and tell the FE teammate when it does.
- Ownership: the FE teammate owns `FE/`, and we work in `BE/`. Don't edit `FE/` without asking.

## Hard deadline

**Submission Sunday Sept 27, 9:00 AM sharp.** Three public links: pitch deck, 2-min demo video, working URL. Verify all three in an incognito window before submitting. If the app has a login, the credentials go in the form. Anything not working by end of Saturday becomes a roadmap slide, not a feature.

Judged on: alignment to the problem statement, technical feasibility, pitch quality, and whether the submission is complete. Technical judges will ask us to justify the stack.

## Priority order (don't skip ahead)

1. Questionnaire → score → ranked plan, working end to end **on the live URL**
2. Two demo profiles that produce visibly different rankings (proves it's a decision engine, not a static list)
3. Shareable read-only score link (for a grocery DC or broker)
4. Partner diagram (`RiskFlow` exists already)

## The story the product must tell

Crown jewel: the **shipment ledger** (pickup codes, BOL, destinations, cargo value, driver/trailer IDs, banking details). It's scattered across TMS, email, load boards, spreadsheets, SMS, and paper.

Attack path: phished dispatcher email → attacker reads shipment history → spoofed broker asks for a destination change → **one dispatcher makes the change alone** → load redirected. Phishing is only the way in. The loss happens because nobody else has to approve the change.

Ranking: Risk = Likelihood × Impact; Priority = risk reduction ÷ effort. The pitch is that they'll do two things, not twenty.

## Repo layout

- `FE/`: the whole app today. Vite + React 18 + TS + Tailwind, **client-only** (no backend, state in `localStorage`). `FE/README.md` covers the scoring model, the JSON tuning table, the CCCS/CIS mapping, and a demo script. Read it before changing the scoring.
  - `src/data/*.json`: all tunable content (scenarios, 25 questions, 10 prompt cards, 18 actions, weights). Tune here, not in code.
  - `src/engine/`: pure TS scoring, fully unit tested. `persona.test.ts` pins the demo story, so run tests after any change to the JSON.
  - `src/engine/dns.ts`: SPF/DMARC/MX via Cloudflare DoH, called from the browser. The demo persona uses stored DNS results, so the demo works offline.
  - `?demo` goes straight to the demo results; `?demo=summary` goes to the Supplier Security Summary.

## FE commands (run in `FE/`)

```bash
npm ci
npm run dev     # http://localhost:5173
npm test        # vitest, 111 tests
npm run build   # tsc -b && vite build → dist/
```

## Known gaps between the brief and the code

- **Stack mismatch (resolved in PLAN.md).** The brief says "FastAPI because the scoring is Python". The scoring is TypeScript in the browser, and we are not porting it. The BE stores assessments, verifies DNS, and (phase 2) has Gemini word the plan. Use the judge justification in PLAN.md.
- **The destination-change control is missing.** No question covers "can one person change a destination alone". Q7 (call-back on bank changes) and Q8 (second approval on payments) cover payments only. This is the core of the attack path, so add it to `questions.json`/`prompts.json`/`actions.json`.
- **Only one demo persona** (Peel Valley Fresh Logistics, 45 staff, `demoPersona.json`). Priority 2 needs a second profile with a different top action.
- The brief says "12 questions in 5 minutes". The app asks 10 cards (25 underlying questions) and claims 10 minutes. Make the pitch and the app say the same thing.
- The top-5 cap is already implemented ("Do these first").

## Deployment

- FE: https://secops-hackathon-production.up.railway.app. Railway auto-deploys from `main` on GitHub, so **every push to `main` ships**.
- BE: https://imaginative-tenderness-production-be96.up.railway.app, a separate Railway service from the same repo (root dir `BE`, `PORT=8080`, domain target port 8080).
- DB: **Supabase Postgres**, reached through the session pooler `DATABASE_URL`. The Railway Postgres is unused and can be deleted.

## BE commands (run in `BE/`)

```bash
uv sync
docker run -d --rm --name coc-pg -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:17   # local DB
export DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres
uv run pytest -q                                   # needs DATABASE_URL
uv run uvicorn app.main:app --reload --port 8000
```

- `app/main.py` holds the routes, validation, DB pool, and seed. `app/dns_check.py` is the MX/SPF/DMARC lookup. `schema.sql` is applied on startup.
- `app/demo_*.json` are generated from the FE engine, not written by hand. Regenerate them with `BE/gen_demo.ts` (the command is at the top of that file) when the FE's weights or questions change.
- Every table has RLS on with no policies. Keep it that way for any new table (Supabase REST API exposure).

## Deploy checklist (do Saturday, not Sunday)

- Public URL loads in incognito **from a network other than the venue wifi**
- Any API base URL is set as a build-time env var **before** the build (Vite inlines `VITE_*` at build time)
- Demo data is seeded on the deployed instance, not just locally
- `?demo` works on the live URL

## Conventions

- Keep the scoring in `engine/` pure and tested. Keep content in JSON.
- Use business language in the UI, and put framework IDs (BC.x.y, CIS x.y) in tags only.
- Out of scope, but the tool can still recommend them: moving sensitive data out of email, a browser extension, endpoint virtualization (the virtualization analysis is for Q&A prep only).
