import { type NextRequest, NextResponse } from 'next/server';
import { fetchSignals } from '@/lib/db';
import { MOCK_SIGNALS } from '@/lib/mockData';

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_supabase');

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? undefined;

  if (!isSupabaseConfigured) {
    const signals = ticker
      ? MOCK_SIGNALS.filter((s) => s.companyA === ticker || s.companyB === ticker)
      : MOCK_SIGNALS;
    return NextResponse.json(signals);
  }

  try {
    const signals = await fetchSignals(ticker);
    if (signals.length === 0 && !ticker) {
      return NextResponse.json(MOCK_SIGNALS);
    }
    return NextResponse.json(signals);
  } catch {
    return NextResponse.json(MOCK_SIGNALS);
  }
}
