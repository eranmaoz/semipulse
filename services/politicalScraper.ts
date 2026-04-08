/**
 * SemiPulse — Political Scraper
 * Scrapes https://www.capitoltrades.com for congressional trades
 * on monitored semiconductor tickers.
 *
 * Run: npx tsx services/politicalScraper.ts
 * Cron: every 4h via GitHub Actions (see .github/workflows/political-scraper.yml)
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// ── Config ─────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PAGE_SIZE     = 20;
const MAX_PAGES     = 5;    // max 100 trades per ticker per run
const TICKERS       = ['NVDA', 'TSM', 'ASML', 'MU', 'AVGO', 'AMAT', 'LRCX', 'MRVL'];
const BFF_BASE      = 'https://bff.capitoltrades.com';
const CT_BASE       = 'https://www.capitoltrades.com';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawRow {
  politician:      string;
  party:           string | null;
  chamber:         'senate' | 'house';
  state:           string | null;
  ticker:          string;
  publishedDate:   string;
  transactionDate: string;
  owner:           string | null;
  action:          'buy' | 'sell' | 'exchange';
  amountRaw:       string;   // e.g. "1K–15K"
  amountLow:       number | null;
  amountHigh:      number | null;
  price:           string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Dedup hash: md5(politician_name + ticker + transaction_date + amount_raw)
 * Stable across re-runs — same trade never inserted twice.
 */
function buildHash(politician: string, ticker: string, transactionDate: string, amountRaw: string): string {
  return crypto
    .createHash('md5')
    .update(`${politician.toLowerCase().trim()}|${ticker}|${transactionDate}|${amountRaw}`)
    .digest('hex');
}

/**
 * Parse "13 Mar\n2026" or "13 Mar 2026" → "2026-03-13"
 */
function parseDate(raw: string): string {
  const cleaned = raw.replace(/\n/g, ' ').trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

/**
 * Parse "1K–15K" or "100K–250K" or "Undisclosed" → { low, high }
 * Capitol Trades uses K = thousands, M = millions
 */
function parseAmount(raw: string): { low: number | null; high: number | null } {
  if (!raw || raw.toLowerCase() === 'undisclosed') return { low: null, high: null };

  const multiplier = (s: string) => s.endsWith('M') ? 1_000_000 : s.endsWith('K') ? 1_000 : 1;
  const toNum = (s: string) => {
    const cleaned = s.replace(/[KMkm$,\s]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n * multiplier(s.toUpperCase().replace(/[^KM]/g, '') || '1');
  };

  // "1K–15K" or "1K-15K"
  const parts = raw.split(/[–\-]/);
  if (parts.length === 2) return { low: toNum(parts[0]), high: toNum(parts[1]) };

  // Single value
  const v = toNum(raw);
  return { low: v, high: v };
}

/**
 * Parse politician cell: "Gil Cisneros\nDemocratHouseCA"
 * → { name, party, chamber, state }
 */
function parsePolitician(raw: string): {
  name: string;
  party: 'D' | 'R' | 'I' | null;
  chamber: 'senate' | 'house';
  state: string | null;
} {
  const lines = raw.split('\n');
  const name = lines[0]?.trim() ?? raw;
  const meta = lines[1] ?? '';

  const partyMap: Record<string, 'D' | 'R' | 'I'> = {
    democrat: 'D', republican: 'R', independent: 'I',
  };
  const partyKey = Object.keys(partyMap).find((k) => meta.toLowerCase().includes(k));
  const party = partyKey ? partyMap[partyKey] : null;

  const chamber: 'senate' | 'house' = meta.toLowerCase().includes('senate') ? 'senate' : 'house';

  const stateMatch = meta.match(/[A-Z]{2}$/);
  const state = stateMatch?.[0] ?? null;

  return { name, party, chamber, state };
}

/** Normalize "BUY" / "SELL" / "Exchange" → action */
function parseAction(raw: string): 'buy' | 'sell' | 'exchange' {
  const s = raw.toLowerCase();
  if (s === 'buy')  return 'buy';
  if (s === 'sell') return 'sell';
  return 'exchange';
}

// ── Issuer resolver ────────────────────────────────────────────────────────────

async function resolveIssuerId(
  page: import('playwright').Page,
  ticker: string
): Promise<number | null> {
  try {
    const data = await page.evaluate(async (t) => {
      const res = await fetch(`https://bff.capitoltrades.com/issuers?search=${t}`);
      return res.json();
    }, ticker);

    const items: { _issuerId: number; issuerTicker: string }[] = data?.data ?? [];
    // Match exact ticker (e.g. "NVDA:US")
    const match = items.find((i) => i.issuerTicker?.startsWith(ticker + ':') || i.issuerTicker === ticker);
    return match?._issuerId ?? items[0]?._issuerId ?? null;
  } catch {
    return null;
  }
}

// ── Page scraper ───────────────────────────────────────────────────────────────

async function scrapePage(
  page: import('playwright').Page,
  issuerId: number,
  pageNum: number
): Promise<RawRow[]> {
  const url = `${CT_BASE}/trades?issuer=${issuerId}&pageSize=${PAGE_SIZE}&page=${pageNum}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  return page.evaluate(() => {
    return [...document.querySelectorAll('table tbody tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
      // Column order: Politician(0), Traded Issuer(1), Published(2),
      //               Transaction Date(3), Days(4), Owner(5), Type(6), Size(7), Price(8), Link(9)
      return {
        col0: cells[0] ?? '',   // politician
        col1: cells[1] ?? '',   // ticker/issuer
        col2: cells[2] ?? '',   // published
        col3: cells[3] ?? '',   // transaction date
        col5: cells[5] ?? '',   // owner
        col6: cells[6] ?? '',   // action
        col7: cells[7] ?? '',   // amount
        col8: cells[8] ?? '',   // price
      };
    }).filter((r) => r.col0 && r.col6 && r.col6 !== 'Goto trade detail page.');
  }).then((rawCells) => {
    return rawCells.map((r) => {
      const pol = parsePoliticianFromText(r.col0);
      const tickerFromCell = r.col1.split('\n').pop()?.replace(':US', '').trim() ?? '';
      const amount = parseAmountFromText(r.col7);
      const transactionDate = parseDateFromText(r.col3);
      return {
        politician:      pol.name,
        party:           pol.party,
        chamber:         pol.chamber,
        state:           pol.state,
        ticker:          tickerFromCell,
        publishedDate:   parseDateFromText(r.col2),
        transactionDate,
        owner:           r.col5 || null,
        action:          parseActionFromText(r.col6),
        amountRaw:       r.col7,
        amountLow:       amount.low,
        amountHigh:      amount.high,
        price:           r.col8 || null,
      } as RawRow;
    });

    // Helper fns evaluated in browser context need to be re-defined here
    // (page.evaluate runs in browser — we do post-processing in Node)
  });
}

// Re-export helpers for use inside .then() (Node context):
function parsePoliticianFromText(raw: string) { return parsePolitician(raw); }
function parseAmountFromText(raw: string) { return parseAmount(raw); }
function parseDateFromText(raw: string) { return parseDate(raw); }
function parseActionFromText(raw: string) { return parseAction(raw); }

// ── Main scraper ───────────────────────────────────────────────────────────────

async function scrapeAllTrades(
  page: import('playwright').Page,
  ticker: string
): Promise<RawRow[]> {
  console.log(`  [${ticker}] Resolving issuer ID...`);
  const issuerId = await resolveIssuerId(page, ticker);
  if (!issuerId) {
    console.log(`  [${ticker}] No issuer found — skipping`);
    return [];
  }
  console.log(`  [${ticker}] Issuer ID: ${issuerId}`);

  const all: RawRow[] = [];

  for (let p = 1; p <= MAX_PAGES; p++) {
    console.log(`  [${ticker}] Page ${p}/${MAX_PAGES}...`);
    const rows = await scrapePage(page, issuerId, p);
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;   // last page

    // Polite delay
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`  [${ticker}] ${all.length} trades scraped`);
  return all;
}

// ── Supabase upsert ────────────────────────────────────────────────────────────

async function upsertTrades(supabase: ReturnType<typeof createClient>, rows: RawRow[]): Promise<number> {
  if (!rows.length) return 0;

  const records = rows
    .filter((r) => r.politician && r.ticker && r.transactionDate)
    .map((r) => ({
      trade_hash:       buildHash(r.politician, r.ticker, r.transactionDate, r.amountRaw),
      ticker:           r.ticker,
      politician:       r.politician,
      party:            r.party,
      chamber:          r.chamber,
      state:            r.state,
      action:           r.action,
      // Store both numeric range fields AND original string for display
      amount_low:       r.amountLow,
      amount_high:      r.amountHigh,
      amount_raw:       r.amountRaw,       // "1K–15K" as-is for display
      transaction_date: r.transactionDate,
      disclosure_date:  r.publishedDate || null,
      source:           'capitoltrades',
      source_url:       `${CT_BASE}/trades`,
    }));

  const { data, error } = await supabase
    .from('political_trades')
    .upsert(records, {
      onConflict:      'trade_hash',
      ignoreDuplicates: true,           // skip if hash already exists
    })
    .select('id');

  if (error) {
    console.error(`  Supabase error: ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n[${new Date().toISOString()}] Political scraper starting...`);
  console.log(`Tickers: ${TICKERS.join(', ')}\n`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // Block images + fonts for speed
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,ico}', (r) => r.abort());

  let totalInserted = 0;

  for (const ticker of TICKERS) {
    try {
      const rows = await scrapeAllTrades(page, ticker);
      const inserted = await upsertTrades(supabase, rows);
      totalInserted += inserted;
      console.log(`  [${ticker}] ✓ ${inserted} new records inserted\n`);
    } catch (err) {
      console.error(`  [${ticker}] Error: ${err instanceof Error ? err.message : err}\n`);
    }

    // Delay between tickers to avoid rate limiting
    await new Promise((r) => setTimeout(r, 3000));
  }

  await browser.close();
  console.log(`[${new Date().toISOString()}] Done. Total inserted: ${totalInserted}`);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
