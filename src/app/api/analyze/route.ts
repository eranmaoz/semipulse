import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { AnalyzeRequest, Signal } from '@/types';
import { saveSignal } from '@/lib/db';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const isSupabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_supabase');

const SYSTEM_PROMPT = `You are SemiPulse AI, a financial analyst specializing in supply chain intelligence.
You receive statements from multiple companies and must identify ALL meaningful signals between them.

For every significant relationship you find, classify it as:
- CONTRADICTION: data from one company conflicts with another (demand vs capacity mismatch, etc.)
- ALIGNMENT: multiple companies confirm the same trend
- WARNING: indirect signals suggesting future risk

Return ONLY a JSON array. Each element must match this exact structure:
{
  "companyA": "TICKER1",
  "companyB": "TICKER2",
  "type": "contradiction" | "alignment" | "warning",
  "summary": "one-line headline (max 10 words)",
  "detail": "2-3 sentence analysis explaining the signal",
  "confidence": <number 0-100>
}

Return only the signals that are genuinely meaningful. Minimum 1, maximum one per company pair.`;

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const { sources } = body;

    if (!sources || sources.length < 2) {
      return NextResponse.json({ error: 'At least 2 sources are required' }, { status: 400 });
    }

    const sourcesText = sources
      .map((s, i) => `--- SOURCE ${i + 1}: ${s.company} ---\n${s.text}`)
      .join('\n\n');

    const userPrompt = `Analyze these ${sources.length} company statements and identify all meaningful supply chain signals between them:\n\n${sourcesText}\n\nReturn a JSON array of signals.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed: {
      companyA: string;
      companyB: string;
      type: string;
      summary: string;
      detail: string;
      confidence: number;
    }[] = JSON.parse(cleaned);

    const signals: Signal[] = parsed.map((p) => ({
      id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      companyA: p.companyA,
      companyB: p.companyB,
      type: p.type as Signal['type'],
      summary: p.summary,
      detail: p.detail,
      confidence: p.confidence,
      timestamp: new Date().toISOString(),
      sources: sources
        .filter((s) => s.company === p.companyA || s.company === p.companyB)
        .map((s) => `${s.company} filing`),
    }));

    if (isSupabaseConfigured) {
      await Promise.all(signals.map(saveSignal));
    }

    // ── High-Confidence Anomaly detection ─────────────────────────────────
    // If supply chain warning exists AND political BUY for same ticker → anomaly
    const anomalies: Signal[] = [];
    if (isSupabaseConfigured) {
      const warningTickers = signals
        .filter((s) => s.type === 'warning' || s.type === 'contradiction')
        .flatMap((s) => [s.companyA, s.companyB]);

      if (warningTickers.length) {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const { data: polTrades } = await sb
          .from('political_trades')
          .select('ticker, politician, party, committee, action, amount_low, trade_date')
          .in('ticker', warningTickers)
          .eq('action', 'buy')
          .gte('trade_date', since.toISOString().split('T')[0]);

        for (const trade of polTrades ?? []) {
          const matchingWarning = signals.find(
            (s) => (s.type === 'warning' || s.type === 'contradiction') &&
              (s.companyA === trade.ticker || s.companyB === trade.ticker)
          );
          if (!matchingWarning) continue;

          const anomaly: Signal = {
            id: `anomaly-${trade.ticker}-${Date.now()}`,
            companyA: trade.ticker,
            companyB: 'CONGRESS',
            type: 'political_insight',
            summary: `⚠ High-Confidence Anomaly: ${trade.ticker} — supply warning + congressional buy`,
            detail: `${trade.politician} (${trade.party ?? '?'}) purchased ${trade.ticker} on ${trade.trade_date} while supply chain analysis flags a warning for this ticker. This divergence between smart-money political action and negative supply signals warrants close monitoring.`,
            confidence: 91,
            timestamp: new Date().toISOString(),
            sources: [`capitoltrades.com`, ...matchingWarning.sources],
          };
          anomalies.push(anomaly);
          await saveSignal(anomaly);
        }
      }
    }

    return NextResponse.json({ signals: [...signals, ...anomalies], rawAnalysis: cleaned });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
