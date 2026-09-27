# Chain of Custody

A 10-minute cyber risk check-up for small agri-food and logistics businesses: farms, food processors, cold storage warehouses, trucking carriers, and freight brokers.

Answer a short plain-language questionnaire and get:

1. Your top cyber risks, in plain language
2. A ranked "do these first" list, weighted by cost and effort, with step-by-step instructions
3. A "show the math" panel that traces every number back to your answers
4. A risk flow diagram showing how your gaps could reach your supply chain partners
5. A one-page, printable Supplier Security Summary for large customers

Scoring runs in the browser; the content it scores against (questions, fixes, standards) is loaded from the backend when the app starts. State lives in Zustand stores (`src/store/`). Everything from the backend goes through TanStack Query (`src/api/`: `client.ts` for the HTTP call, `endpoints.ts` for each route, `queries.ts` and `hooks.ts` for caching, retries, and Sentry reporting). The company name, domain, profile, answers, and DNS results stay in memory and are cleared on refresh or tab close. Only display preferences (detail level, report template, ranking mode) are saved to `localStorage`. Supabase sign-in tokens are also held in memory, so a refresh signs you out.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine unit tests, including the demo persona assertions
npm run build    # type-check and production build into dist/
```

Shortcuts for presenting:

- `http://localhost:5173/?demo` opens the demo company's results directly
- `http://localhost:5173/?demo=summary` opens its Supplier Security Summary

## Project layout

The questions, fixes, standards and other content live in the database. The backend seeds its tables from `BE/app/catalog/*.json` on startup (only when the files have changed), and the app loads them from `GET /api/catalog` before it renders. That means the app needs the backend running (`VITE_API_URL`); if it cannot reach it, it shows a "try again" screen. Tests and `gen_demo.ts` read the same JSON files directly, so there is one copy.

```
BE/app/catalog/         All tunable content. Edit these, not the code or the database rows.
    scenarios.json      8 threat scenarios, base likelihood per sector, and a plain-language consequence chain per sector
    profile.json        Business profile questions
    questions.json      31 underlying security questions: weights, help text, technical label, CCCS + CIS mappings, showIf
    prompts.json        The questionnaire people see: 11 cards that fill in those 31 questions
    impactRules.json    How the profile raises or lowers impact
    actions.json        23 fixes: steps (with Microsoft 365 / Google variants), cost, time, effort
    ranking.json        The two prioritization modes, cost points, and the essential-fix rule
    supplyChain.json    Right-hand column of the risk flow diagram
    cccs.json           CCCS Baseline Controls v1.2: 13 controls and their 42 sub-requirements
    cis.json            The 32 CIS Controls v8.1 safeguards the questions map to, with Implementation Group
    …                   plus ciosc.json, frameworks.json, templates.json, rules.json
src/
  data/demoPersona.json Peel Valley Fresh Logistics, including stored DNS results (bundled with the app)
  engine/               Pure TypeScript scoring, no React. Fully unit tested.
    scoring.ts          Likelihood, impact, risk, bands, posture
    actions.ts          Action simulation, prioritization, 30/60/90 plan
    controls.ts         Baseline control status for the summary
    flow.ts             Nodes and links for the risk flow diagram
    dns.ts              Cloudflare DNS-over-HTTPS email domain check
  screens/              Landing, profile, domain check, questionnaire, results, summary
  components/           Shared UI, action cards, show-the-math panel, risk flow SVG
```

## How the scoring works

For each scenario:

- **Likelihood** = base likelihood for the sector × the product of `(1 − weight × answer)` over every answered question. Yes = 1, Partly = 0.5, No and Not sure = 0. The minimum is 0.05.
- **"Does not apply"** (an explicit answer, or a question hidden by the business profile) also counts as 1 for likelihood: if a route into the business does not exist, there is no exposure through it. It never counts toward a control status, a fix, or "worth checking", and it never earns the incident-plan or insurance impact discount. The exception is a question hidden by **sector** (carrier vetting, Q31, is for brokers only): other sectors lack that safeguard rather than the exposure, so it is left out of their score entirely.
- **Email authentication (Q11)** is filled in from the domain check: Yes needs a DMARC policy of quarantine or reject **and** an SPF record. Enforced DMARC without SPF, or DMARC in watch mode (`p=none`), is Partly; no DMARC is No.
- **Impact** starts at 2, and `impactRules.json` modifiers are added based on the profile. The result is kept between 1 and 5. After that, Q24 (incident plan) takes off 15% and Q25 (insurance) takes off 10% from ransomware and payment fraud.
- **Risk** = likelihood × impact. Bands: 3.0+ High, 2.0 to 2.99 Elevated, 1.0 to 1.99 Moderate, under 1.0 Low.
- **Overall posture** is the band of the single highest scenario risk. See "Changes from the original spec" below.

**Action priority**: set the action's questions to Yes, recompute every risk, and take the risk reduction = total risk before − total risk after. Actions are only listed if they would change at least one visible question that is not already Yes. The results page has a **Prioritize by** switch with two modes, both configured in `ranking.json`:

| Mode | Priority | Notes |
| --- | --- | --- |
| **Effort only** (default, the original spec formula) | risk reduction ÷ effort | Cost is shown but not counted. |
| **Effort + cost** | risk reduction ÷ (effort + cost weight × cost points) | Free = 0, Free to $ = 0.5, $ = 1, $ to $$ = 1.5, $$ = 2, $$$ = 3; cost weight = 1. |

**Essential fixes** are those that resolve a CIS IG1 safeguard in Data Recovery (Control 11) or Incident Response (Control 17): today, backups (A11) and the "if we're compromised" plan (A17). They are worked out from the standards mapping, not hand-picked. In Effort + cost mode they skip the cost term and are scheduled no later than 60 days, so recovery fixes are not pushed down for costing money. Both modes are shown side by side in Show the math. The chosen mode is saved and also orders the Supplier Security Summary commitments.

Top 5 → "Do these first". The rest go into the 30 / 60 / 90 day plan by effort (1–2, 3, 4–5), in priority order within each column.

## The questionnaire

People answer **11 cards** (`prompts.json`), not 31 separate questions. Each card fills in the underlying questions (`questions.json`) that the scoring and the CCCS/CIS mappings use, so none of that changes.

- **Grouped rows.** Related questions share a card, e.g. "Accounts and passwords" has 4 short rows. Each row has answers written for that question ("The same day / Within a few days / It can take longer or get missed") instead of Yes / Partly / No, and each option maps to yes, partial, or no.
- **Ladders for nested questions.** Backups are one choice that sets both Q14 (regular backups) and Q15 (offline, tested copy). You cannot have a tested offline copy without backing up, so one answer is clearer and still exact. Unrelated pairs, like the call-back rule and dual payment approval, stay as separate rows so no combination is lost.
- **"Does not apply" where a route can genuinely be absent:** no online business tools (Q2), nobody connects from outside (Q17), no guest Wi-Fi (Q21), no laptops (Q28), no USB drives (Q29). Questions hidden by the profile (Q7 without weekly payments; Q18 and Q19 without connected equipment; Q16 when nobody uses a phone for work; Q31 unless you are a broker) are never asked.
- **Profile wording**, e.g. the phone row asks about people's own phones when the profile says staff use them for work (`labelWhen` in `prompts.json`).
- **"Not sure"** is a smaller link under every row and ladder. It still scores as No and appears in "Things worth checking".
- **Sector wording**, e.g. the portals row mentions load boards for carriers and brokers, and co-op or grain marketing accounts for farms.

`prompts.test.ts` checks that every question is asked exactly once, in the right section, with valid answers; that "does not apply" is only offered on those five questions and never on impact reducers; that the backup ladder runs from least to most protected; and that every demo company answer is still selectable.

## Tuning weights (JSON only)

You can tune the model without touching code. After any change, run `npm test`: the persona tests will tell you if the demo story still holds, and the test output prints a table of every scenario's risk and every action's priority.

| To change… | Edit | Field |
| --- | --- | --- |
| How common a threat is for a sector | `scenarios.json` | `base.<sector>` (0 to 1) |
| How much a control protects against a threat | `questions.json` | `weights.<SCENARIO>` (0 to 1, higher = more protection) |
| When a question is shown | `questions.json` | `showIf: { "profile": "<id>", "in": [...] }` |
| Question wording, answer labels, grouping | `prompts.json` | `rows[].label`, `rows[].options`, `rows[].na`, ladder `options[].sets` |
| How much the profile raises impact | `impactRules.json` | `rules[].modifiers` |
| Impact-only reducers (plan, insurance) | `questions.json` | `impactReduction.<SCENARIO>` (fraction, e.g. 0.15) |
| Fix cost, time, effort, steps | `actions.json` | `cost`, `time`, `effort` (1 to 5), `steps`, `stepsByProvider.m365 / google` |
| How much cost matters, default ranking mode | `ranking.json` | `costWeight` (0 = ignore cost), `costPoints`, `defaultMode` |
| Which fixes count as essential | `ranking.json` | `essential.cisControls`, `maxImplementationGroup`, `latestTimeframe` |
| Which standards a question counts toward | `questions.json` | `cccs`, `cis`, `mappingNote` (see "Standards mapping") |
| Supply chain impacts in the diagram | `supplyChain.json` | `impacts`, `links.<SCENARIO>.<IMPACT>` |

Tip: because protections multiply, a scenario with many related questions (ransomware has 12) drops quickly when a business has several partial answers. If a scenario feels too low across the board, raise its base likelihood rather than every weight.

## Standards mapping (CCCS and CIS)

Every question maps to the specific requirements it gives evidence for, in two frameworks:

- **CCCS**: [Baseline Cyber Security Controls for Small and Medium Organizations, V1.2](https://www.cyber.gc.ca/en/guidance/baseline-cyber-security-controls-small-and-medium-organizations) (Feb 2020, still the current version). Mapped to sub-requirements such as `BC.5.1`, not only the 13 control names.
- **CIS**: CIS Controls v8.1 safeguards, with titles and Implementation Groups taken from the CIS [Controls Assessment Specification](https://cas.docs.cisecurity.org/en/latest/).

Each mapping is either **direct** (the question tests the requirement) or **partial** (it covers part of it, or supports it indirectly). Every partial or missing mapping carries a `mappingNote` explaining why, and a test enforces this.

```json
"cccs": [{ "control": "BC.9", "reqs": ["BC.9.3"], "strength": "direct" }, { "control": "BC.5", "reqs": ["BC.5.1"], "strength": "partial" }],
"cis":  [{ "safeguard": "6.4", "strength": "direct" }, { "safeguard": "12.7", "strength": "partial" }]
```

| Q | Topic | CCCS | CIS v8.1 |
| --- | --- | --- | --- |
| Q1 | Phone code on email | BC.5.1 | 6.3 |
| Q2 | Phone code on business portals | BC.5.1 | 6.3 |
| Q3 | Own login for everyone | BC.12.1, BC.12.3 (partial) | 5.1 (partial) |
| Q4 | Same-day access removal | BC.12.3 | 6.2 |
| Q5 | Password manager | BC.5.3 | 5.2 (partial) |
| Q6 | Limited admin rights | BC.12.1 | 5.4 (partial) |
| Q7 | Call-back rule for bank changes | none | none |
| Q8 | Second approval on large payments | none | none |
| Q9 | Fake email training | BC.6.1 | 14.1, 14.2 |
| Q10 | External email warning | BC.9.8 (partial) | none |
| Q11 | DMARC spoofing protection | BC.9.7 | 9.5 |
| Q12 | Automatic updates | BC.2.1 | 7.3, 7.4 (partial) |
| Q13 | Antivirus on every computer | BC.3.1 | 10.1, 10.2 (partial) |
| Q14 | Regular backups | BC.7.1 (partial) | 11.2 (partial) |
| Q15 | Offline, tested backup | BC.7.1; BC.7.2 (partial) | 11.4, 11.5 |
| Q16 | PIN and remote wipe on phones | BC.8.4, BC.8.5 (partial) | 4.3 (partial), 4.11 |
| Q17 | Secure remote access | BC.9.3; BC.5.1 (partial) | 6.4, 12.7 (partial) |
| Q18 | Vendor remote access off when idle | BC.4.1 (partial); BC.10.2 (partial) | 4.8 (partial) |
| Q19 | Equipment on separate network | BC.9 (no specific requirement) (partial) | 12.2 (partial) |
| Q20 | Default passwords changed | BC.4.1 | 4.7 |
| Q21 | Separate guest Wi-Fi | BC.9.5 | 12.2 (partial) |
| Q22 | List of vendor access | BC.10.2 (partial) | 15.1 |
| Q23 | Vendor breach notice in contracts | BC.10.2 (partial) | 15.4 |
| Q24 | Written incident plan | BC.1.1, BC.1.2 | 17.2, 17.1 (partial), 17.4 (partial) |
| Q25 | Cyber insurance | BC.1.3 | none |

How it is used:

- **CCCS status** per control uses every visible, answered question that maps to it. All Yes = Met, all No or Not sure = Not yet met, anything else = Partially met. The summary also shows **which requirements were checked** (for example BC.9: 4 of 8). A "Met" only covers those requirements.
- **CIS status** per safeguard uses the same rule. The summary reports the totals and the IG1 count.
- **Related CIS** for a CCCS control comes from questions whose *primary* CCCS control it is. This stops a secondary link, such as Q17's partial link to BC.5, from attaching unrelated safeguards like CIS 12.7 (VPN).
- **Q7 and Q8** (call-back rule, dual payment approval) are payment procedures that neither framework covers. They appear as a separate "Payment fraud safeguards" section on the summary instead of being forced into a control.
- **BC.11** (secure websites) and **BC.13** (portable media) have no questions, so they show "Not assessed".
- The results page has a **"How this maps to CCCS and CIS"** panel that traces every status to its answers. Action cards, questions ("Why we ask"), and summary commitments show the requirement and safeguard IDs.

## Email domain check

`src/engine/dns.ts` queries `https://cloudflare-dns.com/dns-query` in parallel for:

- **MX**: `outlook.com` means Microsoft 365, and `google.com` or `googlemail.com` means Google Workspace
- **TXT on the root**: looks for `v=spf1`
- **TXT on `_dmarc.<domain>`**: `p=reject` or `p=quarantine` means Q11 = Yes, `p=none` means Partly, and a missing record means No

It pre-fills Q11 and the email provider. The user can override both. Network failures show "Couldn't check, you can answer manually." The demo company's domain uses stored results, so the demo never depends on the network.

## Changes from the original spec

1. **Overall posture = highest single risk, not the average of the top 3.** With the spec's base likelihoods and impact caps, the most a carrier could reach was BEC 3.2, ransomware 3.0, and stolen logins 2.8. So the top-3 average could only reach "High" (3.0) if **every** answer was No. Using the single highest risk ("you are only as safe as your biggest exposure") keeps the weights unchanged and gives an intuitive headline.
2. **Demo persona answers were adjusted** so the expected results hold without changing any weights:

   | Question | Spec | Now | Story |
   | --- | --- | --- | --- |
   | Q2 phone code on portals | Partly | No | |
   | Q6 admin rights limited | Partly | No | |
   | Q8 second approval on payments | Partly | No | |
   | Q10 external email warning | Yes | No | |
   | Q12 automatic updates | Partly | No | |
   | Q13 antivirus everywhere | Yes | Partly | Defender is off on two dispatch laptops |
   | Q14 regular backups | Yes | Partly | Files go to a USB drive "when someone remembers" |
   | Q17 secure remote access | Partly | No | |

   Result (since the load-redirect risk and Q26 were added, 2026-09-26): **Load redirected to bad actors is #1 at 3.50 (High)**, payment fraud #2 at 3.20 (High), stolen logins #3 at 2.80, posture High. Actions: A1 (two-step login on email), **A19 (call back and a second OK on load changes)**, A7, A8, A4. A13 is #8. The top three risks kept the same scores when the device, sign-in alert, and profile questions (Q27–Q31) were added; the new sign-in alerts fix (A22) comes in at #7, just ahead of A13.
3. The summary footer says "Self-assessed using Chain of Custody". The spec text said "FieldGuard", which looked like an earlier product name.
4. Added a short `topic`, `gapLabel`, and scenario `phrase`/`short` fields to the JSON to drive the UI copy.
5. **CCCS mapping corrected against the source text.** The spec mapped Q7 to awareness training and Q8 to access control. Neither fits: they are payment procedures and are now reported separately. The spec also mapped Q19 (equipment segmentation) to "Securely configure devices"; it is now a partial fit under Perimeter defences (BC.9). Q17 and Q18 gained secondary mappings (BC.5.1 and BC.4.1).
6. **"Hidden" questions now count as no exposure.** The spec said questions hidden by `showIf` are ignored, but an ignored question scores the same as answering "No". A business with no connected equipment was being scored as if its equipment were unprotected. Hidden questions and explicit "does not apply" answers now count as no exposure for likelihood. The demo company has no hidden questions, so its results are unchanged. Low-tech businesses score lower. Example: a small farm that answers No to everything, with no remote access, no guest Wi-Fi, and no connected equipment, goes from ransomware 1.50 (Moderate) to 0.65 (Low).

## 3-minute demo script

**0:00 – Landing (15s).** "Small farms, processors, and carriers are the weak links attackers use to get into big grocery and food supply chains. But they don't have a security team. Chain of Custody gives them one in 10 minutes." Click **Load demo company**.

**0:15 – Posture card (20s).** "This is Peel Valley Fresh Logistics, a 45-person reefer carrier in Brampton hauling produce for two major grocers. Overall risk: **High**. And the headline tells the owner in one sentence what matters: *their biggest exposure is fake payment requests, and the first fix takes under an hour.*"

**0:35 – Top risks (35s).** "Payment fraud is #1. Carriers move money every week and nobody calls back to confirm bank changes. Stolen logins are #2, because dispatchers share one load board password. Ransomware is #3, and with perishable loads and losses starting in under 4 hours, the impact is maxed out. Each card shows the *reasons*, taken straight from their answers." Click the payment fraud card to open its **full story**: "The call-back rule alone would cut the chance from 80% to 32%. Impact is 4 out of 5 because they move money every week. And if it happens, it hits their partners too: fraudulent invoices in their name." Under **What fixes it**, point at the call-back rule taking payment fraud from High to Low.

**1:00 – Do these first (40s).** "Here's what makes this different: the fixes are ranked by risk removed per unit of effort. #1: turn on two-step login for email. It's free, under an hour, and cuts their total risk by 23%." Click **Show step-by-step**. "Steps are tailored: they're on Microsoft 365, so these are the exact Entra clicks." Click **See the effect**. "Payment fraud drops from High to Moderate. Overall they go from High to Elevated with one hour of work." Point at #4: "And turn off the refrigeration vendor's always-on TeamViewer. Free, under an hour."

**1:40 – Risk flow (30s).** Scroll to the diagram and hover **Always-on vendor remote access**. "This is why their customers should care. That one gap feeds equipment tampering and vendor breach, which flows straight into *spoiled shipments* and *attackers reaching partners through shared systems*." Hover **Fraudulent invoices sent to partners in your name**. "Everything that leads here is a risk to the grocer, not just to Peel Valley."

**2:10 – Show the math (20s).** Open **Show the math** and expand Payment fraud. "No black box. Base likelihood 0.80 for a carrier, every question's effect, impact +2 because they send weekly transfers, 0.80 × 4 = 3.20, High. A teammate can retune any weight by editing JSON."

**2:30 – Supplier Security Summary (25s).** Click **Supplier Security Summary**. "Finally, something they can hand to their grocery customers: the 13 Canadian Centre for Cyber Security baseline controls with which requirements were checked, the matching CIS v8.1 safeguards, their payment fraud safeguards, and dated commitments to fix the top five in 30 days. One page, print or PDF." Click **Print / Save as PDF**.

**2:55 – Close.** "Ten minutes, no jargon, no consultant: a fix-first plan for the supplier *and* proof of progress for the customer."
