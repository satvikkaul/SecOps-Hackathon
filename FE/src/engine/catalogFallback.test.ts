import { describe, expect, it } from 'vitest';
import fallback from '../data/catalogFallback.json';

// The BE catalog files are the source of truth; the FE bundles a copy for when the BE is down.
const files = import.meta.glob<unknown>('../../../BE/app/catalog/*.json', { eager: true, import: 'default' });

describe('bundled catalog fallback', () => {
  it('matches BE/app/catalog exactly (run `npm run sync:catalog` after editing the catalog)', () => {
    const byName = Object.fromEntries(Object.entries(files).map(([path, json]) => [path.split('/').pop()!.replace(/\.json$/, ''), json]));
    expect(Object.keys(byName).length).toBeGreaterThan(10);
    expect(fallback).toEqual(byName);
  });
});
