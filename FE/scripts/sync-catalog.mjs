// Copies the check-up content (BE/app/catalog/*.json, the source of truth) into the FE as a fallback,
// so the app still starts if the BE or database is down. Run after editing any catalog file:
//   npm run sync:catalog
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const src = new URL('../../BE/app/catalog/', import.meta.url);
const out = new URL('../src/data/catalogFallback.json', import.meta.url);
const catalog = Object.fromEntries(
  readdirSync(src)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(new URL(f, src), 'utf8'))]),
);
writeFileSync(out, JSON.stringify(catalog) + '\n');
console.log(`wrote ${Object.keys(catalog).length} catalog files to src/data/catalogFallback.json`);
