
import { GoogleGenAI, Type } from "@google/genai";
import type { AuditResult, ChatMessage, GroundingSource, UserTaxRates } from '../types';
import type { CompanyData } from './cnpjService';

// Helper function to safely get the AI client or throw a context-aware error
const getAiClient = () => {
    // API Key must be obtained exclusively from the environment variable process.env.API_KEY
    if (!process.env.API_KEY) {
        throw new Error("API Key is missing. Please configure the API_KEY environment variable in your project settings.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

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
        description: "A detailed short paragraph (3-5 sentences) summarizing the audit findings, highlighting critical issues, tax inconsistencies, and the overall risk assessment in Portuguese."
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
    images: string[] = [], // New parameter for scanned PDF pages
    companyName?: string | null, 
    documentDate?: string | null, 
    takerCnpj?: string | null, 
    takerName?: string | null,
    officialEmitterData?: CompanyData | null,
    officialTakerData?: CompanyData | null,
    municipality?: string | null,
    userTaxRates?: UserTaxRates // New parameter for manual tax refinement
): Promise<AuditResult> {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  // Format official data for the prompt if available
  const officialEmitterStr = officialEmitterData 
    ? `\n    - DADOS OFICIAIS DO EMISSOR (Receita Federal/API): Razão Social: "${officialEmitterData.razao_social}", Situação: "${officialEmitterData.situacao_cadastral}", CNAE: "${officialEmitterData.cnae_fiscal_descricao}", UF: "${officialEmitterData.uf}".`
    : '';

  const officialTakerStr = officialTakerData
    ? `\n    - DADOS OFICIAIS DO TOMADOR (Receita Federal/API): Razão Social: "${officialTakerData.razao_social}", Situação: "${officialTakerData.situacao_cadastral}".`
    : '';

  const municipalityStr = municipality
    ? `\n    - Município de Incidência/Prestador: "${municipality}"`
    : '';

  const userRatesStr = userTaxRates 
    ? `\n    - **PARÂMETROS DE REFINAMENTO (Manual do Usuário)**: 
       Use estes valores como verdade absoluta para validar a operação.
       Regime Tributário do PRESTADOR: ${userTaxRates.providerRegime || 'Não informado'}
       Regime Tributário do TOMADOR: ${userTaxRates.takerRegime || 'Não informado'}
       Alíquotas Informadas: ICMS (${userTaxRates.icms || 'N/A'}%), ISS (${userTaxRates.iss || 'N/A'}%), PIS (${userTaxRates.pis || 'N/A'}%), COFINS (${userTaxRates.cofins || 'N/A'}%)`
    : '';

  const hasImages = images.length > 0;
  
  const prompt = `
    Você é um auditor fiscal especialista no sistema tributário brasileiro. Analise o CONTEÚDO BRUTO abaixo, que é um documento fiscal (XML, Texto de PDF ou Imagens de PDF digitalizado).
    
    NOTA IMPORTANTE: Se os campos de cabeçalho abaixo estiverem marcados como 'Não extraído', você DEVE procurá-los diretamente no 'Conteúdo do documento' ou nas 'IMAGENS' fornecidas. ${hasImages ? 'ATENÇÃO: Este documento contém imagens (documento digitalizado). Use visão computacional para ler os dados.' : ''}

    Cabeçalho (Tentativa de Extração Automática via metadados):
    - Nome do arquivo: "${fileName}"
    - Nome da empresa emissora: "${companyName || 'Não extraído (Busque no conteúdo/imagem)'}"
    - Data de emissão: "${documentDate || 'Não extraída (Busque no conteúdo/imagem)'}"
    - CNPJ do tomador/destinatário: "${takerCnpj || 'Não extraído (Busque no conteúdo/imagem)'}"
    - Nome do tomador/destinatário: "${takerName || 'Não extraído (Busque no conteúdo/imagem)'}"
    ${municipalityStr}
    ${officialEmitterStr}${officialTakerStr}
    ${userRatesStr}

    Conteúdo do documento (Texto Extraído):
    \`\`\`
    ${fileContent || "(Conteúdo de texto vazio, analise as imagens anexadas)"}
    \`\`\`

    Siga estas regras estritamente:
    1.  Interprete o conteúdo bruto acima E as imagens anexadas. Se for XML, ignore prefixos de namespace. Se for imagem, use OCR para ler campos.
    2.  Preencha os metadados (companyName, documentDate, etc) no JSON de resposta com base no que você encontrar no conteúdo.
    3.  **CRÍTICO: Validação Cadastral**: Se foram fornecidos "DADOS OFICIAIS" acima, compare-os com os dados dentro do documento. 
        - Se a Razão Social do documento for muito diferente da oficial, gere um alerta (Warning).
        - Se a Situação Cadastral oficial não for "ATIVA", gere um erro (Error) grave.
    4.  Verifique a validade de campos chave como CNPJ, Chave de Acesso, NCM, CFOP.
    5.  Valide todos os cálculos de impostos (ICMS, IPI, PIS, COFINS, ISS). **Se o usuário informou alíquotas manuais, utilize-as para validar o valor calculado.**
    6.  Regra do STF: O ICMS deve ser EXCLUÍDO da base de cálculo do PIS/COFINS.
    7.  Identifique retenções na fonte necessárias (IRRF, CSLL, INSS).
    8.  **VALIDAÇÃO MUNICIPAL**: Se for NFSe, identifique o município no conteúdo. Se for **Taboão da Serra** (ou similar), verifique layout e alíquotas de ISS.
    9.  **ANÁLISE DE REGIME E CRÉDITOS (ALTA PRIORIDADE)**:
        - Utilize os regimes tributários informados manualmente (se houver) para validar a operação.
        - **Prestador SIMPLES NACIONAL**: Não deve destacar IPI (exceto Anexo Industria com permissão específica) e deve ter frases de permissão de crédito de ICMS apenas se aplicável. Valide se a alíquota de ISS corresponde a faixa do Simples.
        - **Tomador LUCRO REAL**: Verifique rigorosamente se há aproveitamento de crédito de PIS/COFINS (entrada de insumos). Se o Prestador for Simples Nacional, verifique a possibilidade legal do crédito (Lei Complementar 123). Se o Prestador for Regime Normal (Lucro Presumido/Real), o crédito é geralmente permitido.
        - **Prestador LUCRO PRESUMIDO/REAL**: Verifique alíquotas cheias de PIS (0.65% ou 1.65%) e COFINS (3% ou 7.6%).
        - **Desenquadramento**: Se o Prestador parece ser MEI/Simples mas usa alíquotas de regime normal, aponte ERRO CRÍTICO de desenquadramento.
    10. Atribua um 'riskScore' (0-100) e 'riskLevel'.
    11. Responda estritamente no formato JSON especificado, em português brasileiro.
  `;

  const requestParts: any[] = [{ text: prompt }];

  // Add images to the request parts if available
  if (hasImages) {
      images.forEach(base64Image => {
          requestParts.push({
              inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Image
              }
          });
      });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: requestParts }, // Pass parts array which can include text and images
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

export async function getCnaeDetails(cnaeDescription: string): Promise<string> {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";
  
  const prompt = `
    Atue como um Consultor Tributário Sênior.
    O usuário precisa de uma análise oficial e detalhada sobre o seguinte CNAE (Classificação Nacional de Atividades Econômicas):
    "${cnaeDescription}"

    Por favor, forneça as seguintes informações estruturadas em formato de relatório técnico:
    
    1. **Descrição Oficial**: A descrição completa desta atividade na tabela CNAE.
    2. **Atividades Compreendidas**: Lista do que ESTÁ incluso neste código.
    3. **Atividades Não Compreendidas**: Lista do que NÃO está incluso (se houver).
    4. **ANÁLISE DE TRIBUTAÇÃO E SIMPLES NACIONAL**:
       - **Permissão ao Simples Nacional**: Sim ou Não?
       - **Anexos Prováveis**: Indique em quais anexos (I, II, III, IV ou V) esta atividade geralmente se enquadra.
       - **Fator R**: Esta atividade está sujeita ao Fator R (relação folha/faturamento)? Se sim, explique brevemente.
    
    5. **DETALHAMENTO DE TRIBUTOS E BASES LEGAIS**:
       - **ISS (Municipal)**: Incidência, alíquotas comuns (2% a 5%) e base legal (LC 116/03, item da lista de serviços).
       - **ICMS (Estadual)**: Incidência (se houver transporte interestadual ou fornecimento de mercadoria).
       - **PIS/COFINS**: Regime Cumulativo (Lucro Presumido) vs Não Cumulativo (Lucro Real). Alíquotas básicas (0,65%/3% ou 1,65%/7,6%).
       - **INSS (Previdenciário)**: Incidência sobre folha ou desoneração (CPRB) se aplicável.
    
    Responda em texto claro, organizado (use tópicos e negrito) e em português.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error getting CNAE details:", error);
    throw new Error("Não foi possível obter detalhes tributários do CNAE no momento.");
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
    const ai = getAiClient();
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
    const ai = getAiClient();
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
