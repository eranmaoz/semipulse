import { supabase } from './supabase';
import { Company, Signal } from '@/types';

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('ticker');

  if (error || !data) return [];

  const companies = await Promise.all(
    data.map(async (row) => {
      const { count } = await supabase
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .or(`company_a.eq.${row.ticker},company_b.eq.${row.ticker}`);

      return {
        id: row.id,
        ticker: row.ticker,
        name: row.name,
        sector: row.sector,
        riskLevel: row.risk_level as Company['riskLevel'],
        lastUpdated: row.last_updated,
        signalCount: count ?? 0,
      } satisfies Company;
    })
  );

  return companies;
}

export async function fetchSignals(ticker?: string): Promise<Signal[]> {
  let query = supabase
    .from('signals')
    .select('*')
    .order('timestamp', { ascending: false });

  if (ticker) {
    query = query.or(`company_a.eq.${ticker},company_b.eq.${ticker}`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    companyA: row.company_a,
    companyB: row.company_b,
    type: row.type as Signal['type'],
    summary: row.summary,
    detail: row.detail,
    confidence: row.confidence,
    timestamp: row.timestamp,
    sources: row.sources ?? [],
  }));
}

export async function saveSignal(signal: Signal): Promise<void> {
  const { error } = await supabase.from('signals').upsert({
    id: signal.id,
    company_a: signal.companyA,
    company_b: signal.companyB,
    type: signal.type,
    summary: signal.summary,
    detail: signal.detail,
    confidence: signal.confidence,
    sources: signal.sources,
    timestamp: signal.timestamp,
  });

  if (error) console.error('[db] saveSignal error:', error.message);
}
