// Regenerate the seeded demo snapshot from the FE engine: cd FE && npx vite-node ../BE/gen_demo.ts > ../BE/app/demo_peel_valley.json
import { repoCatalog } from '../FE/src/dev/repoCatalog';
import { demoPersona, setCatalog } from '../FE/src/engine/data';
import type { Answers, Profile } from '../FE/src/engine/types';

setCatalog(repoCatalog());
const { buildSnapshot } = await import('../FE/src/engine/snapshot');

const profile = demoPersona.profile as Profile;
const answers = demoPersona.answers as Answers;
const out = {
  company: demoPersona.company,
  domain: demoPersona.domain,
  profile,
  answers,
  rankingMode: 'effort',
  results: buildSnapshot(profile, answers, 'effort'),
  dns: demoPersona.dnsResult,
};
console.log(JSON.stringify(out, null, 2));
