import { Maximize2, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import type { SupplyChain, SupplyChainSupplier } from '../api/endpoints';
import type { Band } from '../engine/types';
import { BAND_STYLES, BandBadge } from './ui';

const NODE_W = 188;
const NODE_H = 72;
const COL_X = [28, 280, 532];
const ROW_GAP = 22;
const CANVAS_W = 800;
const CANVAS_H = 420;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.4;
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

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

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
  const pad = 28;
  const contentH = Math.max(CANVAS_H, total + pad * 2);
  const contentW = COL_X[2] + NODE_W + pad;
  let y = pad;
  for (const n of l1) {
    const h = groupH(n.id);
    placed.set(n.id, { x: COL_X[1], y: y + (h - NODE_H) / 2, node: n });
    (children.get(n.id) ?? []).forEach((k, i) => {
      placed.set(k.id, { x: COL_X[2], y: y + i * (NODE_H + ROW_GAP), node: k });
    });
    y += h + ROW_GAP;
  }
  placed.set('root', { x: COL_X[0], y: contentH / 2 - NODE_H / 2, node: root });
  return { placed, contentW, contentH, nodes };
}

function fitZoom(contentW: number, contentH: number) {
  return clamp(Math.min(CANVAS_W / contentW, CANVAS_H / contentH), MIN_ZOOM, 1);
}

/** Wiz-style security graph: fixed canvas, reserved detail strip, wheel/button zoom and drag-to-pan. */
export default function SupplyChainGraph({ chain }: { chain: SupplyChain }) {
  const { placed, contentW, contentH, nodes } = useMemo(() => layout(chain), [chain]);
  const startZoom = fitZoom(contentW, contentH);
  const [hover, setHover] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(startZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);

  const focus = hover ?? selectedId;
  const focused = focus ? placed.get(focus)?.node : undefined;
  const linked = new Set<string>();
  if (focus) {
    linked.add(focus);
    for (const n of nodes) {
      if (n.id === focus || n.parentId === focus) linked.add(n.id);
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

  const selected = selectedId ? placed.get(selectedId)?.node.supplier : undefined;
  const vx = -pan.x / zoom;
  const vy = -pan.y / zoom;
  const vw = CANVAS_W / zoom;
  const vh = CANVAS_H / zoom;

  const zoomBy = (next: number, originX = CANVAS_W / 2, originY = CANVAS_H / 2) => {
    const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const k = z / zoom;
    setPan({ x: originX - (originX - pan.x) * k, y: originY - (originY - pan.y) * k });
    setZoom(z);
  };
  const resetView = () => {
    setZoom(startZoom);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = frame.current?.getBoundingClientRect();
    const ox = rect ? ((e.clientX - rect.left) / rect.width) * CANVAS_W : CANVAS_W / 2;
    const oy = rect ? ((e.clientY - rect.top) / rect.height) * CANVAS_H : CANVAS_H / 2;
    zoomBy(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), ox, oy);
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const block = (ev: Event) => ev.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-node]')) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPan({ x: drag.current.panX + (e.clientX - drag.current.x), y: drag.current.panY + (e.clientY - drag.current.y) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 text-slate-100 ring-1 ring-slate-800">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Security graph</div>
          <div className="truncate text-sm text-slate-300">Who sits under {chain.company}, and the risk they shared</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:flex">
            {(['High', 'Elevated', 'Moderate', 'Low'] as Band[]).map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: BAND_HEX[b] }} />
                {b}
              </span>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-700">
            <button type="button" aria-label="Zoom out" onClick={() => zoomBy(zoom / 1.2)} className="px-2 py-1.5 text-slate-300 hover:bg-slate-800">
              <Minus size={14} />
            </button>
            <button type="button" aria-label="Fit graph" onClick={resetView} className="border-x border-slate-700 px-2 py-1.5 text-slate-300 hover:bg-slate-800">
              <Maximize2 size={14} />
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoomBy(zoom * 1.2)} className="px-2 py-1.5 text-slate-300 hover:bg-slate-800">
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={frame}
        className="relative cursor-grab overflow-hidden active:cursor-grabbing"
        style={{ height: CANVAS_H, backgroundImage: 'radial-gradient(circle, #1e293b 0.8px, transparent 0.8px)', backgroundSize: '18px 18px' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="h-full w-full" role="img" aria-label={`Supply chain graph for ${chain.company}`}>
          {edges.map((e) => (
            <path key={e.key} d={e.d} fill="none" stroke={e.color} strokeWidth={2} vectorEffect="non-scaling-stroke" opacity={e.live ? 0.9 : 0.14} />
          ))}
          {[...placed.values()].map(({ x, y, node }) => {
            const live = !focus || linked.has(node.id);
            const hex = node.band ? BAND_HEX[node.band] : '#475569';
            const waiting = node.status === 'pending' || node.status === 'timed_out';
            return (
              <g
                key={node.id}
                data-node=""
                transform={`translate(${x},${y})`}
                opacity={live ? 1 : 0.2}
                className="cursor-pointer"
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setSelectedId((id) => (id === node.id ? null : node.id))}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={14}
                  fill="#0f172a"
                  stroke={hex}
                  strokeWidth={node.kind === 'you' || selectedId === node.id ? 2.4 : 1.6}
                  strokeDasharray={waiting ? '5 4' : undefined}
                />
                <circle cx={26} cy={NODE_H / 2} r={12} fill={hex} opacity={0.22} />
                <text x={26} y={NODE_H / 2 + 4} textAnchor="middle" fill={hex} fontSize="13" fontWeight={800}>
                  {node.name.slice(0, 1)}
                </text>
                <text x={46} y={30} fill="#f8fafc" fontSize="13" fontWeight={700}>
                  {node.name.length > 22 ? `${node.name.slice(0, 20)}…` : node.name}
                </text>
                <text x={46} y={50} fill="#94a3b8" fontSize="11">
                  {node.kind === 'you' ? 'You' : waiting ? (node.status === 'timed_out' ? 'No response' : 'Waiting') : node.band ?? 'Score not shared'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="h-[6.25rem] overflow-hidden border-t border-slate-800 px-4 py-2.5">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-100">{selected.supplierName}</span>
              {selected.shared.posture?.band && <BandBadge band={selected.shared.posture.band} size="sm" />}
              <span className="text-xs text-slate-400">Tier {selected.level}</span>
            </div>
            {selected.shared.scenarios && selected.shared.scenarios.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-sm text-slate-300">
                {selected.shared.scenarios.slice(0, 2).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{s.name}</span>
                    <span className={`shrink-0 text-xs font-semibold ${BAND_STYLES[s.band].text}`}>{s.band}</span>
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
          </>
        ) : (
          <p className="pt-3 text-sm text-slate-500">Click a company to pin what they shared. Scroll to zoom, drag the background to pan.</p>
        )}
      </div>
    </div>
  );
}
