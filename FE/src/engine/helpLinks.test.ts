import { describe, expect, it } from 'vitest';
import fallback from '../data/catalogFallback.json';
import links from '../data/helpLinks.json';
import { helpLinksFor } from '../helpLinks';

const ALLOWED = ['learn.microsoft.com', 'support.microsoft.com', 'support.google.com', 'www.cyber.gc.ca'];

describe('official help links', () => {
  it('belong to real fixes and point only at official vendor or government sites', () => {
    const ids = new Set((fallback as { actions: { id: string }[] }).actions.map((a) => a.id));
    for (const [id, byProvider] of Object.entries(links)) {
      expect(ids.has(id), id).toBe(true);
      for (const l of Object.values(byProvider).flat()) expect(ALLOWED, l.url).toContain(new URL(l.url).hostname);
    }
  });
  it('shows the right vendor, or both when the provider is unknown', () => {
    expect(helpLinksFor('A1', 'm365').map((l) => l.label)).toEqual(['Microsoft: turn on security defaults (two-step login)']);
    expect(helpLinksFor('A1', 'unsure')).toHaveLength(2);
    expect(helpLinksFor('A19', 'm365')).toEqual([]);
  });
});
