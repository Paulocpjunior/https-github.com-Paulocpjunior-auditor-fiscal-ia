
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
import { CheckCircleIcon } from './components/icons/CheckCircleIcon';

// PDF.js is loaded in index.html, so it's available globally on window
declare const pdfjsLib: any;

const steps = [
    { id: 1, label: 'Validação Estrutural' },
    { id: 2, label: 'Extração de Texto e Imagens (HQ)' },
    { id: 3, label: 'Consultas Externas (CNPJ/NCM)' },
    { id: 4, label: 'Análise Tributária (IA)' }
];

const LoadingStepper: React.FC<{ currentStep: number }> = ({ currentStep }) => {
    return (
        <div className="w-full max-w-md mx-auto my-8">
            {steps.map((step, index) => {
                const isCompleted = currentStep > step.id;
                const isActive = currentStep === step.id;
                
                return (
                    <div key={step.id} className="flex items-center mb-4 last:mb-0 animate-fade-in-down" style={{ animationDelay: `${index * 100}ms` }}>
                        <div className={`
                            w-8 h-8 rounded-full flex items-center justify-center mr-4 border-2 flex-shrink-0
                            ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 
                              isActive ? 'border-indigo-600 text-indigo-600 animate-pulse' : 
                              'border-slate-300 text-slate-300'}
                        `}>
                            {isCompleted ? <CheckCircleIcon className="w-5 h-5" /> : <span>{step.id}</span>}
                        </div>
                        <div className="flex-1">
                            <p className={`font-medium ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                {step.label}
                            </p>
                            {isActive && (
                                <div className="h-1 w-full bg-slate-200 rounded mt-2 overflow-hidden">
                                    <div className="h-full bg-indigo-600 animate-progress" style={{width: '100%'}}></div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
             <style>{`
                @keyframes progress {
                  0% { width: 0%; margin-left: 0; }
                  50% { width: 50%; }
                  100% { width: 100%; }
                }
                .animate-progress {
                  animation: progress 2s ease-in-out infinite;
                }
              `}</style>
        </div>
    );
};

const App: React.FC = () => {
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [loadingStep, setLoadingStep] = useState<number>(0); // 0 = Idle
  const [error, setError] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  
  const [currentFileContent, setCurrentFileContent] = useState<string>('');
  const [currentFileImages, setCurrentFileImages] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const [officialEmitterData, setOfficialEmitterData] = useState<CompanyData | null>(null);
  const [officialTakerData, setOfficialTakerData] = useState<CompanyData | null>(null);

  const isLoading = loadingStep > 0;

  const handleFileAudit = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const file = files[0];
    
    setLoadingStep(1); // Start Validation
    setError(null);
    setAuditResult(null);
    setOfficialEmitterData(null);
    setOfficialTakerData(null);
    setCurrentFile(file);
    setCurrentFileContent('');
    setCurrentFileImages([]);
    setValidationWarnings([]);

    // --- STEP 1: VALIDATION ---
    const { isValid, error: validationError, warnings } = await validateFile(file);

    if (!isValid) {
      setError(validationError || 'O arquivo enviado é inválido ou não é suportado.');
      setLoadingStep(0);
      return;
    }
    setValidationWarnings(warnings || []);

    try {
      // --- STEP 2: OCR & IMAGING ---
      setLoadingStep(2);
      await new Promise(r => setTimeout(r, 200)); 

      let fileContent = '';
      let fileImages: string[] = []; 
      const fileType = file.type;
      const fileNameLower = file.name.toLowerCase();

      if (fileType.includes('pdf') || fileNameLower.endsWith('.pdf')) {
          const arrayBuffer = await file.arrayBuffer();
          const loadingTask = pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          
          // Extract text (helpful but secondary to images for layout)
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

          // Always render images for high-quality vision analysis
          // This fixes issues with scanned PDFs or corrupt text layers
          console.log("Rendering high-res images for AI Vision...");
          const numPagesToRender = Math.min(pdf.numPages, 3); 
          for (let i = 1; i <= numPagesToRender; i++) {
              const page = await pdf.getPage(i);
              // Scale 3.0 provides excellent clarity for small text (approx 200-300 DPI equivalent)
              const viewport = page.getViewport({ scale: 3.0 }); 
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (context) {
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;
                  await page.render({ canvasContext: context, viewport: viewport }).promise;
                  const base64Data = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
                  fileImages.push(base64Data);
              }
          }

      } else {
          fileContent = await file.text();
      }

      setCurrentFileContent(fileContent);
      setCurrentFileImages(fileImages);

      if ((!fileContent || fileContent.trim().length === 0) && fileImages.length === 0) {
        throw new Error("O conteúdo do arquivo está vazio e não foi possível converter para imagem.");
      }
      
      // --- STEP 3: EXTERNAL DATA ---
      setLoadingStep(3);
      
      let companyName: string | null = null;
      let emitterCnpj: string | null = null;
      let documentDate: string | null = null;
      let takerCnpj: string | null = null;
      let takerName: string | null = null;
      let municipality: string | null = null;

      // Extract basic metadata for API calls
      if (fileContent && fileContent.trim().length > 0 && file.name.toLowerCase().endsWith('.xml')) {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(fileContent, "application/xml");
          const allElements = Array.from(xmlDoc.getElementsByTagName('*'));
          for (const el of allElements) {
              const tag = el.localName ? el.localName.toLowerCase() : '';
              const val = el.textContent?.trim();
              if (!val) continue;
              if ((tag === 'cnpj' || tag === 'cpf') && !emitterCnpj) emitterCnpj = val; 
              if ((tag === 'xnome' || tag === 'razaosocial') && !companyName) companyName = val;
              if (tag === 'dhemi' && !documentDate) documentDate = val;
          }
        } catch (e) { /* ignore */ }
      }
      
      if (!emitterCnpj) {
          const cnpjMatch = fileContent.match(/(?:CNPJ|Cnpj)[^0-9]*(\d{14})/);
          if (cnpjMatch) emitterCnpj = cnpjMatch[1];
      }

      if (emitterCnpj) {
        const fetchedEmitterData = await fetchCompanyData(emitterCnpj.replace(/\D/g, ''));
        setOfficialEmitterData(fetchedEmitterData);
      }

      // --- STEP 4: AI ANALYSIS ---
      setLoadingStep(4);
      await new Promise(r => setTimeout(r, 800)); 

      const result = await analyzeDocument(
          fileContent, 
          file.name, 
          fileImages, 
          companyName, 
          documentDate, 
          takerCnpj, 
          takerName,
          officialEmitterData,
          officialTakerData,
          municipality,
          undefined,
          warnings || []
      );
      
      setAuditResult(result);
      setLoadingStep(0); // Done

    } catch (err) {
      console.error("Audit Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido.";
      setError(`Falha na auditoria. ${errorMessage}`);
      setLoadingStep(0);
    }
  }, []);

  const handleRefineAudit = useCallback(async (userRates: UserTaxRates) => {
    if (!currentFile) return;

    setLoadingStep(4); // Reuse step 4 for refinement
    setAuditResult(null); 

    try {
        const result = await analyzeDocument(
            currentFileContent,
            currentFile.name,
            currentFileImages,
            auditResult?.provider?.name, 
            auditResult?.documentDate,
            auditResult?.taker?.cnpj,
            auditResult?.taker?.name,
            officialEmitterData,
            officialTakerData,
            null, 
            userRates,
            validationWarnings
        );
        setAuditResult(result);
    } catch (err) {
        setError("Erro ao refinar a análise.");
    } finally {
        setLoadingStep(0);
    }
  }, [currentFile, currentFileContent, currentFileImages, auditResult, officialEmitterData, officialTakerData, validationWarnings]);
  
  const handleReset = () => {
    setAuditResult(null);
    setError(null);
    setCurrentFile(null);
    setCurrentFileContent('');
    setCurrentFileImages([]);
    setOfficialEmitterData(null);
    setOfficialTakerData(null);
    setLoadingStep(0);
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
              Auditoria de NFe, NFSe (incluindo Guarulhos/GissOnline) e CTe.
            </p>
          </div>

          {!auditResult && !isLoading && <FileUpload onFileSelect={handleFileAudit} disabled={isLoading} />}
          
          {isLoading && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 p-8">
                <h3 className="text-center text-xl font-semibold mb-6">Processando Documento</h3>
                <LoadingStepper currentStep={loadingStep} />
            </div>
          )}

          {error && (
            <div className="p-4 my-4 text-sm text-red-800 rounded-lg bg-red-100 dark:bg-red-900 dark:text-red-300 border border-red-200 dark:border-red-800 shadow-sm">
              <p><strong>Erro:</strong> {error}</p>
              <button onClick={handleReset} className="mt-2 underline">Tentar novamente</button>
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
