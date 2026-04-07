import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { AnalyzeRequest, Signal } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are SemiPulse AI, a financial analyst specializing in semiconductor supply chains.
Your job is to cross-reference statements from two different companies and identify:
1. CONTRADICTIONS — where the data from company A conflicts with company B (e.g., demand vs. capacity mismatch)
2. ALIGNMENTS — where both companies confirm the same trend
3. WARNINGS — where indirect signals suggest future risk

Respond ONLY in this exact JSON format:
{
  "type": "contradiction" | "alignment" | "warning",
  "summary": "one-line headline (max 10 words)",
  "detail": "2-3 sentence analysis explaining the signal",
  "confidence": <number 0-100>
}`;

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const { sourceA, sourceB } = body;

    if (!sourceA?.text || !sourceB?.text) {
      return NextResponse.json({ error: 'sourceA.text and sourceB.text are required' }, { status: 400 });
    }

    const userPrompt = `
Compare these two statements:

--- SOURCE A: ${sourceA.company} ---
${sourceA.text}

--- SOURCE B: ${sourceB.company} ---
${sourceB.text}

Identify the signal between them.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const raw = completion.choices[0].message.content ?? '{}';
    const parsed = JSON.parse(raw);

    const signal: Signal = {
      id: `sig-${Date.now()}`,
      companyA: sourceA.company,
      companyB: sourceB.company,
      type: parsed.type ?? 'warning',
      summary: parsed.summary ?? 'Analysis complete',
      detail: parsed.detail ?? '',
      confidence: parsed.confidence ?? 0,
      timestamp: new Date().toISOString(),
      sources: [`${sourceA.company} filing`, `${sourceB.company} filing`],
    };

    return NextResponse.json({ signal, rawAnalysis: raw });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
