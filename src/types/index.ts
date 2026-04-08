export interface Company {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  lastUpdated: string;
  signalCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface Signal {
  id: string;
  companyA: string;
  companyB: string;
  type: 'contradiction' | 'alignment' | 'warning' | 'political_insight';
  summary: string;
  detail: string;
  confidence: number;
  timestamp: string;
  sources: string[];
}

export interface PoliticalTrade {
  politician: string;
  party: string | null;
  committee: string | null;
  action: 'buy' | 'sell' | 'exchange';
  amount_low: number | null;
  amount_high: number | null;
  trade_date: string;
}

export interface PoliticalActivity {
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  latestDate: string;
  recentTrades: PoliticalTrade[];
}

export interface AnalyzeRequest {
  sources: {
    company: string;
    text: string;
  }[];
}

export interface AnalyzeResponse {
  signal: Signal;
  rawAnalysis: string;
}
