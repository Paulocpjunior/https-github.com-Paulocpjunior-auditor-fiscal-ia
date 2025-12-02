
import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { AuditResults } from './components/AuditResults';
import { Chatbot } from './components/Chatbot';
import { Footer } from './components/Footer';
import { analyzeDocument } from './services/geminiService';
import { validateFile } from './services/fileValidator';
import { fetchCompanyData, type CompanyData } from './services/cnpjService';
import type { AuditResult, UserTaxRates } from './types';
import { SparkleIcon } from './components/icons/SparkleIcon';

// PDF.js is loaded in index.html, so it's available globally on window
declare const pdfjsLib: any;

const App: React.FC = () => {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  // State to hold content for refinement
  const [currentFileContent, setCurrentFileContent] = useState<string>('');
  const [currentFileImages, setCurrentFileImages] = useState<string[]>([]);

  // State to hold official data fetched from API
  const [officialEmitterData, setOfficialEmitterData] = useState<CompanyData | null>(null);
  const [officialTakerData, setOfficialTakerData] = useState<CompanyData | null>(null);

  const handleFileAudit = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    // Currently processing the first file. Future implementations can handle queues.
    const file = files[0];
    
    setIsLoading(true);
    setError(null);
    setAuditResult(null);
    setOfficialEmitterData(null);
    setOfficialTakerData(null);
    setCurrentFile(file);
    setCurrentFileContent('');
    setCurrentFileImages([]);

    const { isValid, error: validationError } = await validateFile(file);

    if (!isValid) {
      setError(validationError || 'O arquivo enviado é inválido ou não é suportado.');
      setIsLoading(false);
      return;
    }

    try {
      let fileContent = '';
      let fileImages: string[] = []; // Array to hold Base64 images for scanned PDFs
      const fileType = file.type;
      const fileNameLower = file.name.toLowerCase();

      if (fileType.includes('pdf') || fileNameLower.endsWith('.pdf')) {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              
              let lastY = -1;
              let pageText = '';
              
              const items = textContent.items.map((item: any) => ({
                  str: item.str,
                  y: item.transform ? item.transform[5] : 0,
                  x: item.transform ? item.transform[4] : 0,
                  hasEOL: item.hasEOL
              }));

              for (const item of items) {
                  if (lastY !== -1 && Math.abs(item.y - lastY) > 8) { 
                      pageText += '\n';
                  } else if (lastY !== -1 && item.str.trim().length > 0) {
                      pageText += ' '; 
                  }
                  pageText += item.str;
                  lastY = item.y;
              }
              fullText += pageText + '\n\n';
          }
          fileContent = fullText;

          // --- SCANNED PDF DETECTION & IMAGE FALLBACK ---
          // If extracted text is very short/empty, assume it's a scanned PDF (image).
          if (fileContent.trim().length < 50) {
              console.log("PDF text content is minimal/empty. Rendering pages as images for AI Vision...");
              const numPagesToRender = Math.min(pdf.numPages, 3); // Limit to first 3 pages for performance
              
              for (let i = 1; i <= numPagesToRender; i++) {
                  const page = await pdf.getPage(i);
                  const viewport = page.getViewport({ scale: 1.5 }); // Good quality for OCR
                  const canvas = document.createElement('canvas');
                  const context = canvas.getContext('2d');
                  if (context) {
                      canvas.height = viewport.height;
                      canvas.width = viewport.width;
                      
                      await page.render({ canvasContext: context, viewport: viewport }).promise;
                      // Get clean base64 data (remove "data:image/jpeg;base64," prefix)
                      const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                      fileImages.push(base64Data);
                  }
              }
          }
      } else {
          fileContent = await file.text();
      }

      // Store content for refinement
      setCurrentFileContent(fileContent);
      setCurrentFileImages(fileImages);

      // Check if we have EITHER text OR images
      if ((!fileContent || fileContent.trim().length === 0) && fileImages.length === 0) {
        throw new Error("O conteúdo do arquivo está vazio e não foi possível converter para imagem.");
      }
      
      let companyName: string | null = null;
      let emitterCnpj: string | null = null;
      let documentDate: string | null = null;
      let takerCnpj: string | null = null;
      let takerName: string | null = null;
      let municipality: string | null = null;

      // --- EXTRACTION STRATEGY ---
      // Attempts to extract metadata only if text content is available. 
      // If it's an image-only PDF, we skip this and let Gemini do the OCR extraction.
      
      if (fileContent && fileContent.trim().length > 0 && file.name.toLowerCase().endsWith('.xml')) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(fileContent, "application/xml");
          
          const errorNode = xmlDoc.querySelector("parsererror");
          if (!errorNode) {
              const allElements = Array.from(xmlDoc.getElementsByTagName('*'));
              
              // Helper to check ancestry
              const hasAncestor = (el: Element, patterns: RegExp[]): boolean => {
                  let current: Element | null = el.parentElement;
                  while (current) {
                      for (const p of patterns) {
                          if (p.test(current.localName || '') || p.test(current.nodeName || '')) return true;
                      }
                      current = current.parentElement;
                  }
                  return false;
              };

              const emitterPatterns = [/emit/i, /prest/i];
              const takerPatterns = [/dest/i, /tomador/i, /receb/i];

              for (const el of allElements) {
                  const tag = el.localName ? el.localName.toLowerCase() : '';
                  const val = el.textContent?.trim();
                  if (!val) continue;

                  // CNPJ / CPF
                  if (tag === 'cnpj' || tag === 'cpf') {
                      if (!emitterCnpj && hasAncestor(el, emitterPatterns)) {
                          emitterCnpj = val;
                      } else if (!takerCnpj && hasAncestor(el, takerPatterns)) {
                          takerCnpj = val;
                      }
                  }
                  
                  // Names
                  if (tag === 'xnome' || tag === 'razaosocial') {
                      if (!companyName && hasAncestor(el, emitterPatterns)) {
                          companyName = val;
                      } else if (!takerName && hasAncestor(el, takerPatterns)) {
                          takerName = val;
                      }
                  }

                  // Municipality
                  if (tag === 'xmun' || tag === 'municipio' || tag === 'nomecidade') {
                      if (!municipality && hasAncestor(el, emitterPatterns)) {
                          municipality = val;
                      }
                  }

                  // Date
                  if ((tag === 'dhemi' || tag === 'demi' || tag === 'dataemissao' || tag === 'dataemissaorps') && !documentDate) {
                      documentDate = val;
                  }
              }
          }
        } catch (xmlEx) {
           console.warn("XML Scan failed:", xmlEx);
        }

        // --- REGEX FALLBACK (XML Only) ---
        if (!companyName || !emitterCnpj) {
             const findTag = (regex: RegExp, text: string) => {
                 const match = text.match(regex);
                 return match ? match[1] : null;
             };

             if (!emitterCnpj) emitterCnpj = findTag(/<(?:[\w\d]+:)?(?:CNPJ|Cnpj)[^>]*>(\d+)<\//i, fileContent); 
             
             const emitBlockMatch = fileContent.match(/<(?:[\w\d]+:)?(?:Emit|Emitente|Prestador|PrestadorServico)[\s\S]*?<\/(?:[\w\d]+:)?(?:Emit|Emitente|Prestador|PrestadorServico)>/i);
             if (emitBlockMatch) {
                 const block = emitBlockMatch[0];
                 if (!companyName) companyName = findTag(/<(?:[\w\d]+:)?(?:xNome|RazaoSocial)[^>]*>([^<]+)<\//i, block);
                 if (!municipality) municipality = findTag(/<(?:[\w\d]+:)?(?:xMun|Municipio|NomeCidade)[^>]*>([^<]+)<\//i, block);
                 if (!emitterCnpj) emitterCnpj = findTag(/<(?:[\w\d]+:)?(?:CNPJ|Cnpj|CPF|Cpf)[^>]*>([^<]+)<\//i, block);
             }

             if (!documentDate) documentDate = findTag(/<(?:[\w\d]+:)?(?:dhEmi|dEmi|DataEmissao)[^>]*>([^<]+)<\//i, fileContent);
        }
      }
      
      // Fetch official company data if CNPJs are available
      let fetchedEmitterData: CompanyData | null = null;
      let fetchedTakerData: CompanyData | null = null;

      if (emitterCnpj) {
        fetchedEmitterData = await fetchCompanyData(emitterCnpj.replace(/\D/g, ''));
        setOfficialEmitterData(fetchedEmitterData);
      }
      if (takerCnpj && takerCnpj.replace(/\D/g, '').length === 14) {
        fetchedTakerData = await fetchCompanyData(takerCnpj.replace(/\D/g, ''));
        setOfficialTakerData(fetchedTakerData);
      }

      const result = await analyzeDocument(
          fileContent, 
          file.name, 
          fileImages, // Pass images to service
          companyName, 
          documentDate, 
          takerCnpj, 
          takerName,
          fetchedEmitterData,
          fetchedTakerData,
          municipality
      );
      
      setAuditResult(result);

    } catch (err) {
      console.error("Audit Error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred during the audit.";
      setError(`Falha na auditoria do documento. ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefineAudit = useCallback(async (userRates: UserTaxRates) => {
    if (!currentFile || (!currentFileContent && currentFileImages.length === 0)) return;

    setIsLoading(true);
    // Note: We do NOT clear auditResult here to allow visual persistence while loading, or we handle it in AuditResults
    // But typically to show a full loading screen we might clear it. 
    // Given the request for better visual feedback, keeping the old result until new one is ready
    // and showing a spinner on the button is a common pattern.
    // However, the current structure renders 'loading' view if isLoading is true. 
    // Let's rely on isLoading passed to AuditResults to show spinner there if we want inline, 
    // OR allow the full screen loader. 
    // Since App logic unmounts AuditResults if isLoading is true (see return below), 
    // we must actually NOT unmount it if we want inline feedback.
    // BUT changing that logic is risky for the main flow. 
    // Let's stick to the full screen loader for now as it's consistent, but I will pass isLoading just in case
    // we change the render condition later or if AuditResults persists.
    
    // Actually, to support the user request "Improve visual feedback", keeping the form visible while processing is better.
    // But right now: {!auditResult && !isLoading} shows upload. {isLoading} shows loader. {auditResult && !isLoading} shows result.
    // So if I set isLoading=true, the result disappears and the big loader appears. This IS good feedback.
    // I will keep it as is.
    
    setAuditResult(null); 

    try {
        const result = await analyzeDocument(
            currentFileContent,
            currentFile.name,
            currentFileImages,
            auditResult?.companyName, // Reuse existing meta if available
            auditResult?.documentDate,
            auditResult?.takerCnpj,
            auditResult?.takerName,
            officialEmitterData,
            officialTakerData,
            null, // Municipality reuse complex, let AI find it again or null
            userRates // Pass user manual rates
        );
        setAuditResult(result);
    } catch (err) {
        console.error("Refinement Error:", err);
        setError("Erro ao refinar a análise. Tente novamente.");
    } finally {
        setIsLoading(false);
    }
  }, [currentFile, currentFileContent, currentFileImages, auditResult, officialEmitterData, officialTakerData]);
  
  const handleReset = () => {
    setAuditResult(null);
    setError(null);
    setCurrentFile(null);
    setCurrentFileContent('');
    setCurrentFileImages([]);
    setOfficialEmitterData(null);
    setOfficialTakerData(null);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200 flex flex-col">
      <Header />
      <main className="container mx-auto p-4 md:p-8 flex-grow">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-indigo-600 dark:text-indigo-400">Auditor Fiscal AI</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 tracking-wide">
              Desenvolvido BY - SP Assessoria Contabil
            </p>
            <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
              Faça upload de um ou mais documentos fiscais (XML ou PDF) para uma análise tributária inteligente.
            </p>
          </div>

          {!auditResult && !isLoading && <FileUpload onFileSelect={handleFileAudit} disabled={isLoading} />}
          
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
              <SparkleIcon className="w-12 h-12 text-indigo-500 animate-pulse" />
              <p className="mt-4 text-lg font-semibold text-slate-700 dark:text-slate-300">Analisando documento...</p>
              <p className="text-slate-500 dark:text-slate-400">{currentFile?.name}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 animate-pulse">
                 {currentFile?.type.includes('pdf') ? 'Extraindo dados e processando imagens...' : 'Validando estrutura, NCM e consultando bases oficiais...'}
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 my-4 text-sm text-red-800 rounded-lg bg-red-100 dark:bg-red-900 dark:text-red-300" role="alert">
              <span className="font-medium">Erro!</span> {error}
              <button onClick={handleReset} className="ml-4 font-bold underline">Tente novamente</button>
            </div>
          )}

          {auditResult && !isLoading && (
            <AuditResults 
              result={auditResult} 
              fileName={currentFile?.name || ''} 
              onReset={handleReset} 
              officialEmitterData={officialEmitterData}
              officialTakerData={officialTakerData}
              onRefine={handleRefineAudit}
              isLoading={isLoading}
            />
          )}

        </div>
      </main>
      <Chatbot auditResult={auditResult} />
      <Footer />
    </div>
  );
};

export default App;
