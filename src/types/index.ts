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
  type: 'contradiction' | 'alignment' | 'warning';
  summary: string;
  detail: string;
  confidence: number;
  timestamp: string;
  sources: string[];
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
