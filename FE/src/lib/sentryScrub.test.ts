import { describe, expect, it } from 'vitest';
import { redactShareTokens, scrubShareTokens } from './sentryScrub';

describe('share token scrubbing', () => {
  it('redacts tokens in page URLs and API paths, and leaves the rest alone', () => {
    expect(redactShareTokens('https://app.example/?share=QgsII15h8FMUwIeTDm4aLg')).toBe('https://app.example/?share=[redacted]');
    expect(redactShareTokens('https://app.example/?demo&share=abc-_123#top')).toBe('https://app.example/?demo&share=[redacted]#top');
    expect(redactShareTokens('GET https://api.example/api/share/QgsII15h8FMUwIeTDm4aLg')).toBe('GET https://api.example/api/share/[redacted]');
    expect(redactShareTokens('https://app.example/?demo=summary')).toBe('https://app.example/?demo=summary');
  });

  it('reaches nested event fields, and returns clean events untouched', () => {
    const event = { request: { url: '/?share=secret1' }, spans: [{ description: 'GET /api/share/secret1' }], tags: { n: 1 } };
    expect(scrubShareTokens(event)).toEqual({ request: { url: '/?share=[redacted]' }, spans: [{ description: 'GET /api/share/[redacted]' }], tags: { n: 1 } });
    const clean = { request: { url: '/?demo' } };
    expect(scrubShareTokens(clean)).toBe(clean);
  });
});
