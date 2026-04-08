/**
 * Quiver Quantitative provider
 * Docs: https://api.quiverquant.com/
 * Free tier: 50 req/day, congressional trading included
 *
 * To get a key: https://www.quiverquant.com/signup
 * Add to .env.local: QUIVER_API_KEY=your_key_here
 */

import { PoliticalProvider, PoliticalTrade } from '../types';
import { tradeHash } from '../hash';

const BASE = 'https://api.quiverquant.com/beta';

// ── Quiver response shape ─────────────────────────────────────────────────────

interface QuiverTrade {
  Ticker:          string;
  Representative:  string;
  Transaction:     string;   // 'Purchase' | 'Sale (Full)' | 'Sale (Partial)' | 'Exchange'
  Range:           string;   // '$1,001 - $15,000'
  Date:            string;   // 'YYYY-MM-DD' or 'MM/DD/YYYY'
  ReportDate:      string;
  Party:           string;   // 'Democrat' | 'Republican' | 'Independent'
  State:           string;
  Chamber:         string;   // 'Senate' | 'House'
  Committee:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeDate(raw: string): string {
  if (!raw) return '';
  // Handle MM/DD/YYYY → YYYY-MM-DD
  if (raw.includes('/')) {
    const [m, d, y] = raw.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return raw.split('T')[0]; // already ISO
}

function normalizeAction(raw: string): PoliticalTrade['action'] {
  const s = raw.toLowerCase();
  if (s.includes('purchase')) return 'buy';
  if (s.includes('sale'))     return 'sell';
  return 'exchange';
}

function normalizeParty(raw: string): PoliticalTrade['party'] {
  const s = raw?.toLowerCase() ?? '';
  if (s.startsWith('d')) return 'D';
  if (s.startsWith('r')) return 'R';
  if (s.startsWith('i')) return 'I';
  return null;
}

/** Parse "$1,001 - $15,000" → [1001, 15000] */
function parseRange(raw: string): [number | null, number | null] {
  if (!raw) return [null, null];
  const nums = raw.replace(/[$,\s]/g, '').split('-').map(Number);
  return [nums[0] || null, nums[1] || null];
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class QuiverProvider implements PoliticalProvider {
  name = 'quiver';

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      'Accept': 'application/json',
      'X-CSRFToken': this.apiKey,
      'Authorization': `Token ${this.apiKey}`,
    };
  }

  /** Fetch trades for a single ticker from both chambers */
  private async fetchTicker(ticker: string): Promise<QuiverTrade[]> {
    const url = `${BASE}/live/congresstrading?ticker=${ticker}`;
    const res = await fetch(url, { headers: this.headers() });

    if (res.status === 401 || res.status === 403) {
      throw new Error('Quiver API key invalid or missing. Set QUIVER_API_KEY in .env.local');
    }
    if (!res.ok) return [];

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async fetchTrades(tickers: string[]): Promise<PoliticalTrade[]> {
    const results: PoliticalTrade[] = [];

    for (const ticker of tickers) {
      try {
        const raw = await this.fetchTicker(ticker);

        for (const r of raw) {
          const transactionDate = normalizeDate(r.Date);
          if (!transactionDate) continue;

          const [amountLow, amountHigh] = parseRange(r.Range);

          results.push({
            tradeHash:       tradeHash(r.Representative, ticker, transactionDate),
            ticker:          ticker.toUpperCase(),
            politician:      r.Representative?.trim() ?? 'Unknown',
            party:           normalizeParty(r.Party),
            chamber:         r.Chamber?.toLowerCase() === 'senate' ? 'senate' : 'house',
            committee:       r.Committee?.trim() || null,
            state:           r.State?.trim() || null,
            action:          normalizeAction(r.Transaction),
            amountLow,
            amountHigh,
            transactionDate,
            disclosureDate:  normalizeDate(r.ReportDate) || null,
            source:          'quiver',
            sourceUrl:       `https://www.quiverquant.com/congresstrading/trading/${encodeURIComponent(r.Representative)}`,
          });
        }

        // Rate limit — 50 req/day free tier, space them out
        await new Promise((r) => setTimeout(r, 300));
      } catch (err) {
        console.error(`[QuiverProvider] ${ticker}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return results;
  }
}
