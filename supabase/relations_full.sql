-- Full supply chain relations for all 8 monitored companies
-- Run after relations.sql (table must already exist)

insert into relations (from_ticker, to_ticker, type, strength, description) values

  -- ── NVDA supply chain (existing, safe to re-run) ──────────────────────────
  ('TSM',  'NVDA', 'supplier',    95, 'TSMC manufactures all NVIDIA GPUs on 4nm/3nm nodes'),
  ('ASML', 'TSM',  'supplier',    90, 'ASML EUV machines are required for TSMC advanced nodes'),
  ('AMAT', 'TSM',  'supplier',    70, 'Applied Materials provides CVD/PVD deposition equipment to TSMC'),
  ('LRCX', 'TSM',  'supplier',    65, 'Lam Research provides etch equipment for advanced nodes at TSMC'),
  ('MU',   'NVDA', 'supplier',    80, 'Micron supplies HBM3e memory stacked on NVIDIA H100/H200/B200 GPUs'),
  ('AVGO', 'NVDA', 'competitor',  60, 'Broadcom competes with custom AI accelerators (Google TPU, Meta MTIA)'),
  ('MRVL', 'NVDA', 'competitor',  55, 'Marvell designs custom AI silicon for hyperscalers (Amazon Trainium, Google Axion)'),

  -- ── Equipment makers supply into Micron ───────────────────────────────────
  ('AMAT', 'MU',   'supplier',    65, 'Applied Materials provides deposition and etch tools to Micron DRAM fabs'),
  ('LRCX', 'MU',   'supplier',    60, 'Lam Research etch and deposition systems critical for Micron HBM production'),
  ('ASML', 'MU',   'supplier',    75, 'ASML EUV lithography required for Micron 1-beta and 1-gamma DRAM nodes'),

  -- ── Equipment makers compete with each other ──────────────────────────────
  ('AMAT', 'LRCX', 'competitor',  70, 'Both sell deposition and etch equipment to the same fabs; compete for CVD/ALD and etch tool orders'),
  ('LRCX', 'AMAT', 'competitor',  70, 'Lam Research competes with Applied Materials across deposition, etch, and surface treatment tools'),

  -- ── ASML as sole-source supplier to all fabs ─────────────────────────────
  ('ASML', 'AMAT', 'customer',    35, 'ASML sources precision optics components and materials; minor supply relationship'),

  -- ── Broadcom and Marvell use TSM for manufacturing ───────────────────────
  ('TSM',  'AVGO', 'supplier',    80, 'TSMC manufactures Broadcom networking ASICs and custom AI accelerators on advanced nodes'),
  ('TSM',  'MRVL', 'supplier',    75, 'TSMC manufactures Marvell custom silicon and networking chips on 5nm/3nm'),

  -- ── Broadcom vs Marvell — custom silicon competitors ─────────────────────
  ('AVGO', 'MRVL', 'competitor',  65, 'Both compete for hyperscaler custom AI chip contracts (Google, Amazon, Meta, Microsoft)'),
  ('MRVL', 'AVGO', 'competitor',  65, 'Marvell directly competes with Broadcom for custom ASIC and networking silicon wins'),

  -- ── Micron supplies memory to networking/AI chip companies ───────────────
  ('MU',   'AVGO', 'supplier',    50, 'Micron supplies DRAM and HBM for Broadcom networking and AI accelerator platforms'),
  ('MU',   'MRVL', 'supplier',    45, 'Micron provides memory components for Marvell custom AI and storage solutions')

on conflict (from_ticker, to_ticker, type) do nothing;
