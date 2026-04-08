-- Supply chain relations table
create table if not exists relations (
  id           uuid primary key default gen_random_uuid(),
  from_ticker  text not null,
  to_ticker    text not null,
  type         text not null check (type in ('supplier', 'customer', 'competitor')),
  strength     integer not null default 50 check (strength between 1 and 100),
  description  text,
  created_at   timestamptz not null default now(),
  unique(from_ticker, to_ticker, type)
);

create index if not exists relations_from_idx on relations(from_ticker);
create index if not exists relations_to_idx on relations(to_ticker);

-- NVIDIA supply chain
-- Suppliers → NVDA
insert into relations (from_ticker, to_ticker, type, strength, description) values
  ('TSM',  'NVDA', 'supplier', 95, 'TSMC manufactures all NVIDIA GPUs on 4nm/3nm nodes'),
  ('ASML', 'TSM',  'supplier', 90, 'ASML EUV machines are required for TSMC advanced nodes'),
  ('AMAT', 'TSM',  'supplier', 70, 'Applied Materials provides CVD/PVD deposition equipment to TSMC'),
  ('LRCX', 'TSM',  'supplier', 65, 'Lam Research provides etch equipment for advanced nodes'),
  ('MU',   'NVDA', 'supplier', 80, 'Micron supplies HBM3 memory stacked on NVIDIA H100/H200 GPUs'),
  ('AVGO', 'NVDA', 'competitor', 60, 'Broadcom competes with custom AI accelerators (Google TPU, Meta MTIA)'),
  ('MRVL', 'NVDA', 'competitor', 55, 'Marvell designs custom AI silicon for hyperscalers')
on conflict (from_ticker, to_ticker, type) do nothing;
