import { type NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const FMP_KEY = process.env.FMP_API_KEY;

interface Relation {
  from_ticker: string;
  to_ticker: string;
  type: 'supplier' | 'customer' | 'competitor';
  strength: number;
  description: string;
}

interface Quote {
  symbol: string;
  price: number;
  changePercentage: number;
  marketCap: number;
}

interface RippleNode {
  ticker: string;
  tier: 0 | 1 | 2 | 3;
  role: 'trigger' | 'supplier' | 'customer' | 'competitor';
  riskScore: number;         // 0-100
  opportunityScore: number;  // 0-100
  changePercentage: number;
  relations: Relation[];
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const symbol = ticker.toUpperCase();

  // 1. Get all relations involving this ticker
  const { data: relations } = await supabase
    .from('relations')
    .select('*')
    .or(`from_ticker.eq.${symbol},to_ticker.eq.${symbol}`);

  if (!relations?.length) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  // 2. Collect tier-1 tickers (direct neighbors)
  const tier1Tickers = new Set<string>();
  relations.forEach((r: Relation) => {
    if (r.from_ticker !== symbol) tier1Tickers.add(r.from_ticker);
    if (r.to_ticker !== symbol) tier1Tickers.add(r.to_ticker);
  });

  // 2b. Fetch tier-2 relations (neighbors of tier-1 non-competitor nodes)
  const tier1SupplierCustomers = [...tier1Tickers].filter((t) =>
    relations.some(
      (r: Relation) =>
        (r.from_ticker === t || r.to_ticker === t) && r.type !== 'competitor'
    )
  );

  let tier2Relations: Relation[] = [];
  if (tier1SupplierCustomers.length) {
    const orFilter = tier1SupplierCustomers
      .map((t) => `from_ticker.eq.${t},to_ticker.eq.${t}`)
      .join(',');
    const { data } = await supabase.from('relations').select('*').or(orFilter);
    tier2Relations = (data ?? []).filter(
      (r: Relation) => r.from_ticker !== symbol && r.to_ticker !== symbol
    );
  }

  const allRelations = [...relations, ...tier2Relations];

  const tickers = new Set<string>([symbol]);
  allRelations.forEach((r: Relation) => {
    tickers.add(r.from_ticker);
    tickers.add(r.to_ticker);
  });

  // 3. Fetch live quotes for all tickers
  let quotes: Quote[] = [];
  if (FMP_KEY) {
    const res = await fetch(
      `${FMP_BASE}/quote?symbol=${[...tickers].join(',')}&apikey=${FMP_KEY}`
    );
    if (res.ok) quotes = await res.json();
  }

  const quoteMap: Record<string, Quote> = {};
  quotes.forEach((q) => { quoteMap[q.symbol] = q; });

  const triggerQuote = quoteMap[symbol];
  const triggerChange = triggerQuote?.changePercentage ?? 0;

  // 4. Build ripple nodes
  const nodes: RippleNode[] = [];

  // Trigger node (tier 0)
  nodes.push({
    ticker: symbol,
    tier: 0,
    role: 'trigger',
    riskScore: triggerChange < -5 ? 90 : triggerChange < -2 ? 60 : 20,
    opportunityScore: triggerChange > 3 ? 70 : 0,
    changePercentage: triggerChange,
    relations: allRelations.filter((r: Relation) => r.from_ticker === symbol || r.to_ticker === symbol),
  });

  tickers.forEach((t) => {
    if (t === symbol) return;

    const q = quoteMap[t];
    const change = q?.changePercentage ?? 0;

    const isDirect = tier1Tickers.has(t);

    // Role relative to trigger
    const asSupplier  = relations.find((r: Relation) => r.from_ticker === t && r.to_ticker === symbol && r.type === 'supplier');
    const asCustomer  = relations.find((r: Relation) => r.from_ticker === symbol && r.to_ticker === t && r.type === 'supplier');
    const asCompetitor = relations.find((r: Relation) =>
      (r.from_ticker === t || r.to_ticker === t) &&
      (r.from_ticker === symbol || r.to_ticker === symbol) &&
      r.type === 'competitor'
    );

    let role: RippleNode['role'] = 'supplier';
    let tier: RippleNode['tier'] = isDirect ? 1 : 2;

    if (asCompetitor) role = 'competitor';
    else if (asCustomer) role = 'customer';
    else if (asSupplier) role = 'supplier';

    const rel = asSupplier ?? asCustomer ?? asCompetitor;
    const strength = rel?.strength ?? 50;
    const riskScore = triggerChange < -3
      ? Math.min(100, Math.abs(triggerChange) * strength / 10)
      : change < -3 ? 60 : 20;

    const opportunityScore = role === 'competitor' && triggerChange < -3 ? 65 : 0;

    nodes.push({
      ticker: t,
      tier,
      role,
      riskScore: Math.round(riskScore),
      opportunityScore,
      changePercentage: change,
      relations: allRelations.filter((r: Relation) => r.from_ticker === t || r.to_ticker === t),
    });
  });

  // 5. Build edges (deduplicated)
  const seenEdges = new Set<string>();
  const edges = allRelations
    .filter((r: Relation) => {
      const key = [r.from_ticker, r.to_ticker, r.type].join('|');
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    })
    .map((r: Relation) => ({
      from: r.from_ticker,
      to: r.to_ticker,
      type: r.type,
      strength: r.strength,
      description: r.description,
      risk: nodes.find((n) => n.ticker === r.from_ticker)?.riskScore ?? 0,
    }));

  return NextResponse.json({ nodes, edges, triggerChange });
}
