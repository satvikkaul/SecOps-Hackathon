import { describe, expect, it } from 'vitest';
import { isImplied, withSector } from './profile';

describe('profile answers implied by the sector', () => {
  it('answers "perishable" for farms, processors, and cold storage', () => {
    for (const sector of ['farm', 'processor', 'coldstorage']) {
      expect(withSector({}, sector).perishable).toBe('yes');
      expect(isImplied('perishable', { sector })).toBe(true);
    }
  });

  it('still asks carriers and brokers', () => {
    for (const sector of ['carrier', 'broker']) {
      expect(withSector({}, sector).perishable).toBeUndefined();
      expect(isImplied('perishable', { sector })).toBe(false);
    }
  });

  it('keeps a carrier’s own answer when they switch between asked sectors', () => {
    expect(withSector({ sector: 'carrier', perishable: 'no' }, 'broker').perishable).toBe('no');
  });

  it('clears the implied answer when switching to a sector that is asked', () => {
    expect(withSector({ sector: 'farm', perishable: 'yes', employees: '1-10' }, 'carrier')).toEqual({ sector: 'carrier', employees: '1-10' });
  });

  it('overrides an earlier answer when switching to a perishable sector', () => {
    expect(withSector({ sector: 'carrier', perishable: 'no' }, 'farm').perishable).toBe('yes');
  });
});
