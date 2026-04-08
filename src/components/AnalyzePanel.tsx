'use client';

import { useState, useEffect } from 'react';
import { Signal } from '@/types';
import SignalCard from './SignalCard';
import { SAMPLE_NVIDIA_TEXT, SAMPLE_ASML_TEXT } from '@/lib/mockData';

interface Source {
  company: string;
  text: string;
}

interface Props {
  onSignalSaved?: () => void;
  preloadedSources?: { company: string; text: string }[];
}

const DEFAULT_SOURCES: Source[] = [
  { company: 'NVDA', text: SAMPLE_NVIDIA_TEXT },
  { company: 'ASML', text: SAMPLE_ASML_TEXT },
];

export default function AnalyzePanel({ onSignalSaved, preloadedSources }: Props) {
  const [sources, setSources] = useState<Source[]>(DEFAULT_SOURCES);
  const [results, setResults] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preloadedSources && preloadedSources.length > 0) {
      setSources(preloadedSources);
    }
  }, [preloadedSources]);

  const updateSource = (index: number, field: keyof Source, value: string) => {
    setSources((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addSource = () => {
    setSources((prev) => [...prev, { company: '', text: '' }]);
  };

  const removeSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
  };

  const analyze = async () => {
    const filled = sources.filter((s) => s.text.trim() && s.company.trim());
    if (filled.length < 2) {
      setError('Need at least 2 sources with ticker and text');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: filled }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const data = await res.json();
      setResults(data.signals ?? []);
      onSignalSaved?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const canAnalyze = sources.filter((s) => s.text.trim() && s.company.trim()).length >= 2;

  return (
    <div className="space-y-4">
      {/* Source cards */}
      <div className="grid grid-cols-2 gap-4">
        {sources.map((source, index) => (
          <div key={index} className="relative">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-400 uppercase tracking-wider">
                Source {index + 1}
              </label>
              <input
                value={source.company}
                onChange={(e) => updateSource(index, 'company', e.target.value.toUpperCase())}
                className="text-xs font-mono bg-white/5 border border-white/10 rounded px-2 py-1 text-white w-20"
                placeholder="Ticker"
              />
              {sources.length > 2 && (
                <button
                  onClick={() => removeSource(index)}
                  className="ml-auto text-xs text-gray-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
            <textarea
              value={source.text}
              onChange={(e) => updateSource(index, 'text', e.target.value)}
              rows={6}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-gray-300 font-mono resize-none focus:outline-none focus:border-blue-500/50"
              placeholder="Paste earnings call transcript, 10-K excerpt..."
            />
          </div>
        ))}
      </div>

      {/* Add source button */}
      <button
        onClick={addSource}
        className="w-full py-2 rounded-lg text-sm text-gray-500 border border-dashed border-white/10 hover:border-white/20 hover:text-gray-300 transition-all"
      >
        + Add Source
      </button>

      {/* Analyze button */}
      <button
        onClick={analyze}
        disabled={loading || !canAnalyze}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-gray-600 disabled:cursor-not-allowed text-white"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Analyzing {sources.filter(s => s.text && s.company).length} sources...
          </span>
        ) : (
          `⚡ Run Cross-Reference Analysis (${sources.filter(s => s.text && s.company).length} sources)`
        )}
      </button>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            {results.length} signal{results.length !== 1 ? 's' : ''} found
          </p>
          {results.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      )}
    </div>
  );
}
