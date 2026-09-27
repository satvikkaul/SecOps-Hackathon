import { rules } from './engine/data';

/** A fix that is a rule people follow (not a setting), printed as a one-page sign for the desk. */
export interface RuleSheet {
  actionId: string;
  title: string;
  lead: string;
  must: string[];
  approvers?: string[];
  warnings?: string[];
  logTitle?: string;
  logColumns?: string[];
  contacts?: { role: string; phone: string }[];
}

export function ruleFor(actionId: string): RuleSheet | undefined {
  return rules.find((r) => r.actionId === actionId);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A complete, self-contained HTML page sized for one Letter sheet. */
export function ruleSheetHtml(rule: RuleSheet, company: string, date: string): string {
  const who = company.trim() ? esc(company.trim()) : '____________________';
  const list = (items: string[]) => items.map((i) => `<li>${esc(i)}</li>`).join('');
  const boxes = (items: string[]) => items.map((i) => `<span class="box">☐ ${esc(i)}</span>`).join('');

  const body = rule.contacts
    ? `<table><thead><tr><th>Who</th><th style="width:45%">Phone</th></tr></thead><tbody>${rule.contacts
        .map((c) => `<tr><td>${esc(c.role)}</td><td>${c.phone ? `<b>${esc(c.phone)}</b>` : ''}</td></tr>`)
        .join('')}</tbody></table>`
    : `${rule.approvers ? `<div class="row"><b>Who can give the second OK:</b> ${boxes(rule.approvers)}</div>` : ''}
       ${rule.warnings ? `<div class="warn"><b>Slow down if you see:</b><ul>${list(rule.warnings)}</ul></div>` : ''}
       ${
         rule.logColumns
           ? `<h2>${esc(rule.logTitle ?? 'Log')}</h2><table><thead><tr>${rule.logColumns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${'<tr>'
               .concat(rule.logColumns.map(() => '<td></td>').join(''), '</tr>')
               .repeat(9)}</tbody></table>`
           : ''
       }`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(rule.title)} · ${who}</title><style>
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
  .sheet { max-width: 7.3in; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #0f172a; padding-bottom: 6px; }
  h1 { font-size: 30px; margin: 0; letter-spacing: -0.5px; }
  .co { font-size: 15px; color: #334155; }
  .lead { font-size: 17px; margin: 16px 0 8px; font-weight: 600; }
  ol.must { margin: 0; padding-left: 24px; font-size: 18px; line-height: 1.45; }
  ol.must li { margin: 6px 0; padding: 8px 10px; border: 2px solid #0f172a; border-radius: 8px; list-style-position: outside; }
  .row { margin: 14px 0; font-size: 15px; }
  .box { display: inline-block; margin-right: 18px; }
  .warn { background: #fff7ed; border-left: 5px solid #ea580c; padding: 8px 12px; font-size: 14px; }
  .warn ul { margin: 4px 0 0; padding-left: 20px; columns: 2; }
  h2 { font-size: 16px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; background: #f1f5f9; }
  th, td { border: 1px solid #94a3b8; padding: 6px 8px; height: 30px; }
  .sign { margin-top: 18px; font-size: 13px; color: #334155; }
  .foot { margin-top: 14px; font-size: 11px; color: #64748b; }
  @media screen { body { background: #e2e8f0; padding: 24px; } .sheet { background: white; padding: 0.6in; box-shadow: 0 2px 12px rgba(0,0,0,.15); } }
</style></head><body><div class="sheet">
  <div class="top"><h1>${esc(rule.title)}</h1><div class="co">${who}</div></div>
  <p class="lead">${esc(rule.lead)}</p>
  <ol class="must">${list(rule.must)}</ol>
  ${body}
  <p class="sign">Posted on: ______________ &nbsp;&nbsp; Everyone who handles this has read it (initials): __________________________________</p>
  <p class="foot">From your Chain of Custody cyber check-up, ${esc(date)}.</p>
</div></body></html>`;
}

/** Opens the sign in its own window and prints it, so the results page stays untouched. */
export function printRule(rule: RuleSheet, company: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(ruleSheetHtml(rule, company, new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })));
  w.document.close();
  w.focus();
  // A short delay lets the new window lay out before the print dialog opens (load events are unreliable for written documents).
  window.setTimeout(() => w.print(), 300);
}
