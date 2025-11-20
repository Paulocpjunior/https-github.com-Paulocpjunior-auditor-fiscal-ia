interface ValidationResult {
    isValid: boolean;
    error?: string;
}

const validateXML = async (file: File): Promise<ValidationResult> => {
    if (file.size === 0) {
        return { isValid: false, error: 'O arquivo XML está vazio.' };
    }
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const errorNode = doc.querySelector('parsererror');
    if (errorNode) {
        return { isValid: false, error: 'O arquivo XML está malformado ou corrompido. Verifique a estrutura do arquivo.' };
    }

    // Use getElementsByTagName for namespace-agnostic checks. This is more robust.

    // CTe validation - Check for CTe first, as it can contain NFe info inside it.
    const infCteNodes = doc.getElementsByTagName('infCte');
    if (infCteNodes.length > 0) {
        const infCteNode = infCteNodes[0];
        const hasVersion = infCteNode.getAttribute('versao');
        const hasIde = infCteNode.getElementsByTagName('ide').length > 0;
        const emitTags = infCteNode.getElementsByTagName('emit');
        const hasEmitCnpj = emitTags.length > 0 && emitTags[0].getElementsByTagName('CNPJ').length > 0;
        const hasVPrest = infCteNode.getElementsByTagName('vPrest').length > 0;
        if (hasVersion && hasIde && hasEmitCnpj && hasVPrest) {
            return { isValid: true };
        }
        return { isValid: false, error: 'O arquivo de CTe parece inválido ou incompleto. Faltam atributos essenciais (como a versão) ou tags como <ide>, <emit><CNPJ> ou <vPrest>.' };
    }

    // NFe validation
    const infNFeNodes = doc.getElementsByTagName('infNFe');
    if (infNFeNodes.length > 0) {
        const infNFeNode = infNFeNodes[0];
        const hasVersion = infNFeNode.getAttribute('versao');
        const hasIde = infNFeNode.getElementsByTagName('ide').length > 0;
        const emitTags = infNFeNode.getElementsByTagName('emit');
        const hasEmitCnpj = emitTags.length > 0 && emitTags[0].getElementsByTagName('CNPJ').length > 0;
        const hasTotal = infNFeNode.getElementsByTagName('total').length > 0;
        
        if (!hasVersion || !hasIde || !hasEmitCnpj || !hasTotal) {
             return { isValid: false, error: 'O arquivo de NFe parece inválido ou incompleto. Faltam atributos essenciais (como a versão) ou tags como <ide>, <emit><CNPJ> ou <total>.' };
        }

        // Product validation loop
        const productNodes = infNFeNode.getElementsByTagName('prod');
        for (const prod of Array.from(productNodes)) {
            // Get item number for better context in errors
            // prod is child of det
            const detNode = prod.parentElement;
            const nItem = detNode?.getAttribute('nItem') || '?';

            // NCM validation
            const ncmNode = prod.getElementsByTagName('NCM');
            if (ncmNode.length === 0 || !ncmNode[0].textContent || !/^\d{8}$/.test(ncmNode[0].textContent.trim())) {
                return { isValid: false, error: `Item ${nItem}: O arquivo de NFe contém produtos com NCM inválido ou ausente. O NCM deve ser um código numérico de 8 dígitos.` };
            }

            // vProd validation
            const vProdNode = prod.getElementsByTagName('vProd');
            if (vProdNode.length === 0 || !vProdNode[0].textContent) {
                return { isValid: false, error: `Item ${nItem}: O arquivo de NFe contém produtos sem o valor total (vProd).` };
            }
            const vProd = parseFloat(vProdNode[0].textContent);
            if (isNaN(vProd) || vProd <= 0) {
                return { isValid: false, error: `Item ${nItem}: O arquivo de NFe contém produtos com valor total (vProd) inválido. O valor deve ser um número positivo.` };
            }

            // vProd consistency check with qCom * vUnCom
            const qComNode = prod.getElementsByTagName('qCom');
            const vUnComNode = prod.getElementsByTagName('vUnCom');
            if (qComNode.length > 0 && qComNode[0].textContent && vUnComNode.length > 0 && vUnComNode[0].textContent) {
                const qCom = parseFloat(qComNode[0].textContent);
                const vUnCom = parseFloat(vUnComNode[0].textContent);
                if (!isNaN(qCom) && !isNaN(vUnCom)) {
                    const calculatedTotal = qCom * vUnCom;
                    // Use a small tolerance for floating point comparison (0.01 for currency)
                    // We verify if the XML total matches Quantity * Unit Price
                    if (Math.abs(calculatedTotal - vProd) > 0.01) {
                        return { 
                            isValid: false, 
                            error: `Inconsistência de cálculo no Item ${nItem}: O valor total do produto (vProd=${vProd.toFixed(2)}) diverge do cálculo Quantidade (${qCom}) x Valor Unitário (${vUnCom.toFixed(4)}) = ${calculatedTotal.toFixed(2)}. Diferença: ${Math.abs(calculatedTotal - vProd).toFixed(4)}.` 
                        };
                    }
                }
            }
        }
        
        return { isValid: true };
    }
    
    // NFSe validation (common ABRASF pattern)
    const infNfseNodes = doc.getElementsByTagName('InfNfse');
    if (infNfseNodes.length > 0) {
        const infNfseNode = infNfseNodes[0];
        const hasPrestador = infNfseNode.getElementsByTagName('PrestadorServico').length > 0;
        const hasTomador = infNfseNode.getElementsByTagName('TomadorServico').length > 0;
        const hasServico = infNfseNode.getElementsByTagName('Servico').length > 0;
        if (hasPrestador && hasTomador && hasServico) {
            return { isValid: true };
        }
        return { isValid: false, error: 'O arquivo de NFSe parece incompleto. Faltam tags como <PrestadorServico>, <TomadorServico> ou <Servico>.' };
    }

    return { isValid: false, error: 'O arquivo XML não parece ser uma NFe, CTe ou NFSe válida. A estrutura principal do documento não foi encontrada.' };
};

const validatePDF = async (file: File): Promise<ValidationResult> => {
    // Keywords that strongly suggest a fiscal document
    const FISCAL_KEYWORDS = [
        'CNPJ', 'DANFE', 'NFS-e', 'CT-e', 'NOTA FISCAL', 'IMPOSTO',
        'BASE DE CÁLCULO', 'ICMS', 'ISS', 'PIS', 'COFINS', 'VALOR TOTAL',
        'CHAVE DE ACESSO', 'PROTOCOLO DE AUTORIZAÇÃO'
    ];
    // Lowered count to 1 to avoid false negatives on valid PDFs where text extraction is difficult.
    // The AI is better suited for full content validation.
    const MIN_KEYWORD_COUNT = 1; 

    if (file.size === 0) {
        return { isValid: false, error: 'O arquivo PDF está vazio.' };
    }

    try {
        const buffer = await file.arrayBuffer();
        const uint = new Uint8Array(buffer);

        // 1. Check for PDF magic number: %PDF- at the start
        const isPdfHeader = uint[0] === 37 && uint[1] === 80 && uint[2] === 68 && uint[3] === 70 && uint[4] === 45;
        if (!isPdfHeader) {
            return { isValid: false, error: 'O arquivo não parece ser um PDF válido. O cabeçalho do arquivo está incorreto.' };
        }
        
        // Use text decoder to check for content
        const textContent = new TextDecoder('latin1').decode(uint);
        
        // 2. Check for EOF marker. It should be within the last 1024 bytes.
        const eofMarker = '%%EOF';
        const lastChunk = textContent.substring(textContent.length - 1024);
        if (!lastChunk.includes(eofMarker)) {
             return { isValid: false, error: 'O arquivo PDF parece estar corrompido ou incompleto. O marcador de fim de arquivo (EOF) não foi encontrado.' };
        }

        // 3. Heuristic check for fiscal keywords
        const upperCaseContent = textContent.toUpperCase();
        const matchedKeywords = new Set();

        FISCAL_KEYWORDS.forEach(keyword => {
            if (upperCaseContent.includes(keyword)) {
                matchedKeywords.add(keyword);
            }
        });
        
        const foundKeywords = matchedKeywords.size;

        if (foundKeywords >= MIN_KEYWORD_COUNT) {
            return { isValid: true };
        } else {
             return { 
                 isValid: false, 
                 error: `O arquivo PDF não parece conter palavras-chave fiscais (ex: CNPJ, DANFE). Verifique se este é o documento correto. (Encontradas ${foundKeywords} de ${MIN_KEYWORD_COUNT} necessárias para a verificação inicial).` 
             };
        }
    } catch (error) {
        return { isValid: false, error: 'Ocorreu um erro ao ler o arquivo PDF.' };
    }
};

export const validateFile = async (file: File): Promise<ValidationResult> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;

    if (mimeType === 'text/xml' || mimeType === 'application/xml' || extension === 'xml') {
        return validateXML(file);
    }
    if (mimeType === 'application/pdf' || extension === 'pdf') {
        return validatePDF(file);
    }
    return { isValid: false, error: 'Formato de arquivo não suportado. Por favor, envie um XML ou PDF.' };
};