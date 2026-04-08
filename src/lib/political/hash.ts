import crypto from 'crypto';

/**
 * Dedup hash: md5(politician_name + ticker + transaction_date)
 * Stable across re-fetches — same trade never inserted twice.
 */
export function tradeHash(politician: string, ticker: string, transactionDate: string): string {
  return crypto
    .createHash('md5')
    .update(`${politician.toLowerCase().trim()}|${ticker.toUpperCase()}|${transactionDate}`)
    .digest('hex');
}
