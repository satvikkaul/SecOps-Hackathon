import type { Catalog } from '../engine/data';

/** The catalog straight from the BE's source files, for tests and scripts that run without a server.
 * Never imported by the app itself: the app loads the catalog from GET /api/catalog. */
const files = import.meta.glob<unknown>('../../../BE/app/catalog/*.json', { eager: true, import: 'default' });

export function repoCatalog(): Catalog {
  const byName = Object.fromEntries(Object.entries(files).map(([path, data]) => [path.split('/').pop()!.replace('.json', ''), data]));
  return byName as unknown as Catalog;
}
