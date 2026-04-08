import { type NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const FMP_KEY = process.env.FMP_API_KEY;
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomeRow {
  date: string;
  period: string;
  fiscalYear: string;
  revenue: number;
  grossProfit: number;
  grossProfitRatio: number;
  operatingIncome: number;
  netIncome: number;
  ebitda: number;
  researchAndDevelopmentExpenses: number;
  costOfRevenue: number;
}

interface QuoteRow {
  price: number;
  changePercentage: number;
  marketCap: number;
  yearHigh: number;
  yearLow: number;
  priceAvg50: number;
  volume: number;
}

// ─── Narrative builder ────────────────────────────────────────────────────────

function buildNarrative(ticker: string, inc: IncomeRow, prev: IncomeRow | null, q: QuoteRow): string {
  const fmt = (n: number) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toFixed(0)}`;

  const yoy = prev ? (((inc.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100).toFixed(1) : null;
  const gm = inc.grossProfitRatio ? (inc.grossProfitRatio * 100).toFixed(1) : null;
  const vs50 = q.priceAvg50 ? ((q.price / q.priceAvg50 - 1) * 100).toFixed(1) : null;

  const lines = [
    `${ticker} Financial Summary — ${inc.period ?? ''} FY${inc.fiscalYear ?? ''} (${inc.date})`,
    '',
    `Revenue: ${fmt(inc.revenue)}${yoy ? ` (${yoy}% YoY)` : ''}`,
    gm ? `Gross Profit: ${fmt(inc.grossProfit)} (${gm}% margin)` : `Gross Profit: ${fmt(inc.grossProfit)}`,
    `Operating Income: ${fmt(inc.operatingIncome)}`,
    `Net Income: ${fmt(inc.netIncome)}`,
    inc.ebitda ? `EBITDA: ${fmt(inc.ebitda)}` : '',
    inc.researchAndDevelopmentExpenses ? `R&D Spend: ${fmt(inc.researchAndDevelopmentExpenses)}` : '',
    '',
    `Current Stock Price: $${q.price.toFixed(2)} (${q.changePercentage >= 0 ? '+' : ''}${q.changePercentage.toFixed(2)}% today)`,
    `Market Cap: ${fmt(q.marketCap)}`,
    q.yearHigh && q.yearLow ? `52-week range: $${q.yearLow.toFixed(2)} – $${q.yearHigh.toFixed(2)}` : '',
    vs50 ? `Price vs 50-day MA: ${vs50}%` : '',
    q.volume ? `Volume: ${(q.volume / 1e6).toFixed(1)}M shares` : '',
  ];

  if (prev) {
    const costDelta = (((inc.costOfRevenue - prev.costOfRevenue) / Math.abs(prev.costOfRevenue)) * 100).toFixed(1);
    lines.push('', `Cost of Revenue change QoQ: ${costDelta}%`);
  }

  return lines.filter((l) => l !== undefined).join('\n').trim();
}

// ─── FMP fetcher ──────────────────────────────────────────────────────────────

async function fetchFromFMP(symbol: string): Promise<{ inc: IncomeRow; prev: IncomeRow | null; quote: QuoteRow } | null> {
  if (!FMP_KEY) return null;

  const [incRes, qRes] = await Promise.all([
    fetch(`${FMP_BASE}/income-statement?symbol=${symbol}&period=quarter&limit=2&apikey=${FMP_KEY}`),
    fetch(`${FMP_BASE}/quote?symbol=${symbol}&apikey=${FMP_KEY}`),
  ]);

  if (!incRes.ok || !qRes.ok) return null;

  const [incData, qData] = await Promise.all([incRes.json(), qRes.json()]);

  // FMP returns error as string when ticker not in free plan
  if (!Array.isArray(incData) || !incData.length) return null;
  if (!Array.isArray(qData) || !qData.length) return null;

  const raw = incData[0];
  if (typeof raw?.revenue !== 'number') return null; // premium-only response

  return {
    inc: incData[0] as IncomeRow,
    prev: incData[1] as IncomeRow ?? null,
    quote: qData[0] as QuoteRow,
  };
}

// ─── Alpha Vantage fetcher ────────────────────────────────────────────────────

async function fetchFromAV(symbol: string): Promise<{ inc: IncomeRow; prev: IncomeRow | null; quote: QuoteRow } | null> {
  if (!AV_KEY) return null;

  const [incRes, qRes] = await Promise.all([
    fetch(`https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${symbol}&apikey=${AV_KEY}`),
    fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_KEY}`),
  ]);

  if (!incRes.ok || !qRes.ok) return null;

  const [incData, qData] = await Promise.all([incRes.json(), qRes.json()]);

  const quarters: Record<string, string>[] = incData?.quarterlyReports ?? [];
  const annuals: Record<string, string>[] = incData?.annualReports ?? [];
  const gq = qData?.['Global Quote'];

  if (!gq?.['05. price']) return null;

  const toNum = (v: string | undefined) => parseFloat(v ?? '0') || 0;
  const price = toNum(gq['05. price']);
  const prevClose = toNum(gq['08. previous close']);
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  const quoteOnly: QuoteRow = {
    price,
    changePercentage: changePct,
    marketCap: 0,
    yearHigh: toNum(gq['03. high']),
    yearLow: toNum(gq['04. low']),
    priceAvg50: 0,
    volume: toNum(gq['06. volume']),
  };

  // Use annual if quarterly not available
  const reports = quarters.length ? quarters : annuals;

  // If no income data — return quote-only narrative
  if (!reports.length) {
    const narrative = [
      `${symbol} Market Data — ${gq['07. latest trading day']}`,
      '',
      `Current Stock Price: $${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% today)`,
      `Day range: $${quoteOnly.yearLow.toFixed(2)} – $${quoteOnly.yearHigh.toFixed(2)}`,
      `Volume: ${(quoteOnly.volume / 1e6).toFixed(1)}M shares`,
      '',
      'Note: Detailed income statement not available via free API for this ticker.',
    ].join('\n');

    return {
      inc: {
        date: gq['07. latest trading day'] ?? new Date().toISOString().split('T')[0],
        period: 'N/A', fiscalYear: String(new Date().getFullYear()),
        revenue: 0, grossProfit: 0, grossProfitRatio: 0,
        operatingIncome: 0, netIncome: 0, ebitda: 0,
        researchAndDevelopmentExpenses: 0, costOfRevenue: 0,
        _narrativeOverride: narrative,
      } as IncomeRow & { _narrativeOverride: string },
      prev: null,
      quote: quoteOnly,
    };
  }

  const mapRow = (r: Record<string, string>, i: number): IncomeRow => ({
    date: r.fiscalDateEnding ?? '',
    period: `Q${i + 1}`,
    fiscalYear: r.fiscalDateEnding?.slice(0, 4) ?? '',
    revenue: toNum(r.totalRevenue),
    grossProfit: toNum(r.grossProfit),
    grossProfitRatio: toNum(r.totalRevenue) ? toNum(r.grossProfit) / toNum(r.totalRevenue) : 0,
    operatingIncome: toNum(r.operatingIncome),
    netIncome: toNum(r.netIncome),
    ebitda: toNum(r.ebitda),
    researchAndDevelopmentExpenses: toNum(r.researchAndDevelopment),
    costOfRevenue: toNum(r.costOfRevenue),
  });

  return {
    inc: mapRow(reports[0], 0),
    prev: reports[1] ? mapRow(reports[1], 1) : null,
    quote: {
      price,
      changePercentage: changePct,
      marketCap: toNum(gq['09. change']), // AV free doesn't have marketCap
      yearHigh: toNum(gq['03. high']),
      yearLow: toNum(gq['04. low']),
      priceAvg50: 0,
      volume: toNum(gq['06. volume']),
    },
  };
}

// ─── Supabase cache check ─────────────────────────────────────────────────────

async function fetchFromCache(symbol: string): Promise<string | null> {
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', symbol)
    .single();

  if (!company) return null;

  const today = new Date().toISOString().split('T')[0];

  const { data: doc } = await supabase
    .from('documents')
    .select('raw_text, date')
    .eq('company_id', company.id)
    .eq('type', 'financial_summary')
    .gte('date', today) // only use if fetched today
    .order('date', { ascending: false })
    .limit(1)
    .single();

  return doc?.raw_text ?? null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { ticker } = await req.json();
  if (!ticker) return NextResponse.json({ error: 'ticker is required' }, { status: 400 });

  const symbol = ticker.toUpperCase();

  // 1. Check Supabase cache first — avoids burning API quota
  const cached = await fetchFromCache(symbol);
  if (cached) {
    return NextResponse.json({
      ticker: symbol,
      quarter: 'cached',
      year: new Date().getFullYear(),
      date: new Date().toISOString().split('T')[0],
      excerpt: cached.slice(0, 300) + '...',
      fullText: cached,
      fetchedAt: new Date().toISOString(),
      fromCache: true,
    });
  }

  // 2. Try FMP first, fallback to Alpha Vantage
  const data = (await fetchFromFMP(symbol)) ?? (await fetchFromAV(symbol));

  if (!data) {
    return NextResponse.json({ error: `No financial data available for ${symbol}` }, { status: 404 });
  }

  const { inc, prev, quote } = data;
  const narrative = (inc as IncomeRow & { _narrativeOverride?: string })._narrativeOverride
    ?? buildNarrative(symbol, inc, prev, quote);

  // Save to Supabase
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('ticker', symbol)
    .single();

  if (company) {
    await supabase.from('documents').upsert({
      company_id: company.id,
      type: 'financial_summary',
      date: inc.date,
      raw_text: narrative,
    });
  }

  return NextResponse.json({
    ticker: symbol,
    quarter: inc.period,
    year: inc.fiscalYear,
    date: inc.date,
    excerpt: narrative.slice(0, 300) + '...',
    fullText: narrative,
    fetchedAt: new Date().toISOString(),
  });
}
