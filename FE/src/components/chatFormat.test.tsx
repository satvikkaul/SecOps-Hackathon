import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AssistantMessage } from './ChatReply';
import { parseChatReply } from './chatFormat';

const SECTION = `This section is asking about **vendors and preparedness**—how you manage outside partners.

**Q22 (Vendor list):** Do you have an inventory of outside IT providers?
**Q23 (Breach notification):** Do your contracts require vendors to alert you if they are hacked?
**Q24 (Incident response plan):** Do you have a written checklist of who to call?
**Q25 (Cyber insurance):** Do you carry an active cyber insurance policy?

If you want, pick one and I can unpack it.`;

describe('parseChatReply', () => {
  it('turns a Q-id dump into topic cards and keeps the intro and close', () => {
    const blocks = parseChatReply(SECTION);
    expect(blocks.map((b) => b.kind)).toEqual(['lines', 'items', 'lines']);
    const intro = blocks[0];
    expect(intro.kind).toBe('lines');
    if (intro.kind !== 'lines') return;
    expect(intro.lines[0].spans).toContainEqual({ kind: 'strong', text: 'vendors and preparedness' });

    const items = blocks[1];
    expect(items.kind).toBe('items');
    if (items.kind !== 'items') return;
    expect(items.items.map((item) => item.title)).toEqual([
      'Vendor list',
      'Breach notification',
      'Incident response plan',
      'Cyber insurance',
    ]);
    expect(items.items[0].body).toEqual([{ kind: 'text', text: 'Do you have an inventory of outside IT providers?' }]);

    const html = renderToStaticMarkup(<AssistantMessage text={SECTION} />);
    expect(html).toContain('Vendor list');
    expect(html).toContain('vendors and preparedness');
    expect(html).not.toContain('**');
    expect(html).not.toContain('Q22');
  });

  it('reads the bullet shape the assistant is asked to write', () => {
    const blocks = parseChatReply('- **Vendor list** — Know who can log in from outside.\n- **Cyber insurance** — A policy helps pay for the recovery.');
    expect(blocks).toHaveLength(1);
    const items = blocks[0];
    expect(items.kind).toBe('items');
    if (items.kind !== 'items') return;
    expect(items.items[0]).toMatchObject({ title: 'Vendor list' });
    expect(items.items[0].body[0].text).toBe('Know who can log in from outside.');
  });

  it('keeps a normal sentence as text, and numbers a fix as steps', () => {
    const blocks = parseChatReply('Turn on **two-step login** for the mailbox you pay suppliers from.\n\n1. Open the account settings.\n2. Turn on the phone code.');
    expect(blocks[0].kind).toBe('lines');
    expect(blocks[1].kind).toBe('steps');
    if (blocks[1].kind !== 'steps') return;
    expect(blocks[1].steps.map((s) => s.n)).toEqual(['1', '2']);
  });
});
