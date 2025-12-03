
interface ValidationResult {
    isValid: boolean;
    error?: string;
    warnings?: string[]; // New field to carry non-blocking errors to the AI
}

// --- CPF Validation Algorithm (Mod 11) ---
const isValidCPF = (cpf: string): boolean => {
    const cleanCPF = cpf.replace(/\D/g, '');
    if (cleanCPF.length !== 11) return false;
    if (/^(\d)\1+$/.test(cleanCPF)) return false; 

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

const getByLocalName = (root: Element | Document, localName: string): Element[] => {
    const results: Element[] = [];
    const allElements = root.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].localName?.toLowerCase() === localName.toLowerCase()) {
            results.push(allElements[i]);
        }
    }
    return results;
};

const getContextName = (element: Element): string => {
    const parent = element.parentElement;
    if (!parent) return 'Desconhecido';
    
    const parentName = parent.localName?.toLowerCase() || '';
    
    if (parentName.includes('emit') || parentName.includes('prest')) return 'Emitente/Prestador';
    if (parentName.includes('dest') || parentName.includes('tom')) return 'Destinatário/Tomador';
    if (parentName.includes('rem')) return 'Remetente';
    if (parentName.includes('transp')) return 'Transportadora';
    
    return `<${parent.localName}>`;
};

// Returns array of warnings instead of single error string
const validateCNPJs = (doc: Document): string[] => {
    const nodes = getByLocalName(doc, 'CNPJ');
    const warnings: string[] = [];
    
    for (const node of nodes) {
        const val = node.textContent?.trim() || '';
        if (val.length === 0) continue;

        if (!isValidCNPJ(val)) {
            const context = getContextName(node);
            warnings.push(`CNPJ inválido detectado na estrutura XML (${context}): '${val}'. Dígitos verificadores incorretos.`);
        }
    }
    return warnings;
};

const validateCPFs = (doc: Document): string[] => {
    const nodes = getByLocalName(doc, 'CPF');
    const warnings: string[] = [];
    
    for (const node of nodes) {
        const val = node.textContent?.trim() || '';
        if (val.length === 0) continue;

        if (!isValidCPF(val)) {
            const context = getContextName(node);
            warnings.push(`CPF inválido detectado na estrutura XML (${context}): '${val}'. Dígitos verificadores incorretos.`);
        }
    }
    return warnings;
};

const validateNCM = (doc: Document): string[] => {
    const ncmNodes = getByLocalName(doc, 'NCM');
    const warnings: string[] = [];
    
    for (const node of ncmNodes) {
        const ncm = node.textContent?.trim() || '';
        if (ncm.length === 0) continue;

        if (!/^\d{8}$/.test(ncm)) {
            warnings.push(`Formato NCM inválido: '${ncm}'. Esperado 8 dígitos numéricos.`);
        } else {
            const chapter = parseInt(ncm.substring(0, 2), 10);
            if (chapter < 1 || chapter > 97) {
                 warnings.push(`Capítulo NCM suspeito: '${ncm}'. Inicia com '${ncm.substring(0, 2)}', esperado 01-97.`);
            }
        }
    }
    return warnings;
};

// --- CTe Specific Validation ---
const validateCTeStructure = (doc: Document): string[] => {
    const warnings: string[] = [];
    const infCte = getByLocalName(doc, 'infCte');
    
    if (infCte.length === 0) return warnings; // Not a CTe or weird structure

    // 1. Validate "Tomador do Serviço" (toma)
    // 0-Remetente, 1-Expedidor, 2-Recebedor, 3-Destinatário
    const toma = getByLocalName(doc, 'toma');
    if (toma.length === 0) {
        // Some CTe versions use <toma3> or <toma4>
        const toma3 = getByLocalName(doc, 'toma3');
        const toma4 = getByLocalName(doc, 'toma4');
        if (toma3.length === 0 && toma4.length === 0) {
            warnings.push("CTe sem indicação clara do Tomador do Serviço (<toma>, <toma3> ou <toma4>).");
        }
    }

    // 2. Validate Service Value
    const vPrest = getByLocalName(doc, 'vPrest');
    if (vPrest.length === 0) {
        warnings.push("CTe sem Valor da Prestação de Serviço (<vPrest>).");
    }

    // 3. Check for Modal (Road, Air, etc)
    const modalTag = ['rodo', 'aereo', 'aquav', 'ferrov', 'dutov', 'multimodal'].some(m => getByLocalName(doc, m).length > 0);
    if (!modalTag) {
        warnings.push("CTe sem modal de transporte identificado (Rodoviário, Aéreo, etc).");
    }

    return warnings;
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

    const hasTaxTags = [
        'NFe', 'CTe', 'Nfse', 'Rps', 'Lote', 'Prestador', 'Tomador', 'Emit', 'Dest', 'Servico', 'InfNfe', 'Tributos', 'Valores'
    ].some(tag => getByLocalName(doc, tag).length > 0 || text.includes(tag));

    if (hasTaxTags) {
         const warnings: string[] = [];
         
         warnings.push(...validateCNPJs(doc));
         warnings.push(...validateCPFs(doc));
         warnings.push(...validateNCM(doc));

         // Specific CTe checks
         if (getByLocalName(doc, 'CTe').length > 0 || text.includes('infCte')) {
             warnings.push(...validateCTeStructure(doc));
         }

         return { isValid: true, warnings };
    }

    return { isValid: false, error: 'O arquivo XML não parece ser um documento fiscal reconhecido (NFe, CTe, NFSe). Tags fiscais essenciais não foram encontradas.' };
};

const validatePDF = async (file: File): Promise<ValidationResult> => {
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
        
        return { isValid: true, warnings: [] };
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
