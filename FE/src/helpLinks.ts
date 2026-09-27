import links from './data/helpLinks.json';

export interface HelpLink {
  label: string;
  url: string;
}
type ByProvider = Partial<Record<'m365' | 'google' | 'any', HelpLink[]>>;

/** Official vendor help pages for a fix (checked by hand; never generated). Unknown provider → both vendors. */
export function helpLinksFor(actionId: string, emailProvider: string | undefined): HelpLink[] {
  const entry = (links as Record<string, ByProvider>)[actionId];
  if (!entry) return [];
  const vendor = emailProvider === 'm365' || emailProvider === 'google' ? entry[emailProvider] ?? [] : [...(entry.m365 ?? []), ...(entry.google ?? [])];
  return [...vendor, ...(entry.any ?? [])];
}
