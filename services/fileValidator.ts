
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

const getByLocalName = (root: Element | Document, localName: string): Element[] => {
    const results: Element[] = [];
    const allElements = root.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
        // Case insensitive comparison for robustness
        if (allElements[i].localName?.toLowerCase() === localName.toLowerCase()) {
            results.push(allElements[i]);
        }
    }
    return results;
};

// Helper to determine the context of an element based on its parent
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

const validateCNPJs = (doc: Document): string | null => {
    const nodes = getByLocalName(doc, 'CNPJ');
    
    for (const node of nodes) {
        const val = node.textContent?.trim() || '';
        if (val.length === 0) continue;

        if (!isValidCNPJ(val)) {
            const context = getContextName(node);
            return `CNPJ inválido encontrado (${context}): '${val}'. Verifique se os dígitos estão corretos.`;
        }
    }
    return null;
};

const validateCPFs = (doc: Document): string | null => {
    const nodes = getByLocalName(doc, 'CPF');
    
    for (const node of nodes) {
        const val = node.textContent?.trim() || '';
        if (val.length === 0) continue;

        if (!isValidCPF(val)) {
            const context = getContextName(node);
            return `CPF inválido encontrado (${context}): '${val}'. Verifique se os dígitos estão corretos.`;
        }
    }
    return null;
};

const validateNCM = (doc: Document): string | null => {
    const ncmNodes = getByLocalName(doc, 'NCM');
    
    for (const node of ncmNodes) {
        const ncm = node.textContent?.trim() || '';
        if (ncm.length === 0) continue;

        // Check 1: Must be exactly 8 digits
        if (!/^\d{8}$/.test(ncm)) {
            return `NCM inválido encontrado: '${ncm}'. O código NCM deve conter exatamente 8 dígitos numéricos (Formato: 0000.00.00).`;
        }

        // Check 2: Basic Chapter Validation (First 2 digits must be between 01 and 97)
        const chapter = parseInt(ncm.substring(0, 2), 10);
        if (chapter < 1 || chapter > 97) {
            return `NCM suspeito encontrado: '${ncm}'. O capítulo (dois primeiros dígitos: ${ncm.substring(0, 2)}) não parece corresponder a um capítulo válido da TIPI (01 a 97).`;
        }
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

    const hasTaxTags = [
        'NFe', 'CTe', 'Nfse', 'Rps', 'Lote', 'Prestador', 'Tomador', 'Emit', 'Dest', 'Servico', 'InfNfe'
    ].some(tag => getByLocalName(doc, tag).length > 0 || text.includes(tag));

    if (hasTaxTags) {
         // 1. Validate CNPJs specifically
         const cnpjError = validateCNPJs(doc);
         if (cnpjError) {
             return { isValid: false, error: cnpjError };
         }

         // 2. Validate CPFs specifically
         const cpfError = validateCPFs(doc);
         if (cpfError) {
             return { isValid: false, error: cpfError };
         }

         // 3. Specific NCM Validation
         const ncmError = validateNCM(doc);
         if (ncmError) {
             return { isValid: false, error: ncmError };
         }

         return { isValid: true };
    }

    return { isValid: false, error: 'O arquivo XML não parece ser um documento fiscal reconhecido (NFe, CTe, NFSe). Tags fiscais essenciais não foram encontradas.' };
};

const validatePDF = async (file: File): Promise<ValidationResult> => {
    // Validates PDF header magic numbers
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
        
        return { isValid: true };
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
