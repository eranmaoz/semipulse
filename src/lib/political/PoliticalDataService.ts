/**
 * PoliticalDataService
 *
 * Orchestrates fetching + persisting congressional trading data.
 * Provider is injected — swap Quiver → FMP by changing one line.
 *
 * Usage (API route or worker):
 *   const svc = PoliticalDataService.create();
 *   const { inserted, trades } = await svc.sync(['NVDA', 'TSM', 'ASML']);
 */

import { createClient } from '@supabase/supabase-js';
import { PoliticalProvider, PoliticalTrade } from './types';
import { QuiverProvider } from './providers/quiver';
import { FmpProvider } from './providers/fmp';

export class PoliticalDataService {
  constructor(
    private readonly provider: PoliticalProvider,
    private readonly supabase: ReturnType<typeof createClient>
  ) {}

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(): PoliticalDataService {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ┌─ Switch provider here ──────────────────────────────────────────────┐
    // │  Quiver (free, active):                                             │
    const provider = new QuiverProvider(process.env.QUIVER_API_KEY ?? '');
    // │                                                                     │
    // │  FMP (paid, when ready):                                            │
    // │  const provider = new FmpProvider(process.env.FMP_API_KEY ?? '');  │
    // └─────────────────────────────────────────────────────────────────────┘

    return new PoliticalDataService(provider, supabase);
  }

  // ── Main sync ─────────────────────────────────────────────────────────────

  async sync(tickers: string[]): Promise<{ inserted: number; trades: PoliticalTrade[] }> {
    const trades = await this.provider.fetchTrades(tickers);
    if (!trades.length) return { inserted: 0, trades: [] };

    const rows = trades.map((t) => ({
      trade_hash:       t.tradeHash,
      ticker:           t.ticker,
      politician:       t.politician,
      party:            t.party,
      chamber:          t.chamber,
      committee:        t.committee,
      state:            t.state,
      action:           t.action,
      amount_low:       t.amountLow,
      amount_high:      t.amountHigh,
      transaction_date: t.transactionDate,
      disclosure_date:  t.disclosureDate,
      source:           t.source,
      source_url:       t.sourceUrl,
    }));

    const { data, error } = await this.supabase
      .from('political_trades')
      .upsert(rows, { onConflict: 'trade_hash', ignoreDuplicates: true })
      .select('id');

    if (error) throw new Error(`Supabase upsert failed: ${error.message}`);

    return { inserted: data?.length ?? 0, trades };
  }

  // ── Query helpers ─────────────────────────────────────────────────────────

  /** Get last N days of trades for given tickers, grouped by ticker */
  async getRecent(tickers: string[], days = 7): Promise<Record<string, PoliticalTrade[]>> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await this.supabase
      .from('political_trades')
      .select('*')
      .in('ticker', tickers)
      .gte('transaction_date', since.toISOString().split('T')[0])
      .order('transaction_date', { ascending: false });

    if (error) throw new Error(error.message);

    const grouped: Record<string, PoliticalTrade[]> = {};
    for (const row of data ?? []) {
      (grouped[row.ticker] ??= []).push({
        tradeHash:       row.trade_hash,
        ticker:          row.ticker,
        politician:      row.politician,
        party:           row.party,
        chamber:         row.chamber,
        committee:       row.committee,
        state:           row.state,
        action:          row.action,
        amountLow:       row.amount_low,
        amountHigh:      row.amount_high,
        transactionDate: row.transaction_date,
        disclosureDate:  row.disclosure_date,
        source:          row.source,
        sourceUrl:       row.source_url,
      });
    }
    return grouped;
  }
}
