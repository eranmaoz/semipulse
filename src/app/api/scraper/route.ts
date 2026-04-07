import { NextRequest, NextResponse } from 'next/server';

// Placeholder scraper — in production this would use Playwright + SEC EDGAR API
// Think of it as a "test" that runs every morning: if a new 10-K/10-Q is found → trigger the pipeline
export async function POST(req: NextRequest) {
  const { ticker } = await req.json();

  // Simulate fetching from SEC EDGAR
  await new Promise((r) => setTimeout(r, 800));

  const mockReports: Record<string, { title: string; date: string; excerpt: string }> = {
    NVDA: {
      title: 'NVIDIA 10-Q Q3 FY2025',
      date: '2024-11-20',
      excerpt:
        'Data center revenue of $18.4B, up 112% YoY. Demand for Hopper and Blackwell architectures significantly exceeds supply. Working with supply chain to increase production capacity.',
    },
    ASML: {
      title: 'ASML Q3 2024 Quarterly Report',
      date: '2024-10-16',
      excerpt:
        'Net bookings of €2.6B, below expectations. EUV order pushouts from key customers into 2026. Revising 2025 EUV shipment guidance down 10-15 units.',
    },
    TSM: {
      title: 'TSMC Q4 2024 Earnings Release',
      date: '2025-01-16',
      excerpt:
        'Revenue of NT$868.5B, up 39% YoY. CoWoS advanced packaging capacity to double in 2025. N2 process on track for H2 2025 volume production.',
    },
  };

  const report = mockReports[ticker?.toUpperCase()];
  if (!report) {
    return NextResponse.json({ error: `No data found for ticker: ${ticker}` }, { status: 404 });
  }

  return NextResponse.json({ ticker, report, fetchedAt: new Date().toISOString() });
}
