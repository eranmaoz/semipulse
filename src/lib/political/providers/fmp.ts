/**
 * FMP (Financial Modeling Prep) provider — STUB
 * Requires Starter plan ($25/month) for congressional trading endpoints:
 *   GET /stable/senate-trading?symbol=NVDA
 *   GET /stable/house-disclosure?symbol=NVDA
 *
 * To activate: upgrade FMP plan, then swap QuiverProvider → FmpProvider
 * in PoliticalDataService constructor.
 */

import { PoliticalProvider, PoliticalTrade } from '../types';
import { tradeHash } from '../hash';

const FMP_BASE = 'https://financialmodelingprep.com/stable';

interface FmpSenateTrade {
  symbol:            string;
  senator:           string;
  transactionDate:   string;
  filingDate:        string;
  transactionType:   string;   // 'Purchase' | 'Sale'
  amount:            string;
  assetDescription:  string;
  comment:           string;
  link:              string;
}

interface FmpHouseTrade {
  symbol:           string;
  representative:   string;
  transactionDate:  string;
  filingDate:       string;
  type:             string;
  amount:           string;
  district:         string;
  link:             string;
}

function normalizeAction(raw: string): PoliticalTrade['action'] {
  const s = raw.toLowerCase();
  if (s.includes('purchase')) return 'buy';
  if (s.includes('sale'))     return 'sell';
  return 'exchange';
}

function parseAmount(raw: string): [number | null, number | null] {
  if (!raw) return [null, null];
  const nums = raw.replace(/[$,\s]/g, '').split('-').map(Number);
  return [nums[0] || null, nums[1] || null];
}

export class FmpProvider implements PoliticalProvider {
  name = 'fmp';

  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchSenate(ticker: string): Promise<PoliticalTrade[]> {
    const res = await fetch(`${FMP_BASE}/senate-trading?symbol=${ticker}&apikey=${this.apiKey}`);
    if (!res.ok) return [];
    const data: FmpSenateTrade[] = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((r) => {
      const [amountLow, amountHigh] = parseAmount(r.amount);
      return {
        tradeHash:       tradeHash(r.senator, ticker, r.transactionDate),
        ticker:          ticker.toUpperCase(),
        politician:      r.senator,
        party:           null,   // FMP doesn't provide party
        chamber:         'senate',
        committee:       null,
        state:           null,
        action:          normalizeAction(r.transactionType),
        amountLow,
        amountHigh,
        transactionDate: r.transactionDate,
        disclosureDate:  r.filingDate || null,
        source:          'fmp',
        sourceUrl:       r.link || null,
      };
    });
  }

  private async fetchHouse(ticker: string): Promise<PoliticalTrade[]> {
    const res = await fetch(`${FMP_BASE}/house-disclosure?symbol=${ticker}&apikey=${this.apiKey}`);
    if (!res.ok) return [];
    const data: FmpHouseTrade[] = await res.json();
    if (!Array.isArray(data)) return [];

    return data.map((r) => {
      const [amountLow, amountHigh] = parseAmount(r.amount);
      return {
        tradeHash:       tradeHash(r.representative, ticker, r.transactionDate),
        ticker:          ticker.toUpperCase(),
        politician:      r.representative,
        party:           null,
        chamber:         'house',
        committee:       null,
        state:           r.district || null,
        action:          normalizeAction(r.type),
        amountLow,
        amountHigh,
        transactionDate: r.transactionDate,
        disclosureDate:  r.filingDate || null,
        source:          'fmp',
        sourceUrl:       r.link || null,
      };
    });
  }

  async fetchTrades(tickers: string[]): Promise<PoliticalTrade[]> {
    const results: PoliticalTrade[] = [];
    for (const ticker of tickers) {
      const [senate, house] = await Promise.all([
        this.fetchSenate(ticker),
        this.fetchHouse(ticker),
      ]);
      results.push(...senate, ...house);
    }
    return results;
  }
}
