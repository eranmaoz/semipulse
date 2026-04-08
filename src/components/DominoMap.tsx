'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Signal, PoliticalActivity } from '@/types';

interface RippleNode {
  ticker: string;
  tier: 0 | 1 | 2 | 3;
  role: 'trigger' | 'supplier' | 'customer' | 'competitor';
  riskScore: number;
  opportunityScore: number;
  changePercentage: number;
}

interface RippleEdge {
  from: string;
  to: string;
  type: 'supplier' | 'customer' | 'competitor';
  strength: number;
  description: string;
  risk: number;
}

interface DominoData {
  nodes: RippleNode[];
  edges: RippleEdge[];
  triggerChange: number;
}

interface CascadeStep {
  ticker: string;
  impact: string;
  direction: 'risk' | 'opportunity' | 'neutral';
}

interface TriggerEvent {
  ticker: string;
  type: string;
  headline: string;
  detail: string;
  severity: 'critical' | 'high' | 'medium';
  cascades: CascadeStep[];
}

const W = 720;
const H = 480;
const CX = W / 2;
const CY = H / 2;

function layoutNodes(nodes: RippleNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const byTier: Record<number, RippleNode[]> = {};
  nodes.forEach((n) => { (byTier[n.tier] ??= []).push(n); });

  Object.entries(byTier).forEach(([tierStr, ns]) => {
    const tier = Number(tierStr);
    if (tier === 0) { pos[ns[0].ticker] = { x: CX, y: CY }; return; }
    const radius = tier === 1 ? 140 : 220;
    ns.forEach((n, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / ns.length;
      pos[n.ticker] = { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
    });
  });
  return pos;
}

function nodeGlow(n: RippleNode): string {
  if (n.tier === 0) return '#3b82f6';
  if (n.opportunityScore > 50) return '#10b981';
  if (n.riskScore > 70) return '#ef4444';
  if (n.riskScore > 40) return '#f59e0b';
  return '#475569';
}

function edgeColor(e: RippleEdge): string {
  if (e.type === 'competitor') return '#8b5cf6';
  if (e.risk > 65) return '#ef4444';
  if (e.risk > 35) return '#f59e0b';
  return '#10b981';
}

function FlowingEdge({ x1, y1, x2, y2, color, strength, animated }: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; strength: number; animated: boolean;
}) {
  const w = 0.8 + (strength / 100) * 2;
  const opacity = 0.2 + (strength / 100) * 0.5;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 18;
  const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth={w + 4} strokeOpacity={0.05} />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeOpacity={opacity} />
      {animated && (
        <circle r="3" fill={color} fillOpacity="0.9">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  );
}

function NodeCircle({ node, pos, selected, onClick, hasPolitical }: {
  node: RippleNode; pos: { x: number; y: number };
  selected: boolean; onClick: () => void;
  hasPolitical?: boolean;
}) {
  const color = nodeGlow(node);
  const r = node.tier === 0 ? 32 : 24;
  const change = node.changePercentage;
  return (
    <g transform={`translate(${pos.x},${pos.y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle r={r + 16} fill={color} fillOpacity={selected ? 0.12 : 0.04} />
      {(node.riskScore > 55 || selected) && (
        <circle r={r + 6} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity={selected ? 0.7 : 0.3}>
          <animate attributeName="r" values={`${r+4};${r+13};${r+4}`} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.5;0.05;0.5" dur="2.5s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={r} fill="#0a0a0f" stroke={color} strokeWidth={selected ? 2.5 : 1.5} />
      <circle r={r - 2} fill={color} fillOpacity={node.tier === 0 ? 0.2 : 0.1} />
      <text textAnchor="middle" dy={node.tier === 0 ? -4 : -3}
        fill="white" fontSize={node.tier === 0 ? 12 : 10}
        fontWeight="bold" fontFamily="'SF Mono', 'Fira Code', monospace">
        {node.ticker}
      </text>
      <text textAnchor="middle" dy={node.tier === 0 ? 10 : 9}
        fill={change >= 0 ? '#10b981' : '#f87171'} fontSize="8"
        fontFamily="monospace">
        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
      </text>
      {node.tier > 0 && (
        <text textAnchor="middle" dy={r + 13}
          fill="rgba(148,163,184,0.6)" fontSize="7.5" fontFamily="system-ui">
          {node.role}
        </text>
      )}
      {/* Political activity badge */}
      {hasPolitical && (
        <g transform={`translate(${r - 4},${-r + 4})`}>
          <circle r="7" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="1.5" />
          <text textAnchor="middle" dy="3.5" fontSize="7" fill="white">🏛</text>
        </g>
      )}
    </g>
  );
}

function EventPanel({ ticker }: { ticker: string }) {
  const [events, setEvents] = useState<TriggerEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const detect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
      setRan(true);
    }
  };

  const severityStyle: Record<string, string> = {
    critical: 'border-red-500/30 bg-red-500/8 text-red-300',
    high:     'border-orange-500/30 bg-orange-500/8 text-orange-300',
    medium:   'border-yellow-500/30 bg-yellow-500/8 text-yellow-300',
  };

  const directionIcon  = { risk: '▼', opportunity: '▲', neutral: '→' };
  const directionColor = { risk: 'text-red-400', opportunity: 'text-emerald-400', neutral: 'text-gray-500' };

  return (
    <div className="mt-5 border-t border-white/8 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs text-gray-300 font-semibold uppercase tracking-wider">Trigger Events</h3>
          <p className="text-xs text-gray-600 mt-0.5">Events that trigger supply chain cascades</p>
        </div>
        <button
          onClick={detect}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-white/8 disabled:text-gray-600 text-white transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border border-white/20 border-t-white rounded-full animate-spin" />
              Scanning...
            </span>
          ) : ran ? '↺ Re-scan' : '⚡ Detect Events'}
        </button>
      </div>

      {!ran && (
        <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-center">
          <p className="text-sm text-gray-500 mb-1">No events scanned yet</p>
          <p className="text-xs text-gray-600">Click ⚡ Detect Events to let AI scan the reports and identify supply chain trigger events</p>
        </div>
      )}

      {ran && events.length === 0 && (
        <div className="rounded-lg border border-white/8 bg-white/3 p-4 text-center">
          <p className="text-xs text-gray-500">No significant events detected. Try loading more recent reports.</p>
        </div>
      )}

      <div className="space-y-4">
        {events.map((event, i) => (
          <div key={i} className={`rounded-xl border p-4 ${severityStyle[event.severity]}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold opacity-70">{event.ticker}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${severityStyle[event.severity]}`}>
                    {event.severity.toUpperCase()}
                  </span>
                </div>
                <h4 className="font-semibold text-sm leading-snug">{event.headline}</h4>
              </div>
            </div>
            <p className="text-xs opacity-70 leading-relaxed mb-4">{event.detail}</p>

            {/* Domino chain */}
            <div>
              <p className="text-xs opacity-40 uppercase tracking-wider mb-2">Domino Cascade →</p>
              <div className="space-y-2">
                {event.cascades.map((c, j) => (
                  <div key={j} className="flex items-start gap-3 rounded-lg bg-black/25 px-3 py-2 border border-white/5">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-mono font-bold text-white/80">
                        {j + 1}.
                      </span>
                      <span className={`text-xs font-mono font-bold ${directionColor[c.direction]}`}>
                        {directionIcon[c.direction]} {c.ticker}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{c.impact}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DominoMap({ ticker, signals = [] }: { ticker: string; signals?: Signal[] }) {
  const [data, setData] = useState<DominoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [politicalData, setPoliticalData] = useState<Record<string, PoliticalActivity>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/domino?ticker=${ticker}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        // Fetch political data for all tickers in the map
        const tickers = d.nodes?.map((n: RippleNode) => n.ticker).join(',');
        if (tickers) {
          const polRes = await fetch(`/api/political?tickers=${tickers}`);
          if (polRes.ok) setPoliticalData(await polRes.json());
        }
      }
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { load(); setSelected(null); }, [load]);

  // ── All hooks before any early returns ───────────────────────────────────
  const signalEdgeMap = useMemo(() => {
    const map: Record<string, 'contradiction' | 'warning' | 'alignment'> = {};
    const priority = { contradiction: 3, warning: 2, alignment: 1 };
    for (const s of signals) {
      const key1 = `${s.companyA}|${s.companyB}`;
      const key2 = `${s.companyB}|${s.companyA}`;
      for (const k of [key1, key2]) {
        const existing = map[k];
        if (!existing || priority[s.type] > priority[existing]) {
          map[k] = s.type;
        }
      }
    }
    return map;
  }, [signals]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.4, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.mx,
      y: dragStart.current.py + e.clientY - dragStart.current.my,
    });
  }, []);

  const stopDrag = useCallback(() => { dragging.current = false; }, []);
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm gap-2">
        <span className="w-4 h-4 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
        Building domino map...
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600 text-sm">
        No relation data. Run <code className="mx-1 text-xs bg-white/5 px-1 rounded">relations.sql</code> in Supabase first.
      </div>
    );
  }

  const getSignalEdgeColor = (from: string, to: string): string | null => {
    const sig = signalEdgeMap[`${from}|${to}`] ?? signalEdgeMap[`${to}|${from}`];
    if (sig === 'contradiction') return '#ef4444';
    if (sig === 'warning') return '#f59e0b';
    if (sig === 'alignment') return '#10b981';
    return null;
  };

  const positions = layoutNodes(data.nodes);
  const selectedNode = data.nodes.find((n) => n.ticker === selected);

  // SVG-native transform: scale from center + pan
  // translate(cx*(1-z)+px, cy*(1-z)+py) scale(z) keeps the center fixed when pan=0
  const svgTransform = `translate(${CX * (1 - zoom) + pan.x} ${CY * (1 - zoom) + pan.y}) scale(${zoom})`;

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-4 text-xs text-gray-500">
        {[
          { color: 'bg-red-400', label: 'High risk' },
          { color: 'bg-yellow-400', label: 'Medium risk' },
          { color: 'bg-emerald-400', label: 'Opportunity' },
          { color: 'bg-violet-400', label: 'Competitor' },
          { color: 'bg-slate-500', label: 'Stable' },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${l.color}`} /> {l.label}
          </span>
        ))}
        {signals.length > 0 && (
          <>
            <span className="text-gray-700">|</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-400 rounded" /> Contradiction</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-yellow-400 rounded" /> Warning</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-emerald-400 rounded" /> Alignment</span>
          </>
        )}
        <span className="ml-auto text-gray-700 text-xs">Scroll to zoom · Drag to pan · Click for details</span>
      </div>

      {/* Map */}
      <div className="relative rounded-xl border border-white/8 bg-gradient-to-b from-[#0c0c1a] to-[#07070f] overflow-hidden">
        {/* Zoom controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
          {[
            { label: '+', action: () => setZoom((z) => Math.min(3, z + 0.2)) },
            { label: '−', action: () => setZoom((z) => Math.max(0.4, z - 0.2)) },
            { label: '⊙', action: resetView },
          ].map(({ label, action }) => (
            <button
              key={label}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); action(); }}
              className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 text-sm font-mono leading-none flex items-center justify-center transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', cursor: dragging.current ? 'grabbing' : 'grab' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
        >
          <defs>
            <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g transform={svgTransform}>
            <ellipse cx={CX} cy={CY} rx={280} ry={230} fill="url(#bg-glow)" />
            {[140, 220].map((r) => (
              <circle key={r} cx={CX} cy={CY} r={r}
                fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3,7" />
            ))}

            {data.edges.map((edge, i) => {
              const from = positions[edge.from];
              const to = positions[edge.to];
              if (!from || !to) return null;
              const active = selected === edge.from || selected === edge.to;
              const sigColor = getSignalEdgeColor(edge.from, edge.to);
              return (
                <FlowingEdge key={i}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  color={sigColor ?? edgeColor(edge)}
                  strength={active ? Math.min(edge.strength + 25, 100) : sigColor ? Math.min(edge.strength + 15, 100) : edge.strength}
                  animated={active || !!sigColor || data.triggerChange < -3}
                />
              );
            })}

            {data.nodes.map((node) => {
              const pos = positions[node.ticker];
              if (!pos) return null;
              return (
                <NodeCircle key={node.ticker} node={node} pos={pos}
                  selected={selected === node.ticker}
                  onClick={() => setSelected(selected === node.ticker ? null : node.ticker)}
                  hasPolitical={!!politicalData[node.ticker]}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="mt-3 p-3 rounded-xl border border-white/10 bg-white/3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-white text-sm">{selectedNode.ticker}</span>
            <div className="flex items-center gap-3 text-xs">
              {selectedNode.riskScore > 40 && (
                <span className="text-red-400">⚠ Risk {selectedNode.riskScore}/100</span>
              )}
              {selectedNode.opportunityScore > 40 && (
                <span className="text-emerald-400">↑ Opportunity {selectedNode.opportunityScore}</span>
              )}
              <span className={selectedNode.changePercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {selectedNode.changePercentage >= 0 ? '+' : ''}{selectedNode.changePercentage.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="space-y-1">
            {data.edges
              .filter((e) => e.from === selectedNode.ticker || e.to === selectedNode.ticker)
              .map((e, i) => (
                <p key={i} className="text-xs text-gray-500 leading-relaxed">
                  <span className="text-gray-300 font-mono">{e.from} → {e.to}</span>
                  {e.description && ` — ${e.description}`}
                </p>
              ))}
          </div>

          {/* Signals involving this node */}
          {(() => {
            const nodeSignals = signals.filter(
              (s) => s.companyA === selectedNode.ticker || s.companyB === selectedNode.ticker
            );
            if (!nodeSignals.length) return null;
            const sigColor: Record<Signal['type'], string> = {
              contradiction: 'text-red-400 border-red-500/30 bg-red-500/8',
              warning: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/8',
              alignment: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/8',
            };
            return (
              <div className="mt-3 pt-2 border-t border-white/8 space-y-1.5">
                <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">AI Signals</p>
                {nodeSignals.map((s) => (
                  <div key={s.id} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${sigColor[s.type]}`}>
                    <span className="text-xs font-mono font-bold shrink-0">
                      {s.companyA} × {s.companyB}
                    </span>
                    <span className="text-xs opacity-80 leading-relaxed">{s.summary}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Political trades for selected node */}
      {selectedNode && politicalData[selectedNode.ticker] && (() => {
        const pol = politicalData[selectedNode.ticker];
        const fmtAmount = (low: number | null, high: number | null) =>
          low ? `$${(low/1000).toFixed(0)}K–$${((high??low)/1000).toFixed(0)}K` : 'undisclosed';
        return (
          <div className="mt-3 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🏛</span>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                Congressional Activity — {selectedNode.ticker}
              </span>
              <span className="ml-auto text-xs text-gray-600">
                {pol.buyCount} buy · {pol.sellCount} sell (last 7 days)
              </span>
            </div>
            <div className="space-y-1.5">
              {pol.recentTrades.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-xs rounded-lg bg-white/3 px-3 py-2">
                  <span className={`font-mono font-bold shrink-0 ${t.action === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.action === 'buy' ? '▲ BUY' : '▼ SELL'}
                  </span>
                  <span className="text-gray-300 truncate">{t.politician}</span>
                  {t.committee && <span className="text-gray-600 truncate hidden sm:block">{t.committee}</span>}
                  <span className="ml-auto text-gray-500 shrink-0">{fmtAmount(t.amount_low, t.amount_high)}</span>
                  <span className="text-gray-700 shrink-0">{t.trade_date}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <EventPanel key={ticker} ticker={ticker} />
    </div>
  );
}
