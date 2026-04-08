import { type NextRequest, NextResponse } from 'next/server';

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const FMP_KEY = process.env.FMP_API_KEY;

// Simple in-memory cache — 60 second TTL
const cache: Record<string, { data: unknown; ts: number }> = {};
const TTL = 60_000;

export async function GET(req: NextRequest) {
  const symbols = req.nextUrl.searchParams.get('symbols');
  if (!symbols) {
    return NextResponse.json({ error: 'symbols required' }, { status: 400 });
  }
  if (!FMP_KEY) {
    return NextResponse.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });
  }

  const cacheKey = symbols;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data);
  }

  const res = await fetch(
    `${FMP_BASE}/quote?symbol=${symbols}&apikey=${FMP_KEY}`
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'FMP quote fetch failed' }, { status: 502 });
  }

  const data = await res.json();
  cache[cacheKey] = { data, ts: Date.now() };

  return NextResponse.json(data);
}
