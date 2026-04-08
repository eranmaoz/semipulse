// ─── Canonical trade record (provider-agnostic) ───────────────────────────────

export interface PoliticalTrade {
  tradeHash: string;       // md5(politician + ticker + transactionDate)
  ticker: string;
  politician: string;
  party: 'D' | 'R' | 'I' | null;
  chamber: 'senate' | 'house';
  committee: string | null;
  state: string | null;
  action: 'buy' | 'sell' | 'exchange';
  amountLow: number | null;
  amountHigh: number | null;
  transactionDate: string;  // YYYY-MM-DD
  disclosureDate: string | null;
  source: string;
  sourceUrl: string | null;
}

// ─── Provider interface ───────────────────────────────────────────────────────
// To add FMP later: implement this interface and swap in PoliticalDataService

export interface PoliticalProvider {
  name: string;
  fetchTrades(tickers: string[]): Promise<PoliticalTrade[]>;
}
