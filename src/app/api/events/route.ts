import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a supply chain risk analyst. You receive financial data for a company and its supply chain relations.

Your job: identify TRIGGER EVENTS — specific data points in the financial reports that would cause a cascade effect through the supply chain.

Look for:
- Revenue miss or beat vs expectations
- Guidance cuts or raises
- Inventory build-up or depletion
- Demand surge or collapse
- Supply shortage signals
- Margin compression from cost increases

For each event you find, trace the DOMINO CASCADE: which companies downstream/upstream are affected, and how.

Return ONLY a JSON array. Each element:
{
  "ticker": "TICKER",
  "type": "revenue_miss" | "guidance_cut" | "demand_surge" | "supply_shortage" | "inventory_build" | "margin_compression",
  "headline": "short headline max 10 words",
  "detail": "2-3 sentences explaining the trigger and why it matters",
  "severity": "critical" | "high" | "medium",
  "cascades": [
    {
      "ticker": "AFFECTED_TICKER",
      "impact": "specific impact explanation (1-2 sentences)",
      "direction": "risk" | "opportunity" | "neutral"
    }
  ]
}

Only include genuinely significant events. Maximum 3 events. If no significant events, return [].`;

export async function POST(req: NextRequest) {
  try {
    const { ticker } = await req.json();
    if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

    const symbol = ticker.toUpperCase();

    // Fetch company and its relations
    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .eq('ticker', symbol)
      .single();

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    // Fetch latest documents for this company
    const { data: docs } = await supabase
      .from('documents')
      .select('raw_text, type, date')
      .eq('company_id', company.id)
      .order('date', { ascending: false })
      .limit(2);

    if (!docs?.length) {
      return NextResponse.json({
        error: 'No financial data found. Load transcripts first.',
        events: [],
      });
    }

    // Fetch supply chain relations
    const { data: relations } = await supabase
      .from('relations')
      .select('from_ticker, to_ticker, type, description')
      .or(`from_ticker.eq.${symbol},to_ticker.eq.${symbol}`);

    // Build context
    const financialContext = docs
      .map((d) => `[${d.type} — ${d.date}]\n${d.raw_text}`)
      .join('\n\n---\n\n');

    const relationsContext = relations?.length
      ? '\nSupply chain relations:\n' + relations
          .map((r) => `• ${r.from_ticker} → ${r.to_ticker} (${r.type}): ${r.description}`)
          .join('\n')
      : '';

    const userPrompt = `Analyze ${symbol} (${company.name}) financial data and identify trigger events with supply chain cascade effects.

${financialContext}
${relationsContext}

Return the JSON array of trigger events.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const events = JSON.parse(cleaned);

    return NextResponse.json({ events, ticker: symbol });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
