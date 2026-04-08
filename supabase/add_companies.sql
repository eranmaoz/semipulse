-- Add NVIDIA supply chain companies
insert into companies (ticker, name, sector, risk_level, last_updated) values
  ('MU',   'Micron Technology',  'Memory (HBM)',           'medium', '2025-01-15'),
  ('AVGO', 'Broadcom Inc.',      'Networking ASICs',       'low',    '2025-01-15'),
  ('AMAT', 'Applied Materials',  'Deposition Equipment',   'medium', '2025-01-14'),
  ('LRCX', 'Lam Research',       'Etch Equipment',         'medium', '2025-01-14'),
  ('MRVL', 'Marvell Technology', 'Custom AI Silicon',      'low',    '2025-01-15')
on conflict (ticker) do nothing;
