
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

const getByLocalName = (root: Element | Document, localName: string): Element[] => {
    const results: Element[] = [];
    const allElements = root.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
        if (allElements[i].localName === localName) {
            results.push(allElements[i]);
        }
    }
    return results;
};

const getOne = (root: Element | Document, localNames: string[]): Element | null => {
    for (const name of localNames) {
        const found = getByLocalName(root, name);
        if (found.length > 0) return found[0];
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

    // Simplified Validation: If it's valid XML and contains *some* key tax tags, let it pass to AI.
    // We don't want to be stricter than the AI's ability to interpret.
    
    const hasTaxTags = [
        'NFe', 'CTe', 'Nfse', 'Rps', 'Lote', 'Prestador', 'Tomador', 'Emit', 'Dest', 'Servico'
    ].some(tag => getByLocalName(doc, tag).length > 0 || text.includes(tag));

    if (hasTaxTags) {
         // Specific NCM Validation
         const ncmError = validateNCM(doc);
         if (ncmError) {
             return { isValid: false, error: ncmError };
         }

         return { isValid: true };
    }

    return { isValid: false, error: 'O arquivo XML não parece ser um documento fiscal reconhecido (NFe, CTe, NFSe).' };
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
