
export interface Anomaly {
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  code: string;
  field?: string;
  message: string;
  expected?: string;
  found?: string;
}

export interface AuditResult {
  companyName?: string;
  documentDate?: string;
  takerCnpj?: string;
  takerName?: string;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  anomalies: Anomaly[];
  recommendations: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  sources?: GroundingSource[];
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export type TaxRegime = 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real' | 'MEI' | 'Isento/Imune';

export interface UserTaxRates {
  icms?: number;
  iss?: number;
  pis?: number;
  cofins?: number;
  providerRegime?: TaxRegime;
  takerRegime?: TaxRegime;
}
