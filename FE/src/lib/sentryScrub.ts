/** A share token in a URL is a bearer secret for that company's summary, so it never goes to Sentry. */
const SHARE_TOKENS: [RegExp, string][] = [
  [/([?&]share=)[A-Za-z0-9_%-]+/g, '$1[redacted]'],
  [/(\/api\/share\/)[A-Za-z0-9_%-]+/g, '$1[redacted]'],
];

export const redactShareTokens = (text: string) => SHARE_TOKENS.reduce((t, [pattern, replacement]) => t.replace(pattern, replacement), text);

/** Redacts share tokens anywhere in a Sentry event, breadcrumb, or transaction (URLs, span names, request data). */
export function scrubShareTokens<T>(value: T): T {
  const json = JSON.stringify(value);
  const clean = redactShareTokens(json);
  return clean === json ? value : (JSON.parse(clean) as T);
}

export const isSharePage = () => new URLSearchParams(window.location.search).has('share');
