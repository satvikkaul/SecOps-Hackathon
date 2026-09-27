import type { AnswerValue } from './types';

export type LookupStatus = 'ok' | 'missing' | 'error';
export type EmailProvider = 'm365' | 'google' | 'other';

export interface DnsResult {
  domain: string;
  mx: { status: LookupStatus; records: string[]; provider: EmailProvider | null };
  spf: { status: LookupStatus; record: string | null };
  dmarc: { status: LookupStatus; record: string | null; policy: string | null };
}

export type Indicator = 'green' | 'amber' | 'red' | 'grey';

export interface Finding {
  key: 'mx' | 'spf' | 'dmarc';
  title: string;
  indicator: Indicator;
  message: string;
}

const DOH = 'https://cloudflare-dns.com/dns-query';

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}
interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Trim, lower-case, and strip protocol, path, "www.", and any email local part. */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  if (d.includes('@')) d = d.split('@').pop() ?? d;
  d = d.replace(/^[a-z]+:\/\//, '').split('/')[0].replace(/^www\./, '').replace(/\.$/, '');
  return d;
}

export function isValidDomain(d: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);
}

/** TXT data arrives as one or more quoted chunks: "v=spf1 " "include:..." */
export function unquoteTxt(data: string): string {
  const chunks = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!chunks) return data;
  return chunks.map((c) => c.slice(1, -1).replace(/\\"/g, '"')).join('');
}

export function providerFromMx(records: string[]): EmailProvider | null {
  if (records.length === 0) return null;
  const all = records.join(' ').toLowerCase();
  if (all.includes('outlook.com')) return 'm365';
  if (all.includes('google.com') || all.includes('googlemail.com')) return 'google';
  return 'other';
}

export function parseDmarcPolicy(record: string): string | null {
  const m = record.match(/(?:^|;)\s*p\s*=\s*([a-z]+)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Map the SPF and DMARC results to an answer for Q11. Returns undefined when the DMARC check failed.
 * Yes needs an enforcing DMARC policy and an SPF record; a missing SPF record caps it at partial.
 */
export function emailAuthToAnswer(r: Pick<DnsResult, 'spf' | 'dmarc'>): AnswerValue | undefined {
  const { dmarc, spf } = r;
  if (dmarc.status === 'error') return undefined;
  if (dmarc.status === 'missing') return 'no';
  const enforced = dmarc.policy === 'reject' || dmarc.policy === 'quarantine';
  return enforced && spf.status !== 'missing' ? 'yes' : 'partial';
}

async function query(name: string, type: 'MX' | 'TXT', fetchFn: FetchLike): Promise<string[] | null> {
  try {
    const res = await fetchFn(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as DohResponse;
    // Status 3 = NXDOMAIN: the name does not exist, which is a valid "missing" answer.
    if (body.Status !== 0 && body.Status !== 3) return null;
    const wanted = type === 'MX' ? 15 : 16;
    return (body.Answer ?? []).filter((a) => a.type === wanted).map((a) => (type === 'TXT' ? unquoteTxt(a.data) : a.data));
  } catch {
    return null;
  }
}

/** Run MX, SPF, and DMARC lookups in parallel via Cloudflare DNS-over-HTTPS. */
export async function checkDomain(domainInput: string, fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<DnsResult> {
  const domain = normalizeDomain(domainInput);
  const [mx, txt, dmarcTxt] = await Promise.all([
    query(domain, 'MX', fetchFn),
    query(domain, 'TXT', fetchFn),
    query(`_dmarc.${domain}`, 'TXT', fetchFn),
  ]);

  const spfRecord = txt?.find((t) => t.toLowerCase().startsWith('v=spf1')) ?? null;
  const dmarcRecord = dmarcTxt?.find((t) => t.toLowerCase().startsWith('v=dmarc1')) ?? null;

  return {
    domain,
    mx: mx === null ? { status: 'error', records: [], provider: null } : { status: mx.length ? 'ok' : 'missing', records: mx, provider: providerFromMx(mx) },
    spf: txt === null ? { status: 'error', record: null } : { status: spfRecord ? 'ok' : 'missing', record: spfRecord },
    dmarc:
      dmarcTxt === null
        ? { status: 'error', record: null, policy: null }
        : { status: dmarcRecord ? 'ok' : 'missing', record: dmarcRecord, policy: dmarcRecord ? parseDmarcPolicy(dmarcRecord) : null },
  };
}

const PROVIDER_NAMES: Record<EmailProvider, string> = {
  m365: 'Microsoft 365',
  google: 'Google Workspace',
  other: 'another email provider',
};

/** Plain-language findings with a traffic-light indicator. */
export function describeFindings(r: DnsResult): Finding[] {
  const couldNot = "Couldn't check this one. You can answer manually.";
  const findings: Finding[] = [];

  if (r.mx.status === 'error') findings.push({ key: 'mx', title: 'Email provider', indicator: 'grey', message: couldNot });
  else if (r.mx.status === 'missing')
    findings.push({ key: 'mx', title: 'Email provider', indicator: 'amber', message: 'We could not find any email servers for this domain. Check the spelling, or it may not be used for email.' });
  else
    findings.push({ key: 'mx', title: 'Email provider', indicator: 'green', message: `Your email runs on ${PROVIDER_NAMES[r.mx.provider ?? 'other']}. We will tailor instructions to it.` });

  if (r.spf.status === 'error') findings.push({ key: 'spf', title: 'Approved senders list (SPF)', indicator: 'grey', message: couldNot });
  else if (r.spf.status === 'missing')
    findings.push({ key: 'spf', title: 'Approved senders list (SPF)', indicator: 'red', message: 'Your domain does not list which servers are allowed to send your email, so fakes are harder for others to catch.' });
  else
    findings.push({ key: 'spf', title: 'Approved senders list (SPF)', indicator: 'green', message: 'Your domain lists which servers are allowed to send email for you. Good.' });

  const dmarcTitle = 'Spoofing protection (DMARC)';
  if (r.dmarc.status === 'error') findings.push({ key: 'dmarc', title: dmarcTitle, indicator: 'grey', message: couldNot });
  else if (r.dmarc.status === 'missing')
    findings.push({ key: 'dmarc', title: dmarcTitle, indicator: 'red', message: 'Anyone can send email pretending to be from your company. This makes fake invoice scams much easier.' });
  else if ((r.dmarc.policy === 'reject' || r.dmarc.policy === 'quarantine') && r.spf.status === 'missing')
    findings.push({ key: 'dmarc', title: dmarcTitle, indicator: 'amber', message: 'DMARC is set to block fakes, but without an approved senders list (SPF) some of your own email may be blocked too, and protection is weaker. Add an SPF record to finish the job.' });
  else if (r.dmarc.policy === 'reject' || r.dmarc.policy === 'quarantine')
    findings.push({ key: 'dmarc', title: dmarcTitle, indicator: 'green', message: 'Fake emails using your company name are blocked or sent to spam. Well done.' });
  else
    findings.push({ key: 'dmarc', title: dmarcTitle, indicator: 'amber', message: 'DMARC is set up but only in "watch" mode (p=none), so fake emails using your name still get delivered. The next step is to switch to quarantine or reject.' });

  return findings;
}
