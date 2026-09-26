import { describe, expect, it } from 'vitest';
import { demoPersona } from './data';
import { buildSnapshot } from './snapshot';
import type { Answers, Profile } from './types';

describe('buildSnapshot', () => {
  it('captures the demo story for the share link', () => {
    const s = buildSnapshot(demoPersona.profile as Profile, demoPersona.answers as Answers, 'effort');
    expect(s.sector).toBe('Trucking or freight carrier');
    expect(s.posture).toEqual({ score: 3.5, band: 'High' });
    expect(s.topActions.map((a) => a.id)).toEqual(['A1', 'A19', 'A7', 'A8', 'A4']);
    expect(s.cccs).toHaveLength(13);
  });
});
