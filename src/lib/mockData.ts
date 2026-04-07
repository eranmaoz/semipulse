import { Company, Signal } from '@/types';

export const MONITORED_COMPANIES: Company[] = [
  {
    id: '1',
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    sector: 'Fabless Design',
    lastUpdated: '2025-01-15',
    signalCount: 3,
    riskLevel: 'medium',
  },
  {
    id: '2',
    ticker: 'ASML',
    name: 'ASML Holding',
    sector: 'Lithography Equipment',
    lastUpdated: '2025-01-14',
    signalCount: 1,
    riskLevel: 'high',
  },
  {
    id: '3',
    ticker: 'TSM',
    name: 'Taiwan Semiconductor',
    sector: 'Foundry',
    lastUpdated: '2025-01-13',
    signalCount: 2,
    riskLevel: 'low',
  },
];

export const MOCK_SIGNALS: Signal[] = [
  {
    id: 'sig-001',
    companyA: 'NVDA',
    companyB: 'ASML',
    type: 'contradiction',
    summary: 'Demand–Capacity Mismatch Detected',
    detail:
      'NVIDIA projects 40% YoY demand growth for H100/H200 GPUs in Q2 2025, citing unprecedented AI infrastructure buildout. However, ASML reported a 12% decline in EUV machine bookings for the same period, suggesting foundry capacity expansion is not keeping pace with stated demand.',
    confidence: 87,
    timestamp: '2025-01-15T09:30:00Z',
    sources: ['NVDA Q3 2024 Earnings Call', 'ASML Q4 2024 Order Book Report'],
  },
  {
    id: 'sig-002',
    companyA: 'TSM',
    companyB: 'NVDA',
    type: 'alignment',
    summary: 'CoWoS Capacity Expansion Aligns with NVIDIA Roadmap',
    detail:
      'TSMC confirmed a 2× increase in CoWoS advanced packaging capacity for 2025, directly matching NVIDIA\'s disclosed supply requirements for next-gen Blackwell architecture.',
    confidence: 92,
    timestamp: '2025-01-14T14:00:00Z',
    sources: ['TSMC Q4 2024 Investor Day', 'NVDA GTC 2024 Keynote'],
  },
  {
    id: 'sig-003',
    companyA: 'ASML',
    companyB: 'TSM',
    type: 'warning',
    summary: 'EUV Delivery Delays May Impact N2 Ramp',
    detail:
      'ASML flagged 6–8 week delays in High-NA EUV shipments. TSMC\'s N2 process node, which depends on these systems, is scheduled for volume production in H2 2025. Slippage risk is elevated.',
    confidence: 74,
    timestamp: '2025-01-13T11:15:00Z',
    sources: ['ASML Q3 2024 10-Q', 'TSMC Technology Symposium 2024'],
  },
];

export const SAMPLE_NVIDIA_TEXT = `NVIDIA's data center revenue reached $18.4 billion in Q3 FY2025,
up 112% year over year. CEO Jensen Huang stated that demand for our Hopper and upcoming Blackwell
architecture GPUs far exceeds our current supply. We are working closely with our supply chain partners
to ramp production significantly in calendar year 2025. We expect data center revenue to grow at least
40% sequentially in Q4 FY2025.`;

export const SAMPLE_ASML_TEXT = `ASML reported net bookings of €2.6 billion in Q3 2024, below
analyst expectations of €4.0 billion. The company cited customer inventory digestion and push-outs
in EUV tool orders. CEO Peter Wennink noted that while the long-term secular demand for semiconductors
remains intact, several key customers have requested delivery deferrals into 2026. EUV shipment guidance
for 2025 was revised down by approximately 10-15 units.`;
