
import { GoogleGenAI, Type } from "@google/genai";
import type { AuditResult, ChatMessage, GroundingSource } from '../types';
import type { CompanyData } from './cnpjService';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const auditResponseSchema = {
  type: Type.OBJECT,
  properties: {
    companyName: {
      type: Type.STRING,
      description: "The name of the company that issued the document (emitter/prestador)."
    },
    documentDate: {
      type: Type.STRING,
      description: "The emission date of the fiscal document in ISO 8601 format."
    },
    takerCnpj: {
        type: Type.STRING,
        description: "The CNPJ of the service taker or recipient (tomador/destinatário), if available."
    },
    takerName: {
      type: Type.STRING,
      description: "The name of the service taker or recipient (tomador/destinatário), if available."
    },
    riskScore: {
      type: Type.NUMBER,
      description: "A risk score from 0 (no risk) to 100 (critical risk)."
    },
    riskLevel: {
      type: Type.STRING,
      description: "The overall risk level, one of: 'low', 'medium', 'high', 'critical'."
    },
    summary: {
        type: Type.STRING,
        description: "A brief one-sentence summary of the audit findings in Portuguese."
    },
    anomalies: {
      type: Type.ARRAY,
      description: "A list of identified anomalies or inconsistencies in the document.",
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: "Type of anomaly: 'error', 'warning', or 'info'." },
          severity: { type: Type.STRING, description: "Severity level: 'critical', 'high', 'medium', or 'low'." },
          code: { type: Type.STRING, description: "A unique code for the rule violation, e.g., 'ICMS_BASE_001'." },
          field: { type: Type.STRING, description: "The specific XML/document field related to the anomaly, if applicable." },
          message: { type: Type.STRING, description: "A detailed description of the anomaly in Portuguese." },
          expected: { type: Type.STRING, description: "The expected value or state." },
          found: { type: Type.STRING, description: "The value found in the document." },
        },
        required: ["type", "severity", "code", "message"]
      }
    },
    recommendations: {
      type: Type.ARRAY,
      description: "A list of actionable recommendations in Portuguese to fix the issues.",
      items: {
        type: Type.STRING
      }
    }
  },
  required: ["riskScore", "riskLevel", "summary", "anomalies", "recommendations", "companyName", "documentDate"]
};


export async function analyzeDocument(
    fileContent: string, 
    fileName: string, 
    companyName?: string | null, 
    documentDate?: string | null, 
    takerCnpj?: string | null, 
    takerName?: string | null,
    officialEmitterData?: CompanyData | null,
    officialTakerData?: CompanyData | null
): Promise<AuditResult> {
  const model = "gemini-2.5-flash";

  // Format official data for the prompt if available
  const officialEmitterStr = officialEmitterData 
    ? `\n    - DADOS OFICIAIS DO EMISSOR (Receita Federal/API): Razão Social: "${officialEmitterData.razao_social}", Situação: "${officialEmitterData.situacao_cadastral}", CNAE: "${officialEmitterData.cnae_fiscal_descricao}", UF: "${officialEmitterData.uf}".`
    : '';

  const officialTakerStr = officialTakerData
    ? `\n    - DADOS OFICIAIS DO TOMADOR (Receita Federal/API): Razão Social: "${officialTakerData.razao_social}", Situação: "${officialTakerData.situacao_cadastral}".`
    : '';

  const prompt = `
    Você é um auditor fiscal especialista no sistema tributário brasileiro. Analise o seguinte conteúdo de um documento fiscal brasileiro (que pode ser o conteúdo de um arquivo XML ou o texto extraído de um arquivo PDF) e identifique todas as inconsistências, erros de cálculo, e retenções obrigatórias ausentes.

    Contexto do Documento (Extraído):
    - Nome do arquivo: "${fileName}"
    - Nome da empresa emissora: "${companyName || 'Não extraído'}"
    - Data de emissão: "${documentDate || 'Não extraída'}"
    - CNPJ do tomador/destinatário: "${takerCnpj || 'Não extraído'}"
    - Nome do tomador/destinatário: "${takerName || 'Não extraído'}"
    ${officialEmitterStr}${officialTakerStr}

    Conteúdo do documento:
    \`\`\`
    ${fileContent}
    \`\`\`

    Siga estas regras estritamente:
    1.  Se o conteúdo for texto extraído de um PDF, interprete os dados da melhor forma possível.
    2.  Extraia e retorne os metadados (companyName, documentDate, takerCnpj, takerName) baseados no conteúdo do arquivo.
    3.  **CRÍTICO: Validação Cadastral**: Se foram fornecidos "DADOS OFICIAIS" acima, compare-os com os dados dentro do documento XML/PDF. 
        - Se a Razão Social do documento for muito diferente da oficial, gere um alerta (Warning).
        - Se a Situação Cadastral oficial não for "ATIVA", gere um erro (Error) grave.
        - Se a atividade (CNAE) oficial não for compatível com os itens/serviços da nota, gere um alerta.
    4.  Verifique a validade de campos chave como CNPJ, Chave de Acesso, NCM, CFOP.
    5.  Valide todos os cálculos de impostos (ICMS, IPI, PIS, COFINS, ISS).
    6.  Lembre-se da regra crítica do STF: O ICMS deve ser EXCLUÍDO da base de cálculo do PIS/COFINS.
    7.  Identifique retenções na fonte necessárias (IRRF, CSLL, INSS).
    8.  Atribua um 'riskScore' (0-100) e 'riskLevel'.
    9.  Responda estritamente no formato JSON especificado, em português brasileiro.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: auditResponseSchema,
        temperature: 0.2
      },
    });
    
    const jsonText = response.text.trim();
    const parsedResult = JSON.parse(jsonText) as AuditResult;
    if (parsedResult.takerCnpj === "") {
        delete parsedResult.takerCnpj;
    }
    if (parsedResult.takerName === "") {
        delete parsedResult.takerName;
    }
    return parsedResult;
  } catch (error) {
    console.error("Error parsing Gemini response:", error);
    throw new Error("Failed to get a valid analysis from the AI. The response might be malformed.");
  }
}

const createSystemInstruction = (auditResult: AuditResult | null): string => {
    if (!auditResult) {
        return 'Você é um assistente especialista em tributação brasileira. Responda às perguntas dos usuários de forma clara, concisa e informativa. Baseie-se no seu conhecimento sobre NFe, NFSe, CTe, ICMS, ISS, PIS, COFINS e outras regras fiscais do Brasil. Responda em português.';
    }

    const anomaliesSummary = auditResult.anomalies.map(a => `- ${a.message} (Gravidade: ${a.severity})`).join('\n');

    return `Você é um assistente especialista em tributação brasileira. O usuário acabou de auditar um documento fiscal.
Responda às perguntas do usuário com base nos resultados desta auditoria. Seja direto e use o contexto fornecido.
Se a pergunta não for sobre a auditoria, use seu conhecimento geral sobre tributação no Brasil. Responda sempre em português.

--- CONTEXTO DA AUDITORIA ---
Empresa Emitente: ${auditResult.companyName || 'Não informado'}
Tomador do Serviço/Destinatário: ${auditResult.takerName || 'Não informado'} (CNPJ: ${auditResult.takerCnpj || 'Não informado'})
Data do Documento: ${auditResult.documentDate ? new Date(auditResult.documentDate).toLocaleDateString('pt-BR') : 'Não informada'}
Nível de Risco: ${auditResult.riskLevel} (Pontuação: ${auditResult.riskScore}/100)
Resumo: ${auditResult.summary}
Anomalias Encontradas:
${anomaliesSummary.length > 0 ? anomaliesSummary : 'Nenhuma anomalia encontrada.'}
Recomendações:
${auditResult.recommendations.length > 0 ? auditResult.recommendations.map(r => `- ${r}`).join('\n') : 'Nenhuma recomendação.'}
--- FIM DO CONTEXTO ---
`;
};


export async function getChatResponse(history: ChatMessage[], newMessage: string, auditResult: AuditResult | null): Promise<{ text: string; sources: GroundingSource[] }> {
  const needsFreshInfo = /notícia|recente|últimas|hoje|agora|lei atual|legislação mais nova/i.test(newMessage);

  if (needsFreshInfo) {
    return getGroundedChatResponse(newMessage);
  } else {
    return getStandardChatResponse(history, newMessage, auditResult);
  }
}

async function getStandardChatResponse(history: ChatMessage[], newMessage: string, auditResult: AuditResult | null): Promise<{ text: string; sources: GroundingSource[] }> {
    const model = 'gemini-2.5-flash';
    const systemInstruction = createSystemInstruction(auditResult);

    const contents = [
      ...history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }],
      })),
      { role: 'user', parts: [{ text: newMessage }] }
    ];

    try {
        const response = await ai.models.generateContent({
            model,
            contents,
            config: {
                systemInstruction: systemInstruction,
            },
        });

        return { text: response.text, sources: [] };
    } catch (error) {
        console.error("Error getting chat response from Gemini:", error);
        throw new Error("Failed to get a response from the AI assistant.");
    }
}


async function getGroundedChatResponse(newMessage: string): Promise<{ text: string; sources: GroundingSource[] }> {
    const model = 'gemini-2.5-flash';
    const prompt = `Com base nas informações mais recentes da web, responda à seguinte pergunta sobre tributação brasileira: "${newMessage}"`;

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    const text = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: GroundingSource[] = groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is { uri: string; title: string } => web !== undefined && web.uri !== undefined && web.title !== undefined) || [];

    return { text, sources };
}
