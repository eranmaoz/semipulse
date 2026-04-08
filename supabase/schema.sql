-- SemiPulse AI — Database Schema
-- Run this in the Supabase SQL Editor (dashboard → SQL Editor → New query)

-- ─── Tables ───────────────────────────────────────────────────────────────────

create table if not exists companies (
  id           uuid primary key default gen_random_uuid(),
  ticker       text unique not null,
  name         text not null,
  sector       text not null,
  risk_level   text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  last_updated date not null default current_date,
  created_at   timestamptz not null default now()
);

create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  type        text not null,   -- '10-K' | '10-Q' | 'earnings_call'
  date        date not null,
  raw_text    text,
  pdf_url     text,
  created_at  timestamptz not null default now()
);

create table if not exists signals (
  id          text primary key,   -- 'sig-<timestamp>'
  company_a   text not null,
  company_b   text not null,
  type        text not null check (type in ('contradiction', 'alignment', 'warning')),
  summary     text not null,
  detail      text not null,
  confidence  integer not null check (confidence between 0 and 100),
  sources     text[] not null default '{}',
  timestamp   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists signals_company_a_idx on signals(company_a);
create index if not exists signals_company_b_idx on signals(company_b);
create index if not exists signals_timestamp_idx  on signals(timestamp desc);
create index if not exists documents_company_id_idx on documents(company_id);

-- ─── Seed Data ────────────────────────────────────────────────────────────────

insert into companies (ticker, name, sector, risk_level, last_updated) values
  ('NVDA', 'NVIDIA Corporation',    'Fabless Design',        'medium', '2025-01-15'),
  ('ASML', 'ASML Holding',          'Lithography Equipment', 'high',   '2025-01-14'),
  ('TSM',  'Taiwan Semiconductor',  'Foundry',               'low',    '2025-01-13')
on conflict (ticker) do nothing;

insert into signals (id, company_a, company_b, type, summary, detail, confidence, sources, timestamp) values
  (
    'sig-001', 'NVDA', 'ASML', 'contradiction',
    'Demand–Capacity Mismatch Detected',
    'NVIDIA projects 40% YoY demand growth for H100/H200 GPUs in Q2 2025, citing unprecedented AI infrastructure buildout. However, ASML reported a 12% decline in EUV machine bookings for the same period, suggesting foundry capacity expansion is not keeping pace with stated demand.',
    87,
    array['NVDA Q3 2024 Earnings Call', 'ASML Q4 2024 Order Book Report'],
    '2025-01-15T09:30:00Z'
  ),
  (
    'sig-002', 'TSM', 'NVDA', 'alignment',
    'CoWoS Capacity Expansion Aligns with NVIDIA Roadmap',
    'TSMC confirmed a 2× increase in CoWoS advanced packaging capacity for 2025, directly matching NVIDIA''s disclosed supply requirements for next-gen Blackwell architecture.',
    92,
    array['TSMC Q4 2024 Investor Day', 'NVDA GTC 2024 Keynote'],
    '2025-01-14T14:00:00Z'
  ),
  (
    'sig-003', 'ASML', 'TSM', 'warning',
    'EUV Delivery Delays May Impact N2 Ramp',
    'ASML flagged 6–8 week delays in High-NA EUV shipments. TSMC''s N2 process node, which depends on these systems, is scheduled for volume production in H2 2025. Slippage risk is elevated.',
    74,
    array['ASML Q3 2024 10-Q', 'TSMC Technology Symposium 2024'],
    '2025-01-13T11:15:00Z'
  )
on conflict (id) do nothing;
