'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import CompanyCard from '@/components/CompanyCard';
import SignalCard from '@/components/SignalCard';
import DominoMap from '@/components/DominoMap';
import { MONITORED_COMPANIES } from '@/lib/mockData';
import { Company, Signal } from '@/types';

interface LoadedTranscript {
  ticker: string;
  quarter: number;
  year: number;
  fullText: string;
}

type Step = 'idle' | 'loading' | 'analyzing' | 'done';

export default function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>(MONITORED_COMPANIES);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({});
  const [transcripts, setTranscripts] = useState<Record<string, LoadedTranscript>>({});
  const [step, setStep] = useState<Step>('idle');
  const [analysisSignals, setAnalysisSignals] = useState<Signal[]>([]);
  const [analyzeError, setAnalyzeError] = useState('');

  const fetchSignals = useCallback(async (ticker?: string) => {
    const url = ticker ? `/api/signals?ticker=${ticker}` : '/api/signals';
    const res = await fetch(url);
    if (res.ok) setSignals(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      const [companiesRes] = await Promise.all([fetch('/api/companies'), fetchSignals()]);
      if (companiesRes.ok) setCompanies(await companiesRes.json());
    })();
  }, [fetchSignals]);

  const handleSelectCompany = async (company: Company) => {
    setSelectedCompany(company);
    await fetchSignals(company.ticker);
  };

  const loadTranscript = async (ticker: string): Promise<boolean> => {
    const res = await fetch('/api/scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });
    if (res.ok) {
      const data = await res.json();
      setTranscripts((prev) => ({ ...prev, [ticker]: data }));
      setTranscriptErrors((prev) => { const e = { ...prev }; delete e[ticker]; return e; });
      return true;
    } else {
      const err = await res.json().catch(() => ({ error: 'Failed to load' }));
      setTranscriptErrors((prev) => ({ ...prev, [ticker]: err.error ?? 'No data' }));
      return false;
    }
  };

  const handleLoadTranscript = async (ticker: string) => {
    setLoadingTicker(ticker);
    try { await loadTranscript(ticker); } finally { setLoadingTicker(null); }
  };

  const handleLoadAll = async () => {
    setLoadingAll(true);
    setStep('loading');
    try {
      for (const company of companies) {
        await loadTranscript(company.ticker);
        await new Promise((r) => setTimeout(r, 13000));
      }
    } finally {
      setLoadingAll(false);
      setStep('idle');
    }
  };

  const handleAnalyze = async () => {
    const sources = Object.values(transcripts).map((t) => ({ company: t.ticker, text: t.fullText }));
    if (sources.length < 2) return;

    setStep('analyzing');
    setAnalyzeError('');
    setAnalysisSignals([]);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Analysis failed');
      }
      const data = await res.json();
      setAnalysisSignals(data.signals ?? []);
      setStep('done');
      await fetchSignals(selectedCompany?.ticker);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Unknown error');
      setStep('idle');
    }
  };

  const preloadedSources = useMemo(
    () => Object.values(transcripts).map((t) => ({ company: t.ticker, text: t.fullText })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Object.keys(transcripts).sort().join(',')]
  );

  const loadedCount = Object.keys(transcripts).length;
  const contradictions = signals.filter((s) => s.type === 'contradiction').length;
  const warnings = signals.filter((s) => s.type === 'warning').length;

  // All signals to show (DB + fresh analysis)
  const allSignals = useMemo(() => {
    const ids = new Set(signals.map((s) => s.id));
    return [...analysisSignals.filter((s) => !ids.has(s.id)), ...signals];
  }, [signals, analysisSignals]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Top Nav */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">SP</div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">SemiPulse AI</h1>
              <p className="text-xs text-gray-500 mt-0.5">Semiconductor Supply Chain Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-400">Live</span>
            </div>
            <div className="text-xs text-gray-600 font-mono">MVP v0.2</div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Companies', value: companies.length, color: 'text-white' },
            { label: 'Active Signals', value: signals.length, color: 'text-white' },
            { label: 'Contradictions', value: contradictions, color: 'text-red-400' },
            { label: 'Warnings', value: warnings, color: 'text-yellow-400' },
          ].map((stat) => (
            <div key={stat.label} className="border border-white/10 bg-white/5 rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{stat.label}</p>
              <p className={`text-3xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-6">

          {/* ── Sidebar ── */}
          <div className="col-span-1 space-y-3">

            {/* Load All */}
            <button
              onClick={handleLoadAll}
              disabled={loadingAll}
              className="w-full py-2.5 rounded-lg text-xs font-semibold border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAll ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="w-3 h-3 border border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  Loading reports...
                </span>
              ) : `↓ Load All Reports (${companies.length})`}
            </button>

            {/* Analyze button — appears after loading */}
            {loadedCount >= 2 && (
              <button
                onClick={handleAnalyze}
                disabled={step === 'analyzing'}
                className="w-full py-2.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-gray-600 text-white transition-colors"
              >
                {step === 'analyzing' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing {loadedCount} reports...
                  </span>
                ) : (
                  `⚡ Run Analysis (${loadedCount} reports)`
                )}
              </button>
            )}

            {analyzeError && (
              <div className="p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs">{analyzeError}</div>
            )}

            {/* Watchlist */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs text-gray-400 uppercase tracking-wider">Watchlist</h2>
                {selectedCompany && (
                  <button onClick={() => { setSelectedCompany(null); fetchSignals(); }} className="text-xs text-blue-400 hover:text-blue-300">
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {companies.map((company) => (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    onClick={handleSelectCompany}
                    isSelected={selectedCompany?.id === company.id}
                    onLoadTranscript={handleLoadTranscript}
                    loadingTranscript={loadingTicker === company.ticker || loadingAll}
                    transcriptLoaded={!!transcripts[company.ticker]}
                    transcriptError={transcriptErrors[company.ticker]}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Main Panel ── */}
          <div className="col-span-3 space-y-6">

            {/* ── Domino Map ── */}
            <div className="border border-white/10 bg-white/3 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white">
                  🁣 Domino Effect
                  {selectedCompany && <span className="ml-2 text-blue-400 font-mono">{selectedCompany.ticker}</span>}
                </h2>
                {!selectedCompany && (
                  <p className="text-xs text-gray-600">Select a company to see the impact map</p>
                )}
              </div>
              {selectedCompany ? (
                <DominoMap ticker={selectedCompany.ticker} signals={allSignals} />
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-700 text-sm">
                  ← Select a company from the watchlist
                </div>
              )}
            </div>

            {/* ── Signals ── */}
            {allSignals.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white">
                    Signal Feed
                    <span className="ml-2 text-xs font-mono text-gray-500">{allSignals.length} signals</span>
                  </h2>
                  {step === 'done' && analysisSignals.length > 0 && (
                    <span className="text-xs text-emerald-400">✓ {analysisSignals.length} new signals from analysis</span>
                  )}
                </div>
                <div className="space-y-3">
                  {allSignals.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Empty state ── */}
            {allSignals.length === 0 && step !== 'analyzing' && (
              <div className="border border-white/8 rounded-xl p-8 text-center">
                <p className="text-gray-500 text-sm mb-2">No signals yet</p>
                <p className="text-gray-700 text-xs">
                  {loadedCount === 0
                    ? 'Click "↓ Load All Reports" to fetch financial data'
                    : loadedCount < 2
                    ? 'Load at least 2 companies to run analysis'
                    : 'Click "⚡ Run Analysis" to detect signals'}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
