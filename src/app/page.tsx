'use client';

import { useState } from 'react';
import CompanyCard from '@/components/CompanyCard';
import SignalCard from '@/components/SignalCard';
import AnalyzePanel from '@/components/AnalyzePanel';
import { MONITORED_COMPANIES, MOCK_SIGNALS } from '@/lib/mockData';
import { Company } from '@/types';

type Tab = 'signals' | 'analyze';

export default function Dashboard() {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('signals');

  const filteredSignals = selectedCompany
    ? MOCK_SIGNALS.filter(
        (s) => s.companyA === selectedCompany.ticker || s.companyB === selectedCompany.ticker
      )
    : MOCK_SIGNALS;

  const totalSignals = MOCK_SIGNALS.length;
  const contradictions = MOCK_SIGNALS.filter((s) => s.type === 'contradiction').length;
  const warnings = MOCK_SIGNALS.filter((s) => s.type === 'warning').length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Top Nav */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              SP
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">SemiPulse AI</h1>
              <p className="text-xs text-gray-500 mt-0.5">Semiconductor Supply Chain Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-400">Live · T1 2025</span>
            </div>
            <div className="text-xs text-gray-600 font-mono">MVP v0.1</div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Monitored Companies', value: MONITORED_COMPANIES.length, color: 'text-white' },
            { label: 'Active Signals', value: totalSignals, color: 'text-white' },
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
          {/* Sidebar */}
          <div className="col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs text-gray-400 uppercase tracking-wider">Watchlist</h2>
              {selectedCompany && (
                <button
                  onClick={() => setSelectedCompany(null)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-2">
              {MONITORED_COMPANIES.map((company) => (
                <CompanyCard
                  key={company.id}
                  company={company}
                  onClick={setSelectedCompany}
                  isSelected={selectedCompany?.id === company.id}
                />
              ))}
            </div>
          </div>

          {/* Main Panel */}
          <div className="col-span-3">
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b border-white/10 pb-0">
              {(['signals', 'analyze'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'text-white border-blue-500'
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  {tab === 'signals' ? `Signal Feed (${filteredSignals.length})` : '⚡ AI Analysis'}
                </button>
              ))}
            </div>

            {activeTab === 'signals' && (
              <div className="space-y-3">
                {filteredSignals.length === 0 ? (
                  <div className="text-center py-12 text-gray-600">
                    No signals for {selectedCompany?.ticker}
                  </div>
                ) : (
                  filteredSignals.map((signal) => (
                    <SignalCard key={signal.id} signal={signal} />
                  ))
                )}
              </div>
            )}

            {activeTab === 'analyze' && <AnalyzePanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
