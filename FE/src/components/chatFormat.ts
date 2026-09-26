export type Span = { kind: 'text'; text: string } | { kind: 'strong'; text: string };

export type ChatLine = { bullet: boolean; spans: Span[] };

export type ChatBlock =
  | { kind: 'lines'; lines: ChatLine[] }
  | { kind: 'items'; items: { title: string; body: Span[] }[] }
  | { kind: 'steps'; steps: { n: string; body: Span[] }[] };

/** Turn an assistant reply into paragraphs, topic cards, and numbered steps.
 * Topic cards are `- **Topic** — …` and the older `**Q22 (Topic):** …` shape. */
export function parseChatReply(raw: string): ChatBlock[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/([^\n])(\*\*Q\d+\b)/g, '$1\n$2').trim();
  if (!text) return [];

  const blocks: ChatBlock[] = [];
  let lines: ChatLine[] = [];
  let items: { title: string; body: string }[] | null = null;
  let steps: { n: string; body: string }[] | null = null;

  const flushLines = () => {
    if (!lines.length) return;
    blocks.push({ kind: 'lines', lines });
    lines = [];
  };
  const flushItems = () => {
    if (!items?.length) return;
    blocks.push({ kind: 'items', items: items.map((item) => ({ title: item.title, body: inline(item.body) })) });
    items = null;
  };
  const flushSteps = () => {
    if (!steps?.length) return;
    blocks.push({ kind: 'steps', steps: steps.map((step) => ({ n: step.n, body: inline(step.body) })) });
    steps = null;
  };

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushLines();
      flushItems();
      flushSteps();
      continue;
    }
    const item = parseItem(trimmed);
    if (item) {
      flushLines();
      flushSteps();
      items ??= [];
      items.push(item);
      continue;
    }
    const step = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (step) {
      flushLines();
      flushItems();
      steps ??= [];
      steps.push({ n: step[1], body: step[2] });
      continue;
    }
    flushItems();
    flushSteps();
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    lines.push({ bullet: Boolean(bullet), spans: inline(bullet ? bullet[1] : trimmed) });
  }
  flushLines();
  flushItems();
  flushSteps();
  return blocks;
}

function parseItem(line: string): { title: string; body: string } | null {
  const bullet = line.match(/^[-*•]\s+(.*)$/);
  const source = bullet?.[1] ?? line;
  if (!bullet && !/^\*\*Q\d+\b/.test(line)) return null;
  const labeled = source.match(/^\*\*([^*]+)\*\*\s*(?:[:—–-]\s*)?(.*)$/);
  if (!labeled) return null;
  const title = cleanTitle(labeled[1]);
  if (!title) return null;
  return { title, body: labeled[2].trim() };
}

function cleanTitle(raw: string): string {
  const trimmed = raw.trim().replace(/[:：]\s*$/, '');
  const wrapped = trimmed.match(/^Q\d+\s*\(([^)]+)\)\s*$/i);
  if (wrapped) return wrapped[1].trim();
  return trimmed.replace(/^Q\d+\s+/, '').trim();
}

function inline(text: string): Span[] {
  if (!text) return [];
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) => {
      const strong = part.match(/^\*\*([^*]+)\*\*$/);
      return strong ? { kind: 'strong', text: strong[1] } : { kind: 'text', text: part };
    });
}
