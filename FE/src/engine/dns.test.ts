import { describe, expect, it } from 'vitest';
import {
  checkDomain,
  describeFindings,
  dmarcToAnswer,
  isValidDomain,
  normalizeDomain,
  parseDmarcPolicy,
  providerFromMx,
  unquoteTxt,
} from './dns';

function mockFetch(table: Record<string, unknown>) {
  return async (url: string) => {
    const u = new URL(url);
    const key = `${u.searchParams.get('name')}|${u.searchParams.get('type')}`;
    if (!(key in table)) return { ok: true, json: async () => ({ Status: 3 }) };
    const v = table[key];
    if (v === 'THROW') throw new Error('network');
    return { ok: true, json: async () => v };
  };
}

describe('dns helpers', () => {
  it('normalizes and validates domains', () => {
    expect(normalizeDomain(' https://www.Example.ca/about ')).toBe('example.ca');
    expect(normalizeDomain('bob@peelvalleyfresh.ca')).toBe('peelvalleyfresh.ca');
    expect(isValidDomain('peelvalleyfresh.ca')).toBe(true);
    expect(isValidDomain('not a domain')).toBe(false);
  });
  it('unquotes split TXT records', () => {
    expect(unquoteTxt('"v=spf1 include:a " "-all"')).toBe('v=spf1 include:a -all');
  });
  it('detects provider from MX', () => {
    expect(providerFromMx(['0 x-ca.mail.protection.outlook.com.'])).toBe('m365');
    expect(providerFromMx(['1 aspmx.l.google.com.'])).toBe('google');
    expect(providerFromMx(['10 mx.other.net.'])).toBe('other');
    expect(providerFromMx([])).toBeNull();
  });
  it('parses DMARC policy and maps it to an answer', () => {
    expect(parseDmarcPolicy('v=DMARC1; p=reject; rua=mailto:x')).toBe('reject');
    expect(parseDmarcPolicy('v=DMARC1; sp=none; p=quarantine')).toBe('quarantine');
    expect(dmarcToAnswer({ status: 'ok', record: 'x', policy: 'quarantine' })).toBe('yes');
    expect(dmarcToAnswer({ status: 'ok', record: 'x', policy: 'none' })).toBe('partial');
    expect(dmarcToAnswer({ status: 'missing', record: null, policy: null })).toBe('no');
    expect(dmarcToAnswer({ status: 'error', record: null, policy: null })).toBeUndefined();
  });
});

describe('checkDomain', () => {
  it('reads MX, SPF, and DMARC', async () => {
    const f = mockFetch({
      'acme.ca|MX': { Status: 0, Answer: [{ name: 'acme.ca', type: 15, data: '1 aspmx.l.google.com.' }] },
      'acme.ca|TXT': { Status: 0, Answer: [{ name: 'acme.ca', type: 16, data: '"v=spf1 include:_spf.google.com ~all"' }] },
      '_dmarc.acme.ca|TXT': { Status: 0, Answer: [{ name: '_dmarc.acme.ca', type: 16, data: '"v=DMARC1; p=none"' }] },
    });
    const r = await checkDomain('acme.ca', f);
    expect(r.mx.provider).toBe('google');
    expect(r.spf.status).toBe('ok');
    expect(r.dmarc.policy).toBe('none');
    expect(describeFindings(r).find((x) => x.key === 'dmarc')!.indicator).toBe('amber');
  });
  it('reports missing DMARC as red', async () => {
    const r = await checkDomain('nodmarc.ca', mockFetch({}));
    expect(r.dmarc.status).toBe('missing');
    expect(describeFindings(r).find((x) => x.key === 'dmarc')!.indicator).toBe('red');
  });
  it('handles network errors gracefully', async () => {
    const f = mockFetch({ 'x.ca|MX': 'THROW', 'x.ca|TXT': 'THROW', '_dmarc.x.ca|TXT': 'THROW' });
    const r = await checkDomain('x.ca', f);
    expect(r.mx.status).toBe('error');
    expect(r.dmarc.status).toBe('error');
    expect(describeFindings(r).every((x) => x.indicator === 'grey')).toBe(true);
  });
});
