
import { GoogleGenAI, Type } from "@google/genai";
import type { AuditResult, ChatMessage, GroundingSource, UserTaxRates } from '../types';
import type { CompanyData } from './cnpjService';
import { fetchNcmData } from './ncmService';

const getAiClient = () => {
    if (!process.env.API_KEY) {
        throw new Error("API Key is missing. Please configure the API_KEY environment variable.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Define sub-schemas for clarity
const taxEntitySchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "Razão Social completa" },
        cnpj: { type: Type.STRING, description: "CNPJ formatado" },
        municipalRegistration: { type: Type.STRING, description: "Inscrição Municipal (IM)" },
        stateRegistration: { type: Type.STRING, description: "Inscrição Estadual (IE)" },
        address: { type: Type.STRING, description: "Endereço completo (Logradouro, número, bairro, cidade)" },
        uf: { type: Type.STRING, description: "Sigla do Estado (UF)" }
    },
    required: ["name", "cnpj"]
};

const taxValidationSchema = {
    type: Type.OBJECT,
    properties: {
        name: { type: Type.STRING, description: "Nome do imposto (ISS, ICMS, PIS...)" },
        rateFound: { type: Type.NUMBER, description: "Alíquota (%) encontrada no documento" },
        baseFound: { type: Type.NUMBER, description: "Base de cálculo encontrada" },
        valueFound: { type: Type.NUMBER, description: "Valor do imposto destacado" },
        valueCalculated: { type: Type.NUMBER, description: "Valor recalculado pela IA (Base * Alíquota)" },
        status: { type: Type.STRING, enum: ["ok", "divergent", "warning", "info"] },
        comment: { type: Type.STRING, description: "Explicação sobre a correção ou divergência" }
    },
    required: ["name", "status", "comment"]
};

const auditResponseSchema = {
  type: Type.OBJECT,
  properties: {
    provider: taxEntitySchema,
    taker: taxEntitySchema,
    documentDate: { type: Type.STRING },
    documentNumber: { type: Type.STRING, description: "Número da Nota Fiscal" },
    documentValue: { type: Type.NUMBER, description: "Valor total da nota/serviços" },
    
    riskScore: { type: Type.NUMBER },
    riskLevel: { type: Type.STRING },
    summary: { type: Type.STRING },
    
    detectedRates: {
       type: Type.OBJECT,
       properties: {
         icms: { type: Type.NUMBER },
         iss: { type: Type.NUMBER },
         pis: { type: Type.NUMBER },
         cofins: { type: Type.NUMBER },
         ipi: { type: Type.NUMBER }
       }
    },
    taxValidations: {
        type: Type.ARRAY,
        items: taxValidationSchema,
        description: "Lista de validação matemática e legal de cada imposto"
    },
    analyzedNcms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING },
          descriptionInDocument: { type: Type.STRING },
          officialDescription: { type: Type.STRING },
          status: { type: Type.STRING },
          analysis: { type: Type.STRING }
        }
      }
    },
    anomalies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          severity: { type: Type.STRING },
          code: { type: Type.STRING },
          field: { type: Type.STRING },
          message: { type: Type.STRING },
          expected: { type: Type.STRING },
          found: { type: Type.STRING },
          legalBasis: { type: Type.STRING }
        },
        required: ["type", "severity", "code", "message"]
      }
    },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["riskScore", "riskLevel", "summary", "anomalies", "recommendations", "provider", "taker", "documentDate", "taxValidations"]
};

function extractPotentialNcms(content: string): string[] {
  const regex = /(?:<NCM>|NCM[:\s]*|N\.C\.M[:\s]*)(\d{4}\.?\d{2}\.?\d{2})/gi;
  const matches = [...content.matchAll(regex)];
  return [...new Set(matches.map(m => m[1].replace(/\D/g, '')))];
}

export async function analyzeDocument(
    fileContent: string, 
    fileName: string, 
    images: string[] = [], 
    companyName?: string | null, 
    documentDate?: string | null, 
    takerCnpj?: string | null, 
    takerName?: string | null,
    officialEmitterData?: CompanyData | null,
    officialTakerData?: CompanyData | null,
    municipality?: string | null,
    userTaxRates?: UserTaxRates,
    validationWarnings: string[] = []
): Promise<AuditResult> {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  const potentialNcms = extractPotentialNcms(fileContent);
  const ncmPromises = potentialNcms.map(async (code) => {
    const data = await fetchNcmData(code);
    return { code, data };
  });
  const ncmResults = await Promise.all(ncmPromises);
  
  let ncmContextStr = "";
  if (ncmResults.length > 0) {
    ncmContextStr = "\n    - **CONSULTA API EXTERNA (NCM)**: Dados oficiais para comparação:\n";
    ncmResults.forEach(res => {
      if (res.data) {
        ncmContextStr += `      * ${res.code}: "${res.data.descricao}"\n`;
      } else {
        ncmContextStr += `      * ${res.code}: NÃO ENCONTRADO (Possível erro).\n`;
      }
    });
  }

  let userRatesStr = '';
  if (userTaxRates) {
      userRatesStr = `\n    - **PARÂMETROS MANUAIS DE ANÁLISE (SIMPLES NACIONAL E TAXAS)**: 
       Estes valores foram inseridos manualmente pelo auditor para conferência cruzada. Use-os para validar os valores do documento.
       Regimes: Prestador=${userTaxRates.providerRegime}, Tomador=${userTaxRates.takerRegime}`;

      if (userTaxRates.anexo) userRatesStr += `\n       Anexo Simples Nacional: ${userTaxRates.anexo}`;
      if (userTaxRates.revenue12Mo) userRatesStr += `\n       Receita Bruta 12 Meses: R$ ${userTaxRates.revenue12Mo} (Usar para cálculo de alíquota efetiva)`;
      
      const rates = [];
      if (userTaxRates.icms) rates.push(`ICMS: ${userTaxRates.icms}%`);
      if (userTaxRates.iss) rates.push(`ISS: ${userTaxRates.iss}%`);
      if (userTaxRates.pis) rates.push(`PIS: ${userTaxRates.pis}%`);
      if (userTaxRates.cofins) rates.push(`COFINS: ${userTaxRates.cofins}%`);
      if (userTaxRates.ipi) rates.push(`IPI: ${userTaxRates.ipi}%`);
      
      if (rates.length > 0) userRatesStr += `\n       Alíquotas Esperadas/Manuais: ${rates.join(', ')}`;
  }

  const validationWarningsStr = validationWarnings.length > 0
    ? `\n    - **ALERTA DE VALIDAÇÃO ESTRUTURAL (SISTEMA)**: 
       O pré-validador detectou os seguintes erros matemáticos que DEVEM ser reportados como anomalias (Tipo: error, Gravidade: high/critical):
       ${validationWarnings.map(w => `- ${w}`).join('\n')}`
    : '';

  const prompt = `
    Você é um auditor fiscal especialista. Analise o documento fiscal abaixo com rigor extremo.
    
    Contexto:
    - Arquivo: "${fileName}"
    - Metadados Pré-extraídos:
       * Prestador (Sugestão): "${companyName || 'N/A'}"
       * Data (Sugestão): "${documentDate || 'N/A'}"
       * Tomador (Sugestão CNPJ): "${takerCnpj || 'N/A'}"
    - Prefeitura/Layout: Atenção prioritária se for **Prefeitura de Guarulhos** (ou padrão GissOnline/ABRASF).
    ${validationWarningsStr}
    ${ncmContextStr}
    ${userRatesStr}

    Conteúdo (Texto/OCR):
    \`\`\`
    ${fileContent || "(Texto vazio, usar Visão Computacional)"}
    \`\`\`
    
    ATENÇÃO: Este documento pode ser um PDF escaneado ou com OCR de baixa qualidade.
    - Se o texto acima estiver ilegível, **CONFIE NAS IMAGENS** para ler os dados.
    - O objetivo principal é extrair DADOS COMPLETOS do PRESTADOR e TOMADOR e AUDITAR IMPOSTOS.

    INSTRUÇÕES DE EXTRAÇÃO:
    1. **Entidades (Prestador e Tomador)**:
       - Extraia Razão Social, CNPJ, Inscrição Municipal (IM), Inscrição Estadual (IE) e Endereço Completo de ambas as partes.
       - Se não encontrar explicitamente, procure em áreas comuns de cabeçalho.
    
    2. **Validação de Impostos (Tax Validations)**:
       - Para CADA imposto (ISS, ICMS, PIS, COFINS, IPI, CSLL, IRRF, INSS):
         a) Identifique se há Base de Cálculo, Alíquota e Valor Destacado.
         b) Calcule: (Base de Cálculo * Alíquota / 100).
         c) Compare o valor calculado com o valor encontrado.
         d) Se a diferença for maior que R$ 0,05, marque status 'divergent'.
         e) Se a alíquota for suspeita (ex: ISS > 5% ou < 2%), marque 'warning'.
         f) Se o imposto deveria existir (ex: ISS em serviço) e não está destacado, marque 'warning'.
       - Preencha o array 'taxValidations' com essa análise detalhada.

    3. **Regras Específicas**:
       - **Simples Nacional**: Se o prestador for optante (verifique menções no doc ou parâmetros manuais), PIS/COFINS não devem ser destacados (geralmente). Se houver destaque, gere alerta.
       - **Retenções**: Verifique se o ISS é retido (Tomador paga). Se 'IssRetido=Sim', o valor líquido deve descontar o ISS.
       - **Guarulhos/GissOnline**: Valide <CodigoTributacaoMunicipio> vs Descrição.

    Responda apenas no formato JSON especificado.
  `;

  const requestParts: any[] = [{ text: prompt }];

  if (images.length > 0) {
      images.forEach(base64Image => {
          requestParts.push({ inlineData: { mimeType: "image/jpeg", data: base64Image } });
      });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: requestParts }, 
      config: {
        responseMimeType: "application/json",
        responseSchema: auditResponseSchema,
        temperature: 0.1
      },
    });
    
    return JSON.parse(response.text.trim()) as AuditResult;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Falha na análise da IA.");
  }
}

export async function getCnaeDetails(cnae: string): Promise<string> {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";
  const prompt = `Analise o CNAE "${cnae}" para tributação.`;
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text;
}

export async function getChatResponse(history: ChatMessage[], msg: string, audit: AuditResult | null): Promise<any> {
    const ai = getAiClient();
    const model = 'gemini-2.5-flash';
    // Chat logic simplified for brevity as the main focus is Audit
    return { text: "Chat logic placeholder", sources: [] };
}
