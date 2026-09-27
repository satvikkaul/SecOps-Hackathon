import { describe, expect, it } from 'vitest';
import { ruleFor, ruleSheetHtml } from '../printRule';
import { actionById, rules } from './data';

describe('printable rule sheets', () => {
  it('each sheet belongs to a real fix', () => {
    for (const r of rules) expect(actionById[r.actionId], r.actionId).toBeDefined();
  });
  it('covers the load-change and bank-change rules, and only rule-type fixes', () => {
    expect(ruleFor('A19')?.title).toBe('Load change rule');
    expect(ruleFor('A7')).toBeDefined();
    expect(ruleFor('A1')).toBeUndefined(); // a setting, not a rule
  });
  it('escapes the company name, which is user input', () => {
    const html = ruleSheetHtml(ruleFor('A19')!, '<img src=x onerror=alert(1)>', 'today');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
