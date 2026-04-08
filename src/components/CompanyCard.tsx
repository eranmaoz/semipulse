'use client';

import { Company } from '@/types';

const riskColors = {
  low: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
  medium: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
  high: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
  critical: 'text-red-400 border-red-400/30 bg-red-400/10',
};

const riskDot = {
  low: 'bg-emerald-400',
  medium: 'bg-yellow-400',
  high: 'bg-orange-400',
  critical: 'bg-red-400',
};

interface Props {
  company: Company;
  onClick: (company: Company) => void;
  isSelected: boolean;
  onLoadTranscript: (ticker: string) => void;
  loadingTranscript: boolean;
  transcriptLoaded: boolean;
  transcriptError?: string;
}

export default function CompanyCard({
  company,
  onClick,
  isSelected,
  onLoadTranscript,
  loadingTranscript,
  transcriptLoaded,
  transcriptError,
}: Props) {
  return (
    <div
      className={`w-full text-left p-4 rounded-lg border transition-all duration-200 ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <button className="w-full text-left" onClick={() => onClick(company)}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-lg font-bold text-white font-mono">{company.ticker}</span>
            <p className="text-xs text-gray-400 mt-0.5">{company.name}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded border font-medium ${riskColors[company.riskLevel]}`}>
            {company.riskLevel.toUpperCase()}
          </span>
        </div>

        <p className="text-xs text-gray-500 mb-3">{company.sector}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${riskDot[company.riskLevel]}`} />
            <span className="text-xs text-gray-400">
              {company.signalCount} signal{company.signalCount !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-gray-600">Updated {company.lastUpdated}</span>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onLoadTranscript(company.ticker); }}
        disabled={loadingTranscript}
        className={`w-full mt-3 py-1.5 rounded text-xs font-medium transition-colors ${
          transcriptLoaded
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
            : transcriptError
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {loadingTranscript ? (
          <span className="flex items-center justify-center gap-1.5">
            <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
            Loading...
          </span>
        ) : transcriptLoaded ? (
          '✓ Transcript loaded'
        ) : transcriptError ? (
          '✕ No transcript'
        ) : (
          '↓ Load transcript'
        )}
      </button>
    </div>
  );
}
