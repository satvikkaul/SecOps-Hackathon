import { useMemo, useState } from 'react';
import type { FlowGraph, FlowLink, FlowNode } from '../engine/flow';
import type { ScenarioId } from '../engine/types';
import { SCENARIO_COLORS } from './ui';

const W = 1100;
const PAD_TOP = 44;
const GAP = 16;
const MIN_H = 36;
const COL = {
  0: { x: 250, w: 12 }, // bar; label to the left
  1: { x: 455, w: 180 }, // box with label inside
  2: { x: 800, w: 12 }, // bar; label to the right
} as const;

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) {
      lines.push(line);
      line = w;
    } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

interface Placed extends FlowNode {
  y: number;
  h: number;
}
interface PlacedLink extends FlowLink {
  t: number;
  y0: number;
  y1: number;
  color: string;
  key: string;
}

function layout(graph: FlowGraph) {
  const outSum = new Map<string, number>();
  const inSum = new Map<string, number>();
  for (const l of graph.links) {
    outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
    inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
  }
  const maxSum = Math.max(...graph.nodes.map((n) => Math.max(outSum.get(n.id) ?? 0, inSum.get(n.id) ?? 0)), 0.001);
  const K = 64 / maxSum; // px per unit of flow

  const cols = [0, 1, 2].map((c) => graph.nodes.filter((n) => n.column === c));
  const heights = cols.map((nodes) =>
    nodes.map((n) => Math.max(MIN_H, Math.max(outSum.get(n.id) ?? 0, inSum.get(n.id) ?? 0) * K + 8)),
  );
  const colTotals = heights.map((hs) => hs.reduce((a, b) => a + b, 0) + GAP * Math.max(0, hs.length - 1));
  const H = Math.max(...colTotals) + PAD_TOP + 16;

  const placed = new Map<string, Placed>();
  cols.forEach((nodes, c) => {
    let y = PAD_TOP + (H - PAD_TOP - 16 - colTotals[c]) / 2;
    nodes.forEach((n, i) => {
      placed.set(n.id, { ...n, y, h: heights[c][i] });
      y += heights[c][i] + GAP;
    });
  });

  const center = (id: string) => {
    const p = placed.get(id)!;
    return p.y + p.h / 2;
  };
  const colorOf = (l: FlowLink) => {
    const s = placed.get(l.source)!;
    const sid = (s.column === 1 ? l.source : l.target) as ScenarioId;
    return SCENARIO_COLORS[sid] ?? '#64748b';
  };

  // Stack link ends inside each node, ordered to reduce crossings.
  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();
  for (const n of placed.values()) {
    outCursor.set(n.id, n.y + (n.h - (outSum.get(n.id) ?? 0) * K) / 2);
    inCursor.set(n.id, n.y + (n.h - (inSum.get(n.id) ?? 0) * K) / 2);
  }
  const links: PlacedLink[] = graph.links.map((l) => ({ ...l, t: l.value * K, y0: 0, y1: 0, color: colorOf(l), key: `${l.source}>${l.target}` }));
  [...links]
    .sort((a, b) => center(a.source) - center(b.source) || center(a.target) - center(b.target))
    .forEach((l) => {
      const c = outCursor.get(l.source)!;
      l.y0 = c + l.t / 2;
      outCursor.set(l.source, c + l.t);
    });
  [...links]
    .sort((a, b) => center(a.target) - center(b.target) || center(a.source) - center(b.source))
    .forEach((l) => {
      const c = inCursor.get(l.target)!;
      l.y1 = c + l.t / 2;
      inCursor.set(l.target, c + l.t);
    });

  return { nodes: [...placed.values()], links, H };
}

/** Every link on a path through the node, upstream and downstream. */
function connected(links: FlowLink[], nodeId: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: 'down' | 'up') => {
    const frontier = [nodeId];
    const seen = new Set(frontier);
    while (frontier.length) {
      const id = frontier.pop()!;
      for (const l of links) {
        const [from, to] = dir === 'down' ? [l.source, l.target] : [l.target, l.source];
        if (from !== id) continue;
        out.add(`${l.source}>${l.target}`);
        if (!seen.has(to)) {
          seen.add(to);
          frontier.push(to);
        }
      }
    }
  };
  walk('down');
  walk('up');
  return out;
}

const KIND_STYLE: Record<0 | 1 | 2, string> = {
  0: 'bg-slate-100 text-slate-700',
  1: 'bg-rose-50 text-rose-800',
  2: 'bg-slate-800 text-white',
};

function InfoCard({ node, className = '' }: { node: Placed; className?: string }) {
  const { info } = node;
  const color = node.column === 1 ? SCENARIO_COLORS[node.id as ScenarioId] : undefined;
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg ${className}`}>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[node.column]}`}>
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {info.kind}
      </span>
      <div className="mt-2 font-bold leading-snug text-slate-900">{info.title}</div>
      <p className="mt-1 text-sm leading-relaxed text-slate-700">{info.body}</p>
      {info.note && <p className="mt-2 text-xs leading-relaxed text-slate-500">{info.note}</p>}
    </div>
  );
}

/** focusId highlights one node's paths when nothing is hovered (e.g. opened from a risk's full story). */
export default function RiskFlow({ graph, focusId = null }: { graph: FlowGraph; focusId?: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  // Tapping a box keeps its explanation open on touch screens, where there is no hover.
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = hover ?? pinned;
  const active = shown ?? (focusId && graph.nodes.some((n) => n.id === focusId) ? focusId : null);
  const { nodes, links, H } = useMemo(() => layout(graph), [graph]);
  const lit = useMemo(() => (active ? connected(graph.links, active) : null), [active, graph.links]);
  const litNodes = useMemo(() => {
    if (!lit) return null;
    const s = new Set<string>([active!]);
    for (const k of lit) k.split('>').forEach((id) => s.add(id));
    return s;
  }, [lit, active]);

  if (graph.nodes.length === 0) {
    return <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800">No open gaps to show. Every question with a protective effect is answered Yes.</p>;
  }

  const xs = (c: 0 | 1 | 2) => [COL[c].x, COL[c].x + COL[c].w];
  const shownNode = shown ? nodes.find((n) => n.id === shown) : undefined;
  /** Where the floating card sits, as a percentage of the diagram: beside the box, on the side with room. */
  const anchor = (n: Placed) => {
    const x = n.column === 2 ? COL[2].x - 10 : COL[n.column].x + COL[n.column].w + 10;
    return { left: `${((x + 12) / (W + 12)) * 100}%`, top: `${((n.y + n.h / 2) / H) * 100}%` };
  };

  return (
    <div className="relative">
      <svg viewBox={`-12 0 ${W + 12} ${H}`} className="h-auto w-full select-none" role="group" aria-label="How your security gaps flow into threats and into your supply chain partners">
        <g className="fill-slate-500 text-[13px] font-semibold uppercase tracking-wider">
          <text x={COL[0].x + COL[0].w} y={20} textAnchor="end">Your security gaps</text>
          <text x={COL[1].x + COL[1].w / 2} y={20} textAnchor="middle">What could happen</text>
          <text x={COL[2].x} y={20}>Who else feels it</text>
        </g>

        <g fill="none">
          {links.map((l) => {
            const s = nodes.find((n) => n.id === l.source)!;
            const x0 = xs(s.column)[1];
            const x1 = xs((s.column + 1) as 1 | 2)[0];
            const xm = (x0 + x1) / 2;
            const on = !lit || lit.has(l.key);
            return (
              <path
                key={l.key}
                className="flow-link"
                d={`M${x0},${l.y0} C${xm},${l.y0} ${xm},${l.y1} ${x1},${l.y1}`}
                stroke={l.color}
                strokeWidth={Math.max(1.5, l.t)}
                strokeOpacity={lit ? (on ? 0.7 : 0.06) : 0.32}
              >
                <title>{`${s.label} → ${nodes.find((n) => n.id === l.target)!.label}`}</title>
              </path>
            );
          })}
        </g>

        {nodes.map((n) => {
          const dim = litNodes && !litNodes.has(n.id);
          const common = {
            onMouseEnter: () => setHover(n.id),
            onMouseLeave: () => setHover(null),
            onFocus: () => setHover(n.id),
            onBlur: () => setHover(null),
            onClick: () => setPinned((p) => (p === n.id ? null : n.id)),
            tabIndex: 0,
            role: 'button',
            'aria-label': `${n.info.kind}: ${n.info.title}. ${n.info.body}`,
            className: 'focus:outline-none',
            style: { cursor: 'pointer', opacity: dim ? 0.35 : 1, transition: 'opacity 150ms' },
          };
          if (n.column === 1) {
            const color = SCENARIO_COLORS[n.id as ScenarioId];
            return (
              <g key={n.id} {...common}>
                <rect x={COL[1].x} y={n.y} width={COL[1].w} height={n.h} rx={10} fill={color} />
                <text x={COL[1].x + COL[1].w / 2} y={n.y + n.h / 2} textAnchor="middle" dominantBaseline="central" className="fill-white text-[15px] font-bold">
                  {n.label}
                </text>
              </g>
            );
          }
          const left = n.column === 0;
          const lines = wrap(n.label, 30);
          const lh = 17;
          const ty = n.y + n.h / 2 - ((lines.length - 1) * lh) / 2;
          return (
            <g key={n.id} {...common}>
              <rect x={COL[n.column].x} y={n.y} width={COL[n.column].w} height={n.h} rx={3} className={left ? 'fill-slate-500' : 'fill-slate-800'} />
              {/* invisible hit area covering the label */}
              <rect x={left ? 0 : COL[2].x} y={n.y} width={left ? COL[0].x + COL[0].w : W - COL[2].x} height={n.h} fill="transparent" />
              <text
                x={left ? COL[0].x - 10 : COL[2].x + COL[2].w + 12}
                y={ty}
                textAnchor={left ? 'end' : 'start'}
                dominantBaseline="central"
                className={`text-[15px] ${left ? 'fill-slate-700 font-medium' : 'fill-slate-900 font-semibold'}`}
              >
                {lines.map((line, i) => (
                  <tspan key={i} x={left ? COL[0].x - 10 : COL[2].x + COL[2].w + 12} dy={i === 0 ? 0 : lh}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>

      {shownNode && (
        <div
          className="fade-in pointer-events-none absolute z-10 hidden w-72 md:block"
          style={{ ...anchor(shownNode), transform: `translate(${shownNode.column === 2 ? '-100%' : '0'}, -50%)` }}
          role="tooltip"
        >
          <InfoCard node={shownNode} />
        </div>
      )}
      <div className="mt-3 md:hidden">
        {shownNode ? (
          <InfoCard node={shownNode} className="shadow-none" />
        ) : (
          <p className="text-sm text-slate-500">Tap any box to see what it means.</p>
        )}
      </div>
      <p className="mt-2 hidden text-sm text-slate-500 md:block">Hover over any box to see what it means and trace where it leads.</p>
    </div>
  );
}
