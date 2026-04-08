/**
 * SemiPulse — Political Intelligence Scraper
 * Scrapes capitoltrades.com for trades in our monitored semiconductor tickers.
 * Run hourly via: node workers/political-scraper.mjs
 * Or schedule with cron: 0 * * * * node /path/to/workers/political-scraper.mjs
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TICKERS = ['NVDA', 'TSM', 'ASML', 'MU', 'AVGO', 'AMAT', 'LRCX', 'MRVL'];

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE env vars. Copy .env.local values.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function tradeHash(politician, ticker, date, action, amountLow) {
  return crypto
    .createHash('md5')
    .update(`${politician}|${ticker}|${date}|${action}|${amountLow}`)
    .digest('hex');
}

/** Parse "$1,001 - $15,000" → [1001, 15000] */
function parseAmount(str) {
  if (!str) return [null, null];
  const nums = str.replace(/[$,]/g, '').split(/\s*[-–]\s*/);
  return [parseInt(nums[0]) || null, parseInt(nums[1]) || null];
}

/** Normalize "Purchase" / "Sale (Full)" etc → 'buy' | 'sell' | 'exchange' */
function normalizeAction(str) {
  const s = (str || '').toLowerCase();
  if (s.includes('purchase') || s.includes('buy')) return 'buy';
  if (s.includes('sale') || s.includes('sell'))    return 'sell';
  return 'exchange';
}

// ── Scraper ───────────────────────────────────────────────────────────────────

async function scrapeTicker(page, ticker) {
  const url = `https://www.capitoltrades.com/trades?asset=${ticker}&pageSize=20`;
  console.log(`  Fetching ${ticker}...`);

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for trade rows
  const rows = await page.$$eval('table tbody tr', (trs) =>
    trs.map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim());
      return cells;
    })
  ).catch(() => []);

  const trades = [];

  for (const cells of rows) {
    // Capitol Trades table columns (may shift — verify manually):
    // 0: Politician, 1: Party/State, 2: Committee, 3: Ticker, 4: Company,
    // 5: Action, 6: Amount, 7: Trade Date, 8: Filed Date
    if (cells.length < 8) continue;

    const politician = cells[0]?.split('\n')[0]?.trim();
    const committee  = cells[2]?.trim() || null;
    const action     = normalizeAction(cells[5]);
    const [amountLow, amountHigh] = parseAmount(cells[6]);
    const tradeDateRaw = cells[7]?.trim();
    const filedDateRaw = cells[8]?.trim();

    // Parse dates (format: "Jan 15, 2024" or "2024-01-15")
    const tradeDate = tradeDateRaw ? new Date(tradeDateRaw).toISOString().split('T')[0] : null;
    const filedDate = filedDateRaw ? new Date(filedDateRaw).toISOString().split('T')[0] : null;

    if (!politician || !tradeDate || tradeDate === 'Invalid Date') continue;

    // Extract party from "D • CA" style text
    const partyMatch = cells[1]?.match(/^([DRI])\s*[•·]/);
    const party = partyMatch?.[1] ?? null;

    trades.push({
      trade_hash: tradeHash(politician, ticker, tradeDate, action, amountLow),
      ticker,
      politician,
      party,
      committee,
      chamber: null, // enriched later if needed
      action,
      amount_low:  amountLow,
      amount_high: amountHigh,
      trade_date:  tradeDate,
      filed_date:  filedDate,
      source_url:  url,
    });
  }

  return trades;
}

// ── Signal generator ──────────────────────────────────────────────────────────

async function createPoliticalSignal(trade) {
  const amountStr = trade.amount_low
    ? `$${(trade.amount_low / 1000).toFixed(0)}K–$${(trade.amount_high / 1000).toFixed(0)}K`
    : 'undisclosed amount';

  const committee = trade.committee ? ` (${trade.committee})` : '';
  const summary = `${trade.politician}${committee} ${trade.action === 'buy' ? 'bought' : 'sold'} ${trade.ticker} — ${amountStr}`;

  const signalId = `pol-${trade.trade_hash.slice(0, 8)}`;

  await supabase.from('signals').upsert({
    id:        signalId,
    company_a: trade.ticker,
    company_b: 'CONGRESS',
    type:      'warning',
    summary,
    detail:    `Political trade detected: ${trade.politician} (${trade.party ?? '?'}) ${trade.action === 'buy' ? 'purchased' : 'sold'} ${trade.ticker} on ${trade.trade_date}. Amount: ${amountStr}. Filed: ${trade.filed_date ?? 'pending'}.`,
    confidence: 85,
    sources:   [`capitoltrades.com — ${trade.trade_date}`],
    timestamp: new Date(trade.trade_date).toISOString(),
  }, { onConflict: 'id' });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[${new Date().toISOString()}] Political scraper starting...`);

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  // Block images/fonts to speed up scraping
  await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', (r) => r.abort());

  let totalInserted = 0;

  for (const ticker of TICKERS) {
    try {
      const trades = await scrapeTicker(page, ticker);
      console.log(`  ${ticker}: found ${trades.length} trades`);

      if (!trades.length) continue;

      const { data, error } = await supabase
        .from('political_trades')
        .upsert(trades, { onConflict: 'trade_hash', ignoreDuplicates: true })
        .select('id');

      const inserted = data?.length ?? 0;
      totalInserted += inserted;
      console.log(`  ${ticker}: inserted ${inserted} new trades`);

      // Create signals for new trades in the last 7 days
      const recentTrades = trades.filter((t) => {
        const d = new Date(t.trade_date);
        return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
      });
      for (const trade of recentTrades) {
        await createPoliticalSignal(trade);
      }

      // Rate limit — be polite
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      console.error(`  ${ticker}: error — ${err.message}`);
    }
  }

  await browser.close();
  console.log(`[${new Date().toISOString()}] Done. ${totalInserted} new trades inserted.`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
