import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key = (i: number) => [...this.items.keys()][i] ?? null;
  getItem = (k: string) => this.items.get(k) ?? null;
  setItem = (k: string, v: string) => void this.items.set(k, String(v));
  removeItem = (k: string) => void this.items.delete(k);
  clear = () => this.items.clear();
}

let storage: MemoryStorage;

async function loadStore() {
  vi.resetModules();
  const [{ setCatalog }, { repoCatalog }] = await Promise.all([import('../engine/data'), import('../dev/repoCatalog')]);
  setCatalog(repoCatalog());
  return (await import('./appStore')).useAppStore;
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('app store persistence', () => {
  it('saves display preferences and nothing about the business', async () => {
    const store = await loadStore();
    store.getState().update({ company: 'Maple Ridge Cold Storage', domain: 'mapleridge.ca', expertise: 'expert', rankingMode: 'cost' });
    store.getState().setProfile('sector', 'carrier');
    store.getState().setAnswer('Q1', 'no');

    const saved = JSON.parse(storage.getItem('chain-of-custody:prefs')!);
    expect(saved.state).toEqual({ rankingMode: 'cost', template: 'cccs-cis', expertise: 'expert' });
    expect(JSON.stringify(saved)).not.toMatch(/Maple|mapleridge|carrier|Q1/);
  });

  it('starts a new page with an empty assessment and the saved preferences', async () => {
    storage.setItem('chain-of-custody:prefs', JSON.stringify({ state: { expertise: 'medium', template: 'ciosc' }, version: 1 }));
    const s = (await loadStore()).getState();
    expect(s.expertise).toBe('medium');
    expect(s.template).toBe('ciosc');
    expect(s.answers).toEqual({});
    expect(s.company).toBe('');
  });

  it('ignores saved values the app does not know', async () => {
    storage.setItem('chain-of-custody:prefs', JSON.stringify({ state: { expertise: 'wizard', template: 'nope', answers: { Q1: 'yes' } }, version: 1 }));
    const s = (await loadStore()).getState();
    expect(s.expertise).toBe('basic');
    expect(s.template).toBe('cccs-cis');
    expect(s.answers).toEqual({});
  });

  it('deletes the old full-state entry and keeps only its preferences', async () => {
    storage.setItem(
      'chain-of-custody:v1',
      JSON.stringify({ company: 'Old Co', answers: { Q1: 'no' }, expertise: 'expert', template: 'ciosc', rankingMode: 'cost' }),
    );
    const s = (await loadStore()).getState();
    expect(storage.getItem('chain-of-custody:v1')).toBeNull();
    expect(s.company).toBe('');
    expect(s.answers).toEqual({});
    expect(s).toMatchObject({ expertise: 'expert', template: 'ciosc', rankingMode: 'cost' });
  });

  it('keeps preferences on reset and clears the assessment', async () => {
    const store = await loadStore();
    store.getState().update({ expertise: 'expert' });
    store.getState().loadDemo();
    expect(store.getState().isDemo).toBe(true);
    store.getState().reset();
    expect(store.getState()).toMatchObject({ isDemo: false, company: '', answers: {}, expertise: 'expert' });
  });
});
