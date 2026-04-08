'use client';

import { Signal } from '@/types';

const typeConfig = {
  contradiction: {
    label: 'CONTRADICTION',
    color: 'text-red-400 border-red-400/30 bg-red-400/10',
    icon: '⚡',
    bar: 'bg-red-400',
  },
  alignment: {
    label: 'ALIGNMENT',
    color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    icon: '✓',
    bar: 'bg-emerald-400',
  },
  warning: {
    label: 'WARNING',
    color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
    icon: '▲',
    bar: 'bg-yellow-400',
  },
  political_insight: {
    label: 'POLITICAL INSIGHT',
    color: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    icon: '🏛',
    bar: 'bg-blue-400',
  },
};

export default function SignalCard({ signal }: { signal: Signal }) {
  const cfg = typeConfig[signal.type];
  const date = new Date(signal.timestamp).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="border border-white/10 bg-white/5 rounded-lg p-4 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded border font-mono font-bold ${cfg.color}`}>
            {cfg.icon} {cfg.label}
          </span>
          <span className="text-xs text-gray-500 font-mono">
            {signal.companyA} × {signal.companyB}
          </span>
        </div>
        <span className="text-xs text-gray-600">{date}</span>
      </div>

      <h3 className="text-white font-semibold mb-2">{signal.summary}</h3>
      <p className="text-sm text-gray-400 leading-relaxed mb-4">{signal.detail}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 mr-4">
          <span className="text-xs text-gray-500 w-20">Confidence</span>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${cfg.bar}`}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className="text-xs font-mono text-gray-400">{signal.confidence}%</span>
        </div>
      </div>

      {signal.sources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-xs text-gray-600">
            Sources: {signal.sources.join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}
