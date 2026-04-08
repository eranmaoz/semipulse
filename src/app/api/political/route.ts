import { NextRequest, NextResponse } from 'next/server';
import { PoliticalDataService } from '@/lib/political/PoliticalDataService';

const MONITORED_TICKERS = ['NVDA', 'TSM', 'ASML', 'MU', 'AVGO', 'AMAT', 'LRCX', 'MRVL'];

// GET /api/political?tickers=NVDA,TSM  → recent trades grouped by ticker
export async function GET(req: NextRequest) {
  const tickerParam = req.nextUrl.searchParams.get('tickers');
  const tickers = tickerParam ? tickerParam.split(',') : MONITORED_TICKERS;

  try {
    const svc = PoliticalDataService.create();
    const grouped = await svc.getRecent(tickers, 7);
    return NextResponse.json(grouped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/political/sync  → trigger a fresh fetch from provider + upsert
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tickers: string[] = body.tickers ?? MONITORED_TICKERS;

  try {
    const svc = PoliticalDataService.create();
    const { inserted, trades } = await svc.sync(tickers);
    return NextResponse.json({ inserted, total: trades.length, tickers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
