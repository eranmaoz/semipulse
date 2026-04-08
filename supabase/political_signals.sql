-- ─── Political Intelligence Layer ────────────────────────────────────────────
-- Run in Supabase SQL Editor

create table if not exists political_trades (
  id               uuid primary key default gen_random_uuid(),

  -- Dedup key: md5(politician_name + ticker + transaction_date + amount_raw)
  -- Prevents inserting the same trade twice across scraper runs
  trade_hash       text unique not null,

  ticker           text not null,
  politician       text not null,
  party            text check (party in ('D', 'R', 'I')),
  chamber          text check (chamber in ('senate', 'house')),
  state            text,
  committee        text,

  action           text not null check (action in ('buy', 'sell', 'exchange')),

  -- Numeric range for filtering/math (nullable if undisclosed)
  amount_low       bigint,
  amount_high      bigint,

  -- Original string as displayed on Capitol Trades ("1K–15K", "Undisclosed")
  amount_raw       text,

  transaction_date date not null,
  disclosure_date  date,

  source           text not null default 'capitoltrades',
  source_url       text,

  created_at       timestamptz not null default now()
);

-- Indexes
create index if not exists pt_ticker_idx   on political_trades(ticker);
create index if not exists pt_date_idx     on political_trades(transaction_date desc);
create index if not exists pt_action_idx   on political_trades(action);
create index if not exists pt_hash_idx     on political_trades(trade_hash);

-- Update signals table to allow political_insight type
alter table signals
  drop constraint if exists signals_type_check;

alter table signals
  add constraint signals_type_check
  check (type in ('contradiction', 'alignment', 'warning', 'political_insight'));
