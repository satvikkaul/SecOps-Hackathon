import { useMemo, useState } from 'react';
import type { SupplyChain, SupplyChainSupplier } from '../api/endpoints';
import type { Band } from '../engine/types';
import { BAND_STYLES, BandBadge } from './ui';

const NODE_W = 196;
const NODE_H = 80;
const COL_X = [36, 300, 564];
const ROW_GAP = 28;
const BAND_HEX: Record<Band, string> = {
  High: '#e11d48',
  Elevated: '#f97316',
  Moderate: '#f59e0b',
  Low: '#059669',
};

type Node = {
  id: string;
  name: string;
  kind: 'you' | 'supplier';
  level: number;
  parentId: string | null;
  band?: Band;
  status?: SupplyChainSupplier['status'];
  supplier?: SupplyChainSupplier;
};

function layout(chain: SupplyChain) {
  const root: Node = {
    id: 'root',
    name: chain.company,
    kind: 'you',
    level: 0,
    parentId: null,
    band: chain.posture?.band,
  };
  const nodes: Node[] = [
    root,
    ...chain.suppliers.map((s) => ({
      id: s.id,
      name: s.supplierName,
      kind: 'supplier' as const,
      level: s.level,
      parentId: s.parentId ?? 'root',
      band: s.shared.posture?.band,
      status: s.status,
      supplier: s,
    })),
  ];
  const children = new Map<string, Node[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId) ?? [];
    list.push(n);
    children.set(n.parentId, list);
  }

  const placed = new Map<string, { x: number; y: number; node: Node }>();
  const l1 = children.get('root') ?? [];
  const groupH = (id: string) => {
    const kids = children.get(id) ?? [];
    return Math.max(NODE_H, kids.length * NODE_H + Math.max(0, kids.length - 1) * ROW_GAP);
  };
  const total = l1.reduce((sum, n, i) => sum + groupH(n.id) + (i > 0 ? ROW_GAP : 0), 0);
  const pad = 36;
  const height = Math.max(320, total + pad * 2);
  let y = pad;
  for (const n of l1) {
    const h = groupH(n.id);
    placed.set(n.id, { x: COL_X[1], y: y + (h - NODE_H) / 2, node: n });
    const kids = children.get(n.id) ?? [];
    kids.forEach((k, i) => {
      placed.set(k.id, { x: COL_X[2], y: y + i * (NODE_H + ROW_GAP), node: k });
    });
    y += h + ROW_GAP;
  }
  placed.set('root', { x: COL_X[0], y: height / 2 - NODE_H / 2, node: root });
  return { placed, height, nodes };
}

/** Wiz-style security graph: dark canvas, risk-ringed nodes, edges that light up on hover. */
export default function SupplyChainGraph({ chain }: { chain: SupplyChain }) {
  const { placed, height, nodes } = useMemo(() => layout(chain), [chain]);
  const [focus, setFocus] = useState<string | null>(null);
  const focused = focus ? placed.get(focus)?.node : undefined;
  const linked = new Set<string>();
  if (focus) {
    linked.add(focus);
    for (const n of nodes) {
      if (n.id === focus || n.parentId === focus || (n.id === focused?.parentId && n.id)) linked.add(n.id);
    }
    if (focused?.parentId) linked.add(focused.parentId);
  }

  const edges = nodes
    .filter((n) => n.parentId && placed.has(n.id) && placed.has(n.parentId))
    .map((n) => {
      const a = placed.get(n.parentId!)!;
      const b = placed.get(n.id)!;
      const x1 = a.x + NODE_W;
      const y1 = a.y + NODE_H / 2;
      const x2 = b.x;
      const y2 = b.y + NODE_H / 2;
      const mid = (x1 + x2) / 2;
      const color = n.band ? BAND_HEX[n.band] : '#64748b';
      return { key: n.id, d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, color, live: !focus || linked.has(n.id) };
    });

  const selected = focused?.supplier;

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 text-slate-100 shadow-inner ring-1 ring-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Security graph</div>
          <div className="text-sm text-slate-300">Who sits under {chain.company}, and the risk they shared</div>
        </div>
        <div className="hidden gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:flex">
          {(['High', 'Elevated', 'Moderate', 'Low'] as Band[]).map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: BAND_HEX[b] }} />
              {b}
            </span>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 800 ${height}`}
        className="w-full"
        role="img"
        aria-label={`Supply chain graph for ${chain.company}`}
        style={{ backgroundImage: 'radial-gradient(circle, #1e293b 0.8px, transparent 0.8px)', backgroundSize: '18px 18px' }}
      >
        {edges.map((e) => (
          <path
            key={e.key}
            d={e.d}
            fill="none"
            stroke={e.color}
            strokeWidth={focus && e.live ? 2.4 : 1.4}
            opacity={e.live ? 0.9 : 0.12}
          />
        ))}
        {[...placed.values()].map(({ x, y, node }) => {
          const live = !focus || linked.has(node.id);
          const hex = node.band ? BAND_HEX[node.band] : '#475569';
          const waiting = node.status === 'pending' || node.status === 'timed_out';
          return (
            <g
              key={node.id}
              transform={`translate(${x},${y})`}
              opacity={live ? 1 : 0.18}
              className="cursor-pointer"
              onMouseEnter={() => setFocus(node.id)}
              onMouseLeave={() => setFocus(null)}
              onClick={() => setFocus(node.id === focus ? null : node.id)}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={14}
                fill="#0f172a"
                stroke={hex}
                strokeWidth={node.kind === 'you' ? 2.4 : 1.6}
                strokeDasharray={waiting ? '5 4' : undefined}
                filter={live && node.band ? `drop-shadow(0 0 8px ${hex}55)` : undefined}
              />
              <circle cx={28} cy={NODE_H / 2} r={13} fill={hex} opacity={0.2} />
              <text x={28} y={NODE_H / 2 + 5} textAnchor="middle" fill={hex} fontSize="13" fontWeight={800}>
                {node.name.slice(0, 1)}
              </text>
              <text x={50} y={34} fill="#f8fafc" fontSize="13" fontWeight={700}>
                {node.name.length > 22 ? `${node.name.slice(0, 20)}…` : node.name}
              </text>
              <text x={50} y={54} fill="#94a3b8" fontSize="11">
                {node.kind === 'you' ? 'You' : waiting ? (node.status === 'timed_out' ? 'No response' : 'Waiting') : node.band ?? 'Score not shared'}
              </text>
            </g>
          );
        })}
      </svg>
      {selected && (
        <div className="border-t border-slate-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-100">{selected.supplierName}</span>
            {selected.shared.posture?.band && <BandBadge band={selected.shared.posture.band} size="sm" />}
            <span className="text-xs text-slate-400">Tier {selected.level}</span>
          </div>
          {selected.shared.scenarios && selected.shared.scenarios.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-slate-300">
              {selected.shared.scenarios.slice(0, 3).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span>{s.name}</span>
                  <span className={`text-xs font-semibold ${BAND_STYLES[s.band].text}`}>{s.band}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              {selected.status === 'pending'
                ? 'They have not completed the check-up yet.'
                : selected.status === 'timed_out'
                  ? 'The invite lapsed before they responded.'
                  : selected.shareChoice === 'score'
                    ? 'They shared only the overall score, not the report.'
                    : 'Nothing further was shared.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
