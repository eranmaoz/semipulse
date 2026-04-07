'use client';

import { useState } from 'react';
import { Signal } from '@/types';
import SignalCard from './SignalCard';
import { SAMPLE_NVIDIA_TEXT, SAMPLE_ASML_TEXT } from '@/lib/mockData';

export default function AnalyzePanel() {
  const [companyA, setCompanyA] = useState('NVDA');
  const [textA, setTextA] = useState(SAMPLE_NVIDIA_TEXT);
  const [companyB, setCompanyB] = useState('ASML');
  const [textB, setTextB] = useState(SAMPLE_ASML_TEXT);
  const [result, setResult] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyze = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceA: { company: companyA, text: textA },
          sourceB: { company: companyB, text: textB },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const data = await res.json();
      setResult(data.signal);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Source A</label>
            <input
              value={companyA}
              onChange={(e) => setCompanyA(e.target.value)}
              className="text-xs font-mono bg-white/5 border border-white/10 rounded px-2 py-1 text-white w-20"
              placeholder="Ticker"
            />
          </div>
          <textarea
            value={textA}
            onChange={(e) => setTextA(e.target.value)}
            rows={6}
            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-gray-300 font-mono resize-none focus:outline-none focus:border-blue-500/50"
            placeholder="Paste earnings call transcript, 10-K excerpt..."
          />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Source B</label>
            <input
              value={companyB}
              onChange={(e) => setCompanyB(e.target.value)}
              className="text-xs font-mono bg-white/5 border border-white/10 rounded px-2 py-1 text-white w-20"
              placeholder="Ticker"
            />
          </div>
          <textarea
            value={textB}
            onChange={(e) => setTextB(e.target.value)}
            rows={6}
            className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-gray-300 font-mono resize-none focus:outline-none focus:border-blue-500/50"
            placeholder="Paste earnings call transcript, 10-K excerpt..."
          />
        </div>
      </div>

      <button
        onClick={analyze}
        disabled={loading || !textA || !textB}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-gray-600 disabled:cursor-not-allowed text-white"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing supply chain signal...
          </span>
        ) : (
          '⚡ Run Cross-Reference Analysis'
        )}
      </button>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && <SignalCard signal={result} />}
    </div>
  );
}
