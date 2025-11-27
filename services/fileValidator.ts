
interface ValidationResult {
    isValid: boolean;
    error?: string;
}

// --- CPF Validation Algorithm (Mod 11) ---
const isValidCPF = (cpf: string): boolean => {
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11) return false;
    if (/^(\d)\1+$/.test(cleanCPF)) return false; // Check for repeated digits like 111.111.111-11

    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++) sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
    remainder = (sum * 10) % 11;
    if ((remainder === 10) || (remainder === 11)) remainder = 0;
    if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

    return true;
};

// --- CNPJ Validation Algorithm (Mod 11) ---
const isValidCNPJ = (cnpj: string): boolean => {
    const cleanCNPJ = cnpj.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14) return false;
    if (/^(\d)\1+$/.test(cleanCNPJ)) return false;

    let length = cleanCNPJ.length - 2;
    let numbers = cleanCNPJ.substring(0, length);
    const digits = cleanCNPJ.substring(length);
    let sum = 0;
    let pos = length - 7;

    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result !== parseInt(digits.charAt(0))) return false;

    length = length + 1;
    numbers = cleanCNPJ.substring(0, length);
    sum = 0;
    pos = length - 7;

    for (let i = length; i >= 1; i--) {
        sum += parseInt(numbers.charAt(length - i)) * pos--;
        if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (result !== parseInt(digits.charAt(1))) return false;

    return true;
};

// --- Helper to validate numeric ID format and checksum ---
const validateId = (idNode: Element | undefined, type: 'CNPJ' | 'CPF', context: string): string | null => {
    if (!idNode) return null; // Missing node is handled by structural checks usually
    const val = idNode.textContent?.trim() || '';
    
    if (type === 'CNPJ') {
        if (!isValidCNPJ(val)) {
            return `${context}: O CNPJ '${val}' é inválido (dígitos verificadores incorretos).`;
        }
    } else if (type === 'CPF') {
        if (!isValidCPF(val)) {
            return `${context}: O CPF '${val}' é inválido (dígitos verificadores incorretos).`;
        }
    }
    return null;
}

const parseMoney = (text: string | null | undefined): number => {
    if (!text) return 0;
    // Handles typical XML formats (dot for decimals)
    return parseFloat(text.replace(',', '.'));
}

// --- Tax Calculation Validator ---
// Checks if Base * Rate == Value (within a tolerance)
const validateTaxRelationship = (
    base: number, 
    rate: number, 
    value: number, 
    taxName: string, 
    context: string
): string | null => {
    // If rate is > 1 (e.g., 18.00), treat as percentage. If < 1 (e.g. 0.18), treat as decimal?
    // In XML NFe/NFSe standard, rate is usually percentage (18.00).
    // Note: NFSe ABRASF standard dictates aliquota like 0.05 or 5.00 depending on version, we try both.

    if (base <= 0 || value <= 0) return null; // Skip if values are zero

    const calculatedFromPercent = base * (rate / 100);
    const calculatedFromDecimal = base * rate;
    
    // Tolerance of 5 cents to handle rounding differences
    const tolerance = 0.05; 
    
    const diffPercent = Math.abs(calculatedFromPercent - value);
    // If rate is small (e.g. 0.05), it might be decimal representation
    const diffDecimal = rate < 1.0 ? Math.abs(calculatedFromDecimal - value) : 9999; 

    if (diffPercent > tolerance && diffDecimal > tolerance) {
        return `${context}: Inconsistência no cálculo de ${taxName}. Base (${base.toFixed(2)}) x Alíquota (${rate}) != Valor destacado (${value.toFixed(2)}).`;
    }
    return null;
};

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

    const rootName = doc.documentElement.localName;
    
    // --- CTe VALIDATION ---
    if (rootName === 'cteProc' || rootName === 'CTe') {
        const infCteNodes = doc.getElementsByTagName('infCte');
        if (infCteNodes.length === 0) {
            return { isValid: false, error: 'Estrutura CTe inválida: A tag <infCte> não foi encontrada dentro do arquivo.' };
        }
        
        const infCteNode = infCteNodes[0];
        const hasVersion = infCteNode.getAttribute('versao');
        const hasIde = infCteNode.getElementsByTagName('ide').length > 0;
        const emitTags = infCteNode.getElementsByTagName('emit');
        
        if (!hasVersion) return { isValid: false, error: 'CTe inválido: Atributo de versão ausente em <infCte>.' };
        if (!hasIde) return { isValid: false, error: 'CTe inválido: Tag <ide> não encontrada.' };
        if (emitTags.length === 0) return { isValid: false, error: 'CTe inválido: Tag <emit> não encontrada.' };

        // Validate Emitter CNPJ
        const emitCnpj = emitTags[0].getElementsByTagName('CNPJ')[0];
        if (!emitCnpj) return { isValid: false, error: 'CTe inválido: <emit> deve conter um <CNPJ>.' };
        const emitCnpjError = validateId(emitCnpj, 'CNPJ', 'Emitente CTe');
        if (emitCnpjError) return { isValid: false, error: emitCnpjError };

        // Taker validation (Remetente, Destinatário, etc in CTe)
        const remTags = infCteNode.getElementsByTagName('rem');
        if (remTags.length > 0) {
            const remCnpj = remTags[0].getElementsByTagName('CNPJ')[0];
            const remCpf = remTags[0].getElementsByTagName('CPF')[0];
            if (remCnpj) {
                 const err = validateId(remCnpj, 'CNPJ', 'Remetente CTe');
                 if (err) return { isValid: false, error: err };
            } else if (remCpf) {
                 const err = validateId(remCpf, 'CPF', 'Remetente CTe');
                 if (err) return { isValid: false, error: err };
            }
        }
        
        const hasVPrest = infCteNode.getElementsByTagName('vPrest').length > 0;
        if (!hasVPrest) {
            return { isValid: false, error: 'CTe inválido: Tag <vPrest> (valores da prestação) ausente.' };
        }
        
        return { isValid: true };
    }

    // --- NFe VALIDATION ---
    if (rootName === 'nfeProc' || rootName === 'NFe') {
        const infNFeNodes = doc.getElementsByTagName('infNFe');
        if (infNFeNodes.length === 0) {
            return { isValid: false, error: 'Estrutura NFe inválida: A tag <infNFe> não foi encontrada.' };
        }

        const infNFeNode = infNFeNodes[0];
        const hasVersion = infNFeNode.getAttribute('versao');
        const hasIde = infNFeNode.getElementsByTagName('ide').length > 0;
        const emitTags = infNFeNode.getElementsByTagName('emit');
        const totalTags = infNFeNode.getElementsByTagName('total');
        
        if (!hasVersion) return { isValid: false, error: 'NFe inválida: Atributo de versão ausente em <infNFe>.' };
        if (!hasIde) return { isValid: false, error: 'NFe inválida: Tag <ide> ausente.' };
        if (emitTags.length === 0) return { isValid: false, error: 'NFe inválida: Tag <emit> ausente.' };
        if (totalTags.length === 0) return { isValid: false, error: 'NFe inválida: Tag <total> ausente.' };

        // --- Validação da Chave de Acesso ---
        const idAttr = infNFeNode.getAttribute('Id');
        if (!idAttr) {
            return { isValid: false, error: 'NFe inválida: Atributo "Id" (Chave de Acesso) ausente na tag <infNFe>.' };
        }

        if (!idAttr.startsWith('NFe')) {
            return { isValid: false, error: `NFe inválida: O atributo 'Id' deve começar com o prefixo 'NFe'. Encontrado: '${idAttr}'.` };
        }
        
        const accessKey = idAttr.substring(3);
        if (!/^\d{44}$/.test(accessKey)) {
             return { isValid: false, error: `NFe inválida: A chave de acesso deve conter exatamente 44 dígitos numéricos. Encontrado: ${accessKey.length} caracteres.` };
        }
        
        // Cálculo do Checksum (Módulo 11)
        let sum = 0;
        let weight = 2;
        for (let i = 42; i >= 0; i--) {
            sum += parseInt(accessKey[i], 10) * weight;
            weight++;
            if (weight > 9) weight = 2;
        }
        const remainder = sum % 11;
        const calculatedDV = (remainder === 0 || remainder === 1) ? 0 : 11 - remainder;
        const foundDV = parseInt(accessKey[43], 10);
        
        if (calculatedDV !== foundDV) {
            return { isValid: false, error: `NFe inválida: Dígito verificador da chave de acesso incorreto. Esperado: ${calculatedDV}, Encontrado: ${foundDV}.` };
        }
        // -------------------------------------

        // Validate Emitter CNPJ/CPF
        const emitCnpj = emitTags[0].getElementsByTagName('CNPJ')[0];
        const emitCpf = emitTags[0].getElementsByTagName('CPF')[0];
        
        if (emitCnpj) {
            const err = validateId(emitCnpj, 'CNPJ', 'Emitente NFe');
            if (err) return { isValid: false, error: err };
        } else if (emitCpf) {
            const err = validateId(emitCpf, 'CPF', 'Emitente NFe');
            if (err) return { isValid: false, error: err };
        } else {
            return { isValid: false, error: 'NFe inválida: Emitente deve possuir CNPJ ou CPF.' };
        }

        // --- Tax Regime Validation (CRT) ---
        const crtNode = emitTags[0].getElementsByTagName('CRT')[0];
        const crt = crtNode ? crtNode.textContent?.trim() : null;

        // Validate Destination/Taker
        const destTags = infNFeNode.getElementsByTagName('dest');
        if (destTags.length > 0) {
            const destCnpj = destTags[0].getElementsByTagName('CNPJ')[0];
            const destCpf = destTags[0].getElementsByTagName('CPF')[0];

            if (destCnpj) {
                const err = validateId(destCnpj, 'CNPJ', 'Destinatário NFe');
                if (err) return { isValid: false, error: err };
            } else if (destCpf) {
                const err = validateId(destCpf, 'CPF', 'Destinatário NFe');
                if (err) return { isValid: false, error: err };
            }
        }

        // Product validation loop
        const productNodes = infNFeNode.getElementsByTagName('prod');
        for (const prod of Array.from(productNodes)) {
            const detNode = prod.parentElement;
            const nItem = detNode?.getAttribute('nItem') || '?';

            // NCM validation
            const ncmNode = prod.getElementsByTagName('NCM');
            if (ncmNode.length === 0 || !ncmNode[0].textContent) {
                return { isValid: false, error: `Item ${nItem}: Produto sem código NCM.` };
            }

            const ncmContent = ncmNode[0].textContent.trim();
            if (!/^\d{8}$/.test(ncmContent)) {
                 return { isValid: false, error: `Item ${nItem}: NCM '${ncmContent}' inválido. Deve ter 8 dígitos.` };
            }
            if (ncmContent !== "00000000") {
                const chapter = parseInt(ncmContent.substring(0, 2), 10);
                if (chapter === 0 || chapter > 99) {
                     return { isValid: false, error: `Item ${nItem}: NCM '${ncmContent}' possui capítulo inválido.` };
                }
            }

            // vProd validation
            const vProdNode = prod.getElementsByTagName('vProd');
            if (vProdNode.length === 0) return { isValid: false, error: `Item ${nItem}: Produto sem valor total (vProd).` };
            
            const vProd = parseFloat(vProdNode[0].textContent || '0');
            if (isNaN(vProd) || vProd < 0) return { isValid: false, error: `Item ${nItem}: Valor do produto inválido.` };

            // vProd consistency check with qCom * vUnCom
            const qComNode = prod.getElementsByTagName('qCom');
            const vUnComNode = prod.getElementsByTagName('vUnCom');
            if (qComNode.length > 0 && vUnComNode.length > 0) {
                const qCom = parseFloat(qComNode[0].textContent || '0');
                const vUnCom = parseFloat(vUnComNode[0].textContent || '0');
                if (Math.abs((qCom * vUnCom) - vProd) > 0.05) {
                    return { 
                        isValid: false, 
                        error: `Item ${nItem}: Valor Total (vProd=${vProd}) diverge de Qtd x Valor Unitário.` 
                    };
                }
            }

            // --- Tax Calculation & Regime Consistency Check per Item ---
            if (detNode) {
                const imposto = detNode.getElementsByTagName('imposto')[0];
                if (imposto) {
                    const icms = imposto.getElementsByTagName('ICMS')[0];
                    if (icms) {
                        const icmsChildren = Array.from(icms.children); // Get specific CST group (e.g. ICMS00)
                        
                        // Check CST vs CRT
                        const hasCSOSN = icmsChildren.some(child => child.getElementsByTagName('CSOSN').length > 0 || child.tagName.includes('ICMSSN'));
                        const hasCST = icmsChildren.some(child => child.getElementsByTagName('CST').length > 0 || child.tagName.includes('ICMS00') || child.tagName.includes('ICMS20'));

                        if (crt === '1' && hasCST && !hasCSOSN) {
                            return { isValid: false, error: `Item ${nItem}: Emitente Simples Nacional, mas item usa CST (Regime Normal).` };
                        } else if (crt === '3' && hasCSOSN) {
                            return { isValid: false, error: `Item ${nItem}: Emitente Regime Normal, mas item usa CSOSN (Simples Nacional).` };
                        }

                        // Validate ICMS Calculation (Base * Rate = Value)
                        // Iterate through children to find the active ICMS group and check for tags
                        for (const group of icmsChildren) {
                            const vBC = parseMoney(group.getElementsByTagName('vBC')[0]?.textContent);
                            const pICMS = parseMoney(group.getElementsByTagName('pICMS')[0]?.textContent);
                            const vICMS = parseMoney(group.getElementsByTagName('vICMS')[0]?.textContent);

                            if (vBC > 0 && pICMS > 0 && vICMS > 0) {
                                const mathError = validateTaxRelationship(vBC, pICMS, vICMS, 'ICMS', `Item ${nItem}`);
                                if (mathError) return { isValid: false, error: mathError };
                            }
                        }
                    }
                }
            }
        }
        
        return { isValid: true };
    }
    
    // --- NFSe VALIDATION ---
    if (rootName === 'NFSe' || rootName === 'Nfse' || rootName === 'CompNfse') {
        const infNfseNodes = doc.getElementsByTagName('InfNfse');
        if (infNfseNodes.length === 0) {
            return { isValid: false, error: 'Estrutura NFSe inválida: A tag <InfNfse> não foi encontrada.' };
        }

        const infNfseNode = infNfseNodes[0];
        
        // Prestador Check
        const prestadorTags = infNfseNode.getElementsByTagName('PrestadorServico');
        const prestadorNode = prestadorTags.length > 0 ? prestadorTags[0] : infNfseNode; // Fallback structure

        // Helper to check ID in context
        const checkEntityId = (node: Element, context: string) => {
            const cnpj = node.getElementsByTagName('Cnpj')[0] || node.getElementsByTagName('CNPJ')[0];
            const cpf = node.getElementsByTagName('Cpf')[0] || node.getElementsByTagName('CPF')[0];
            if (cnpj) {
                return validateId(cnpj, 'CNPJ', context);
            } else if (cpf) {
                return validateId(cpf, 'CPF', context);
            }
            return null;
        };

        // Validate Prestador ID
        // Note: Logic handles various nesting (IdentificacaoPrestador or direct) via searching
        const identPrestador = prestadorNode.getElementsByTagName('IdentificacaoPrestador')[0];
        const prestadorError = checkEntityId(identPrestador || prestadorNode, 'Prestador NFSe');
        if (prestadorError) return { isValid: false, error: prestadorError };

        // Validate Tomador ID
        const tomadorTags = infNfseNode.getElementsByTagName('TomadorServico');
        if (tomadorTags.length > 0) {
            const tomadorNode = tomadorTags[0];
            const identTomador = tomadorNode.getElementsByTagName('IdentificacaoTomador')[0];
            const tomadorError = checkEntityId(identTomador || tomadorNode, 'Tomador NFSe');
            if (tomadorError) return { isValid: false, error: tomadorError };
        }

        // DataEmissao Check
        const dataEmissao = infNfseNode.getElementsByTagName('DataEmissao')[0];
        if (!dataEmissao || !dataEmissao.textContent?.trim()) {
            return { isValid: false, error: 'NFSe inválida: Tag <DataEmissao> obrigatória.' };
        }

        // Service check
        const servicoTags = infNfseNode.getElementsByTagName('Servico');
        if (servicoTags.length === 0) return { isValid: false, error: 'NFSe inválida: Tag <Servico> ausente.' };
        const servicoNode = servicoTags[0];

        // ISS Values and Rate Check
        const valoresTags = servicoNode.getElementsByTagName('Valores');
        const valuesContext = valoresTags.length > 0 ? valoresTags[0] : servicoNode;

        const vServicos = parseMoney(valuesContext.getElementsByTagName('ValorServicos')[0]?.textContent);
        const valorIss = parseMoney((valuesContext.getElementsByTagName('ValorIss')[0] || valuesContext.getElementsByTagName('ValorIssqn')[0])?.textContent);
        const aliquota = parseMoney(valuesContext.getElementsByTagName('Aliquota')[0]?.textContent);

        // Validation: Rate Range
        let ratePercent = aliquota;
        if (aliquota > 0 && aliquota <= 1) {
            ratePercent = aliquota * 100;
        }

        if (aliquota > 0 && (ratePercent < 2 || ratePercent > 5)) {
             return { 
                 isValid: false, 
                 error: `Aviso de Validação NFSe: A Alíquota de ISS (${ratePercent.toFixed(2)}%) está fora do intervalo padrão (2% a 5%).` 
             };
        }

        // Validation: Math (Base x Rate = Value)
        if (vServicos > 0 && aliquota > 0 && valorIss > 0) {
            const mathError = validateTaxRelationship(vServicos, aliquota, valorIss, 'ISS', 'Detalhes do Serviço');
            if (mathError) return { isValid: false, error: mathError };
        }

        // --- Tax Regime & Withholding Check ---
        const optanteSimplesNode = infNfseNode.getElementsByTagName('OptanteSimplesNacional')[0];
        const optanteSimples = optanteSimplesNode ? optanteSimplesNode.textContent?.trim() : null; // 1=Sim
        
        const issRetidoNode = valuesContext.getElementsByTagName('IssRetido')[0] || servicoNode.getElementsByTagName('IssRetido')[0];
        const issRetido = issRetidoNode ? issRetidoNode.textContent?.trim() : null; // 1=Sim
        const valorIssRetido = parseMoney(valuesContext.getElementsByTagName('ValorIssRetido')[0]?.textContent);

        if (issRetido === '1' && valorIssRetido <= 0) {
            return { isValid: false, error: `Inconsistência de Retenção NFSe: 'IssRetido' é SIM, mas 'ValorIssRetido' é zero/ausente.` };
        }

        if (vServicos > 0) {
            const vPis = parseMoney(valuesContext.getElementsByTagName('ValorPis')[0]?.textContent);
            const vCofins = parseMoney(valuesContext.getElementsByTagName('ValorCofins')[0]?.textContent);
            const vCsll = parseMoney(valuesContext.getElementsByTagName('ValorCsll')[0]?.textContent);

            if (optanteSimples === '1') {
                if (vPis > 0 || vCofins > 0 || vCsll > 0) {
                     return { isValid: false, error: `Aviso: Emitente Simples Nacional com retenções federais (PIS/COFINS/CSLL) destacadas. Verifique se é devido.` };
                }
            }
        }

        return { isValid: true };
    }

    return { isValid: false, error: 'O arquivo XML não parece ser uma NFe, CTe ou NFSe válida. A estrutura principal não foi encontrada.' };
};

const validatePDF = async (file: File): Promise<ValidationResult> => {
    const FISCAL_KEYWORDS = [
        'CNPJ', 'DANFE', 'NFS-e', 'CT-e', 'NOTA FISCAL', 'IMPOSTO',
        'BASE DE CÁLCULO', 'ICMS', 'ISS', 'PIS', 'COFINS', 'VALOR TOTAL',
        'CHAVE DE ACESSO', 'PROTOCOLO DE AUTORIZAÇÃO'
    ];
    const MIN_KEYWORD_COUNT = 1; 

    if (file.size === 0) {
        return { isValid: false, error: 'O arquivo PDF está vazio.' };
    }

    try {
        const buffer = await file.arrayBuffer();
        const uint = new Uint8Array(buffer);
        const isPdfHeader = uint[0] === 37 && uint[1] === 80 && uint[2] === 68 && uint[3] === 70 && uint[4] === 45;
        if (!isPdfHeader) {
            return { isValid: false, error: 'O arquivo não parece ser um PDF válido. O cabeçalho do arquivo está incorreto.' };
        }
        
        const textContent = new TextDecoder('latin1').decode(uint);
        const eofMarker = '%%EOF';
        const lastChunk = textContent.substring(textContent.length - 1024);
        if (!lastChunk.includes(eofMarker)) {
             return { isValid: false, error: 'O arquivo PDF parece corrompido (sem marcador EOF).' };
        }

        const upperCaseContent = textContent.toUpperCase();
        let foundKeywords = 0;
        for (const keyword of FISCAL_KEYWORDS) {
            if (upperCaseContent.includes(keyword)) foundKeywords++;
        }

        if (foundKeywords >= MIN_KEYWORD_COUNT) {
            return { isValid: true };
        } else {
             return { 
                 isValid: false, 
                 error: `O PDF não contém palavras-chave fiscais suficientes (ex: CNPJ, DANFE). Verifique o documento.` 
             };
        }
    } catch (error) {
        return { isValid: false, error: 'Erro ao ler o arquivo PDF.' };
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
