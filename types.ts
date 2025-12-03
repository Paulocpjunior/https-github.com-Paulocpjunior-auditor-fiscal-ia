
export interface Anomaly {
  type: 'error' | 'warning' | 'info';
  severity: 'critical' | 'high' | 'medium' | 'low';
  code: string;
  field?: string;
  message: string;
  expected?: string;
  found?: string;
  legalBasis?: string;
}

export interface AnalyzedNcm {
  code: string;
  descriptionInDocument?: string;
  officialDescription?: string;
  status: 'valid' | 'invalid' | 'unknown' | 'divergent';
  analysis: string;
}

export interface DetectedRates {
  icms?: number;
  iss?: number;
  pis?: number;
  cofins?: number;
  ipi?: number;
}

export interface TaxEntity {
  name: string;
  cnpj: string;
  municipalRegistration?: string;
  stateRegistration?: string;
  address?: string;
  uf?: string;
}

export interface TaxValidation {
  name: string; // e.g. "ISS", "ICMS"
  rateFound?: number;
  baseFound?: number;
  valueFound?: number;
  valueCalculated?: number;
  status: 'ok' | 'divergent' | 'warning' | 'info';
  comment: string;
}

export interface AuditResult {
  // New structured entities
  provider: TaxEntity;
  taker: TaxEntity;
  
  documentDate: string;
  documentNumber?: string;
  documentValue?: number;

  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  
  analyzedNcms?: AnalyzedNcm[]; 
  anomalies: Anomaly[];
  recommendations: string[];
  
  // New detailed tax audit
  taxValidations: TaxValidation[];

  detectedRates?: DetectedRates; 
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
  ipi?: number;
  providerRegime?: TaxRegime;
  takerRegime?: TaxRegime;
  anexo?: string; 
  revenue12Mo?: number; 
}
