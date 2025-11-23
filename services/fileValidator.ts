
interface ValidationResult {
    isValid: boolean;
    error?: string;
}

// Helper to check for numeric CNPJ (14) or CPF (11)
const validateIdFormat = (idNode: Element | undefined, type: 'CNPJ' | 'CPF', context: string): string | null => {
    if (!idNode) return null; // Node missing is handled by structural check
    const val = idNode.textContent?.trim() || '';
    if (type === 'CNPJ') {
        if (!/^\d{14}$/.test(val)) {
            return `${context}: O CNPJ encontrado ('${val}') é inválido. Deve conter exatamente 14 dígitos numéricos.`;
        }
    } else if (type === 'CPF') {
        if (!/^\d{11}$/.test(val)) {
            return `${context}: O CPF encontrado ('${val}') é inválido. Deve conter exatamente 11 dígitos numéricos.`;
        }
    }
    return null;
}

const parseMoney = (text: string | null | undefined): number => {
    if (!text) return 0;
    // Handles typical XML formats (dot for decimals) or PT-BR (comma) if mixed
    // Typically XML uses dot.
    return parseFloat(text.replace(',', '.'));
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

    const rootName = doc.documentElement.localName;
    
    // --- CTe VALIDATION ---
    // Checks for <cteProc> or <CTe> root elements
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
        const emitCnpjError = validateIdFormat(emitCnpj, 'CNPJ', 'Emitente CTe');
        if (emitCnpjError) return { isValid: false, error: emitCnpjError };

        // Taker validation (Remetente, Destinatário, etc in CTe)
        const remTags = infCteNode.getElementsByTagName('rem');
        if (remTags.length > 0) {
            const remCnpj = remTags[0].getElementsByTagName('CNPJ')[0];
            const remCpf = remTags[0].getElementsByTagName('CPF')[0];
            if (remCnpj) {
                 const err = validateIdFormat(remCnpj, 'CNPJ', 'Remetente CTe');
                 if (err) return { isValid: false, error: err };
            } else if (remCpf) {
                 const err = validateIdFormat(remCpf, 'CPF', 'Remetente CTe');
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
    // Checks for <nfeProc> or <NFe> root elements
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
        // Percorre os 43 dígitos (excluindo o DV) de trás para frente
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

        // Validate Emitter CNPJ
        const emitCnpj = emitTags[0].getElementsByTagName('CNPJ')[0];
        const emitCpf = emitTags[0].getElementsByTagName('CPF')[0];
        
        if (emitCnpj) {
            const err = validateIdFormat(emitCnpj, 'CNPJ', 'Emitente NFe');
            if (err) return { isValid: false, error: err };
        } else if (emitCpf) {
            const err = validateIdFormat(emitCpf, 'CPF', 'Emitente NFe');
            if (err) return { isValid: false, error: err };
        } else {
            return { isValid: false, error: 'NFe inválida: Emitente deve possuir CNPJ ou CPF.' };
        }

        // --- Tax Regime Validation (CRT) ---
        const crtNode = emitTags[0].getElementsByTagName('CRT')[0];
        const crt = crtNode ? crtNode.textContent?.trim() : null;
        // CRT: 1 = Simples Nacional, 2 = Simples Excess Sublimite, 3 = Regime Normal

        // Validate Destination/Taker
        const destTags = infNFeNode.getElementsByTagName('dest');
        if (destTags.length > 0) {
            const destCnpj = destTags[0].getElementsByTagName('CNPJ')[0];
            const destCpf = destTags[0].getElementsByTagName('CPF')[0];
            const idEstrangeiro = destTags[0].getElementsByTagName('idEstrangeiro')[0];

            if (destCnpj) {
                const err = validateIdFormat(destCnpj, 'CNPJ', 'Destinatário NFe');
                if (err) return { isValid: false, error: err };
            } else if (destCpf) {
                const err = validateIdFormat(destCpf, 'CPF', 'Destinatário NFe');
                if (err) return { isValid: false, error: err };
            }
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
            if (ncmNode.length === 0 || !ncmNode[0].textContent) {
                return { isValid: false, error: `Item ${nItem}: O arquivo de NFe contém produtos sem o código NCM.` };
            }

            const ncmContent = ncmNode[0].textContent.trim();

            // 1. Structural Check: Must be 8 digits
            if (!/^\d{8}$/.test(ncmContent)) {
                 return { isValid: false, error: `Item ${nItem}: NCM '${ncmContent}' inválido. O NCM deve ser um código numérico de exatamente 8 dígitos.` };
            }

            // 2. Logic/Category Check
            if (ncmContent !== "00000000") {
                const chapter = parseInt(ncmContent.substring(0, 2), 10);
                if (chapter === 0) {
                     return { isValid: false, error: `Item ${nItem}: NCM '${ncmContent}' suspeito. O capítulo '00' não é válido para mercadorias.` };
                }
                if (chapter > 99) {
                    return { isValid: false, error: `Item ${nItem}: NCM '${ncmContent}' inválido. O capítulo (primeiros dois dígitos) não existe na Tabela TIPI/SH.` };
                }
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
                    if (Math.abs(calculatedTotal - vProd) > 0.01) {
                        return { 
                            isValid: false, 
                            error: `Inconsistência de cálculo no Item ${nItem}: O valor total do produto (vProd=${vProd.toFixed(2)}) diverge do cálculo Quantidade (${qCom}) x Valor Unitário (${vUnCom.toFixed(4)}) = ${calculatedTotal.toFixed(2)}.` 
                        };
                    }
                }
            }

            // --- Tax Regime Consistency Check per Item ---
            if (detNode) {
                const imposto = detNode.getElementsByTagName('imposto')[0];
                if (imposto) {
                    const icms = imposto.getElementsByTagName('ICMS')[0];
                    if (icms) {
                        // Check child tags of ICMS (e.g., ICMSSN101, ICMS00)
                        const icmsChildren = Array.from(icms.children);
                        const hasCSOSN = icmsChildren.some(child => child.getElementsByTagName('CSOSN').length > 0 || child.tagName.includes('ICMSSN'));
                        const hasCST = icmsChildren.some(child => child.getElementsByTagName('CST').length > 0 || child.tagName.includes('ICMS00') || child.tagName.includes('ICMS20'));

                        if (crt === '1') { // Simples Nacional
                            if (hasCST && !hasCSOSN) {
                                return { isValid: false, error: `Inconsistência Tributária no Item ${nItem}: Emitente é Simples Nacional (CRT=1), mas o item utiliza CST (Regime Normal) em vez de CSOSN. Verifique a tributação.` };
                            }
                        } else if (crt === '3') { // Regime Normal
                            if (hasCSOSN) {
                                return { isValid: false, error: `Inconsistência Tributária no Item ${nItem}: Emitente é Regime Normal (CRT=3), mas o item utiliza CSOSN (Simples Nacional). Utilize CST.` };
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
        if (prestadorTags.length === 0) return { isValid: false, error: 'NFSe inválida: Tag <PrestadorServico> ausente.' };
        
        const prestadorNode = prestadorTags[0];
        const identPrestador = prestadorNode.getElementsByTagName('IdentificacaoPrestador')[0];
        
        if (identPrestador) {
            const prestadorCnpj = identPrestador.getElementsByTagName('Cnpj')[0];
            const prestadorCpf = identPrestador.getElementsByTagName('Cpf')[0];
            if (prestadorCnpj) {
                 const err = validateIdFormat(prestadorCnpj, 'CNPJ', 'Prestador NFSe');
                 if (err) return { isValid: false, error: err };
            } else if (prestadorCpf) {
                 const err = validateIdFormat(prestadorCpf, 'CPF', 'Prestador NFSe');
                 if (err) return { isValid: false, error: err };
            }
        } else {
             const prestadorCnpj = prestadorNode.getElementsByTagName('Cnpj')[0];
             const prestadorCpf = prestadorNode.getElementsByTagName('Cpf')[0];
             if (prestadorCnpj) {
                  const err = validateIdFormat(prestadorCnpj, 'CNPJ', 'Prestador NFSe');
                  if (err) return { isValid: false, error: err };
             } else if (prestadorCpf) {
                  const err = validateIdFormat(prestadorCpf, 'CPF', 'Prestador NFSe');
                  if (err) return { isValid: false, error: err };
             }
        }

        // Tomador Check
        const tomadorTags = infNfseNode.getElementsByTagName('TomadorServico');
        if (tomadorTags.length > 0) {
            const tomadorNode = tomadorTags[0];
            const identTomador = tomadorNode.getElementsByTagName('IdentificacaoTomador')[0];
            if (identTomador) {
                const tomadorCnpj = identTomador.getElementsByTagName('Cnpj')[0];
                const tomadorCpf = identTomador.getElementsByTagName('Cpf')[0];
                if (tomadorCnpj) {
                    const err = validateIdFormat(tomadorCnpj, 'CNPJ', 'Tomador NFSe');
                    if (err) return { isValid: false, error: err };
                } else if (tomadorCpf) {
                    const err = validateIdFormat(tomadorCpf, 'CPF', 'Tomador NFSe');
                    if (err) return { isValid: false, error: err };
                }
            } else {
                const tomadorCnpj = tomadorNode.getElementsByTagName('Cnpj')[0];
                const tomadorCpf = tomadorNode.getElementsByTagName('Cpf')[0];
                if (tomadorCnpj) {
                    const err = validateIdFormat(tomadorCnpj, 'CNPJ', 'Tomador NFSe');
                    if (err) return { isValid: false, error: err };
                } else if (tomadorCpf) {
                    const err = validateIdFormat(tomadorCpf, 'CPF', 'Tomador NFSe');
                    if (err) return { isValid: false, error: err };
                }
            }
        }

        // DataEmissao Check
        const dataEmissao = infNfseNode.getElementsByTagName('DataEmissao')[0];
        if (!dataEmissao || !dataEmissao.textContent?.trim()) {
            return { isValid: false, error: 'NFSe inválida: A tag <DataEmissao> é obrigatória e não foi encontrada ou está vazia.' };
        }

        // Service check
        const servicoTags = infNfseNode.getElementsByTagName('Servico');
        if (servicoTags.length === 0) return { isValid: false, error: 'NFSe inválida: Tag <Servico> ausente.' };
        const servicoNode = servicoTags[0];

        const discriminacao = servicoNode.getElementsByTagName('Discriminacao')[0] || 
                              servicoNode.getElementsByTagName('DiscriminacaoServico')[0];
        
        if (!discriminacao || !discriminacao.textContent?.trim()) {
            return { isValid: false, error: 'NFSe inválida: A descrição do serviço (<Discriminacao>) não foi encontrada ou está vazia.' };
        }

        // ISS Values and Rate Check
        const valoresTags = servicoNode.getElementsByTagName('Valores');
        const valuesContext = valoresTags.length > 0 ? valoresTags[0] : servicoNode;

        const valorIss = valuesContext.getElementsByTagName('ValorIss')[0] || valuesContext.getElementsByTagName('ValorIssqn')[0];
        const aliquota = valuesContext.getElementsByTagName('Aliquota')[0];

        if (!valorIss) {
             return { isValid: false, error: 'NFSe inválida: Tag <ValorIss> não encontrada nos detalhes do serviço.' };
        }
        if (isNaN(parseFloat(valorIss.textContent?.replace(',', '.') || ''))) {
            return { isValid: false, error: 'NFSe inválida: O conteúdo de <ValorIss> deve ser um número válido.' };
        }

        if (!aliquota) {
            return { isValid: false, error: 'NFSe inválida: Tag <Aliquota> não encontrada nos detalhes do serviço.' };
        }
        
        const aliquotaRaw = aliquota.textContent?.replace(',', '.') || '';
        let aliquotaVal = parseFloat(aliquotaRaw);

        if (isNaN(aliquotaVal)) {
            return { isValid: false, error: 'NFSe inválida: O conteúdo de <Aliquota> deve ser um número válido.' };
        }
        
        let ratePercent = aliquotaVal;
        if (aliquotaVal > 0 && aliquotaVal <= 1) {
            ratePercent = aliquotaVal * 100;
        }

        if (ratePercent < 2 || ratePercent > 5) {
             return { 
                 isValid: false, 
                 error: `Aviso de Validação NFSe: A Alíquota de ISS identificada (${ratePercent.toFixed(2)}%) está fora do intervalo padrão de 2% a 5% (ou 0% onde não permitido).` 
             };
        }

        // --- Tax Regime & Withholding Check (NFSe) ---
        const optanteSimplesNode = infNfseNode.getElementsByTagName('OptanteSimplesNacional')[0];
        const optanteSimples = optanteSimplesNode ? optanteSimplesNode.textContent?.trim() : null; // 1 = Sim, 2 = Não
        
        // ISS Retido Check
        const issRetidoNode = valuesContext.getElementsByTagName('IssRetido')[0] || servicoNode.getElementsByTagName('IssRetido')[0];
        const issRetido = issRetidoNode ? issRetidoNode.textContent?.trim() : null; // 1 = Sim, 2 = Não
        const valorIssRetidoNode = valuesContext.getElementsByTagName('ValorIssRetido')[0];
        const valorIssRetido = parseMoney(valorIssRetidoNode?.textContent);

        if (issRetido === '1' && valorIssRetido <= 0) {
            return { isValid: false, error: `Inconsistência de Retenção NFSe: O campo 'IssRetido' indica SIM (1), mas o 'ValorIssRetido' é zero ou ausente.` };
        }

        // Federal Withholdings Check (Approximate Rates)
        const vServicosNode = valuesContext.getElementsByTagName('ValorServicos')[0];
        const vServicos = parseMoney(vServicosNode?.textContent);

        if (vServicos > 0) {
            const vPis = parseMoney(valuesContext.getElementsByTagName('ValorPis')[0]?.textContent);
            const vCofins = parseMoney(valuesContext.getElementsByTagName('ValorCofins')[0]?.textContent);
            const vInss = parseMoney(valuesContext.getElementsByTagName('ValorInss')[0]?.textContent);
            const vIr = parseMoney(valuesContext.getElementsByTagName('ValorIr')[0]?.textContent);
            const vCsll = parseMoney(valuesContext.getElementsByTagName('ValorCsll')[0]?.textContent);

            // Simples Nacional Check
            if (optanteSimples === '1') {
                if (vPis > 0 || vCofins > 0 || vCsll > 0) {
                     return { isValid: false, error: `Aviso de Regime Tributário: Emitente optante pelo Simples Nacional, mas há retenções federais (PIS/COFINS/CSLL) destacadas. Geralmente, empresas do Simples pagam tributos via DAS e não sofrem retenção na fonte desses tributos (exceto ISS em alguns casos).` };
                }
            } else {
                // Approximate checks for Normal Regime (Warning level via Error message prefix logic in UI if needed, currently blocking)
                // We use high tolerance because base calculation might be reduced (e.g. construction)
                // Standard: PIS 0.65%, COFINS 3%, CSLL 1%, IR 1.5%
                
                // Helper to check rate plausibility (if value exists)
                const checkRate = (val: number, standardRate: number, name: string) => {
                    if (val > 0) {
                        const calculatedRate = val / vServicos;
                        // If calculated rate is > 2x standard or simply way off (e.g. decimal error), flag it.
                        // Example: PIS is 0.65% (0.0065). If we find 6.5% (0.065), it's likely a decimal error.
                        if (calculatedRate > (standardRate * 5)) { // Very loose upper bound to catch gross errors
                            return `Erro de Cálculo Probável (${name}): O valor destacado (${val}) representa ${(calculatedRate*100).toFixed(2)}% do serviço, muito acima da alíquota padrão de ${(standardRate*100).toFixed(2)}%.`;
                        }
                    }
                    return null;
                };

                const pisErr = checkRate(vPis, 0.0065, 'PIS');
                if (pisErr) return { isValid: false, error: pisErr };

                const cofinsErr = checkRate(vCofins, 0.03, 'COFINS');
                if (cofinsErr) return { isValid: false, error: cofinsErr };

                const csllErr = checkRate(vCsll, 0.01, 'CSLL');
                if (csllErr) return { isValid: false, error: csllErr };
            }
        }

        return { isValid: true };
    }

    return { isValid: false, error: 'O arquivo XML não parece ser uma NFe, CTe ou NFSe válida. A estrutura principal não foi encontrada.' };
};

const validatePDF = async (file: File): Promise<ValidationResult> => {
    // Keywords that strongly suggest a fiscal document
    const FISCAL_KEYWORDS = [
        'CNPJ', 'DANFE', 'NFS-e', 'CT-e', 'NOTA FISCAL', 'IMPOSTO',
        'BASE DE CÁLCULO', 'ICMS', 'ISS', 'PIS', 'COFINS', 'VALOR TOTAL',
        'CHAVE DE ACESSO', 'PROTOCOLO DE AUTORIZAÇÃO'
    ];
    // Lowered count to 1 to avoid false negatives on valid PDFs where text extraction is difficult.
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
